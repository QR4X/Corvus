// src/providers/nim.ts
// Provider Nvidia NIM (Nvidia Inference Microservices) hospedado.
// Endpoint: https://integrate.api.nvidia.com/v1/chat/completions
// Auth: Bearer nvapi-... (chave do build.nvidia.com — tier free de 1k créditos)
//
// 100% OpenAI-compatible (streaming SSE, tools[], tool_choice, max_tokens),
// então reusa `toOpenAIMessages()` igual o OpenRouter. Diferença: NIM não
// exige headers extras (HTTP-Referer / X-Title).
//
// Modelos com tool calling validado:
//   - nvidia/llama-3.3-nemotron-super-49b-v1.5
//   - nvidia/llama-3.1-nemotron-ultra-253b-v1
//   - meta/llama-3.3-70b-instruct
//   - qwen/qwen3-next-80b-a3b-instruct
//   - deepseek-ai/deepseek-v4-pro
//   - microsoft/phi-4
//
// Modelos pequenos (Phi-4 mini, Llama 3.2 8b, Nemotron Nano) ignoram
// silenciosamente — o agent vai falhar com "não chamei tool".

import { requestUrl, Platform } from "obsidian";
import {
  Provider,
  ProviderError,
  ProviderRequest,
  ProviderResponse,
  TokenHandler,
  UsageHandler,
  ReasoningHandler,
  MediaGenerationRequest,
  MediaGenerationItem,
} from "./base";
import { isEmbeddingModelId } from "../rag/types";
import {
  buildChatBody,
  parseOpenAIChatMessage,
  usageFrom,
  parseOpenAICompatSSE,
} from "./_shared";
import type { RespostaNoFio } from "./_shared";

// ---- O que o NIM devolve (ver a nota em _shared.ts) ----------------------
// O chat fala OpenAI-compatible. Imagem não: cada modelo hospedado usa um
// shape diferente, e por isso os quatro campos abaixo são tentados em ordem.

/** Erro do NIM — três campos possíveis, dependendo da camada que respondeu. */
interface ErroNim {
  detail?: string;
  error?: { message?: string };
  message?: string;
}

/** Resposta de geração de imagem: quatro formas conhecidas. */
interface RespostaDeImagemNim extends ErroNim {
  artifacts?: Array<{ base64?: unknown; image?: unknown }>;
  image?: unknown;
  b64_json?: unknown;
}

interface CatalogoNim {
  data?: Array<{ id?: unknown }>;
}

// ============================================================
// SSE REAL no desktop via Node `https` (v0.1.226).
// O bloqueio do NIM nunca foi o servidor (stream:true SSE funciona) — era o
// CORS do `fetch` do renderer. No Obsidian DESKTOP (Electron com Node), o
// módulo `https` faz a request FORA do contexto de browser → sem CORS → SSE
// de verdade. No mobile (webview, sem Node) cai no pseudo-stream de sempre.
// ============================================================

// Tipos mínimos do Node (sem @types/node — não bundlamos, só usamos em runtime).
interface NodeIncomingLike {
  statusCode?: number;
  on(ev: "data", cb: (chunk: Uint8Array) => void): void;
  on(ev: "end" | "close", cb: () => void): void;
  on(ev: "error", cb: (err: Error) => void): void;
}
interface NodeRequestLike {
  on(ev: "error", cb: (err: Error) => void): void;
  end(body?: string): void;
  destroy(err?: Error): void;
  setTimeout(ms: number, cb: () => void): void;
}
interface NodeHttpsLike {
  request(
    opts: {
      protocol: string;
      hostname: string;
      port: number;
      path: string;
      method: string;
      headers: Record<string, string>;
    },
    cb: (res: NodeIncomingLike) => void
  ): NodeRequestLike;
}

/** `require("https")` do Electron, ou null (mobile / runtime sem Node). */
function getNodeHttps(): NodeHttpsLike | null {
  try {
    // `require` do Electron: no desktop ele vive no escopo da janela e é ele
    // que dá o `https` do Node pro streaming. No mobile não existe, a função
    // devolve null e quem chama cai no requestUrl (ver o guarda Platform.isMobile).
    const req = (window as unknown as { require?: (m: string) => unknown })
      .require;
    if (!req) return null;
    // v0.1.228: `window.require` pode existir e NÃO ser o require do Node
    // (algum shim do bundler/webview). Só retorna se o módulo expõe .request —
    // senão cai no fallback mobile (requestUrl) em vez de explodir adiante.
    const mod = req("https") as Partial<NodeHttpsLike> | null;
    return typeof mod?.request === "function" ? (mod as NodeHttpsLike) : null;
  } catch {
    return null;
  }
}

/** IncomingMessage do Node → ReadableStream web (pro parser SSE compartilhado). */
export function nodeBodyToWebStream(res: NodeIncomingLike): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      // v0.1.228: fecha o controller TAMBÉM no "close" — se o socket cair sem
      // emitir "end" (conexão derrubada), o stream nunca fechava e o reader
      // ficava pendurado. `closed` guarda contra double-close (end + close).
      let closed = false;
      const finish = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* já fechado */
        }
      };
      res.on("data", (chunk) => controller.enqueue(new Uint8Array(chunk)));
      res.on("end", finish);
      res.on("close", finish);
      res.on("error", (err) => controller.error(err));
    },
  });
}

/** POST com resposta STREAMADA via Node https. Aborta via signal (req.destroy). */
function nodeStreamRequest(
  https: NodeHttpsLike,
  urlStr: string,
  headers: Record<string, string>,
  body: string,
  signal?: AbortSignal,
  timeoutMs = 120_000
): Promise<{ status: number; body: ReadableStream<Uint8Array> }> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = https.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port ? Number(u.port) : 443,
        path: u.pathname + u.search,
        method: "POST",
        // Content-Length em BYTES (não chars) — TextEncoder casa com o que
        // req.end(body) realmente escreve (UTF-8). v0.1.228
        headers: { ...headers, "Content-Length": String(new TextEncoder().encode(body).length) },
      },
      (res) => {
        // v0.1.228: o abort precisa seguir vivo enquanto o body streama (abort
        // no meio do stream → req.destroy). Só removemos o listener quando o
        // body realmente termina (end/close) — senão vazava no caminho feliz.
        res.on("end", () => signal?.removeEventListener("abort", onAbort));
        res.on("close", () => signal?.removeEventListener("abort", onAbort));
        resolve({ status: res.statusCode ?? 0, body: nodeBodyToWebStream(res) });
      }
    );
    const onAbort = () => req.destroy(new Error("aborted"));
    signal?.addEventListener("abort", onAbort, { once: true });
    // v0.1.228: timeout duro — se o servidor pendurar sem responder, derruba a
    // request (o reject abaixo vira ProviderError "network" no caller).
    req.setTimeout(timeoutMs, () => req.destroy(new Error("timeout")));
    req.on("error", (err) => {
      signal?.removeEventListener("abort", onAbort);
      reject(err);
    });
    // req.end(body) escreve o corpo e finaliza numa só chamada — sem write()
    // pendente, Node cuida do drain/backpressure internamente. v0.1.228
    req.end(body);
  });
}

/** Lê um ReadableStream inteiro como texto (pro corpo de erro do stream). */
async function readAllText(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

const NIM_ENDPOINT =
  "https://integrate.api.nvidia.com/v1/chat/completions";
const NIM_MODELS_ENDPOINT = "https://integrate.api.nvidia.com/v1/models";
// Base de inference de qualquer modelo NIM hosted — usado pra Visual GenAI
// (Stable Diffusion, FLUX, etc). Endpoint específico do modelo é appended.
const NIM_INFER_BASE = "https://ai.api.nvidia.com/v1/genai";

export class NimProvider implements Provider {
  id = "nim";
  name = "Nvidia NIM";
  // OpenAI-compat puro — funciona em modelos modernos (Nemotron Super/Ultra,
  // Llama 3.3+, Qwen3+, DeepSeek v4, Phi-4 full). Modelos pequenos ignoram
  // silenciosamente — documentar no UI.
  supportsTools = true;

  /** Mapeia status HTTP do NIM → ProviderError (compartilhado chat + stream). */
  private nimError(
    status: number,
    json: { detail?: string; error?: { message?: string }; message?: string } | undefined,
    text: string | undefined,
    model: string
  ): ProviderError {
    if (status === 401 || status === 403) {
      // 403 também pode significar "Public API Endpoints" permission falta.
      const hint =
        status === 403
          ? " (Also check that your account has 'Public API Endpoints' enabled at build.nvidia.com → Organization Settings.)"
          : "";
      return new ProviderError(
        `Invalid Nvidia NIM API key or missing permission.${hint}`,
        "invalid-key"
      );
    }
    if (status === 404) {
      // 404 = modelo não existe no catálogo OU deprecado/não-hospedado.
      const apiMsg = json?.detail ?? json?.error?.message ?? "";
      return new ProviderError(
        `NIM: model "${model}" not found or not hosted. ${apiMsg}\n` +
          `In Settings → Providers → Nvidia NIM, click "Fetch from API" to see the currently available models.`,
        "unknown"
      );
    }
    if (status === 429) {
      return new ProviderError(
        "Nvidia NIM rate limit. Wait a few seconds.",
        "rate-limit"
      );
    }
    const detail =
      json?.error?.message ??
      json?.detail ??
      json?.message ??
      (typeof text === "string" ? text.slice(0, 240) : null) ??
      `HTTP ${status}`;
    return new ProviderError(`NIM (${status}): ${detail}`, "unknown");
  }

  async chat(req: ProviderRequest, apiKey: string): Promise<ProviderResponse> {
    if (!apiKey || !apiKey.trim()) {
      throw new ProviderError(
        "Nvidia NIM API key not configured. Create one at build.nvidia.com (prefix 'nvapi-').",
        "no-key"
      );
    }

    const body = buildChatBody(req, { provider: "nim" });

    let res;
    try {
      res = await requestUrl({
        url: NIM_ENDPOINT,
        method: "POST",
        contentType: "application/json",
        headers: {
          // NIM expects standard OpenAI-style headers. Accept JSON pra
          // garantir que o servidor não responda com text/event-stream
          // em algum modo confuso quando stream:false.
          Authorization: `Bearer ${apiKey.trim()}`,
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        throw: false,
      });
    } catch (err) {
      console.error("[corvus] NIM network error:", err);
      throw new ProviderError("NIM connection failed.", "network");
    }

    // Log de diagnóstico — facilita debug quando user reporta "não funciona"
    if (res.status < 200 || res.status >= 300) {
      // v0.1.228: requestUrl já parseia JSON em res.json — logar res.json ?? text
      // direto evita o re-parse redundante do IIFE (text fatiado p/ não poluir).
      console.error(
        "[corvus] NIM response failed:",
        res.status,
        res.json ?? (typeof res.text === "string" ? res.text.slice(0, 500) : res.text)
      );
      throw this.nimError(
        res.status,
        res.json as ErroNim | undefined,
        res.text,
        req.model
      );
    }

    const corpo = res.json as RespostaNoFio | undefined;
    const message = corpo?.choices?.[0]?.message;
    if (!message) throw new ProviderError("Empty response from NIM.", "unknown");
    const { content, toolCalls, reasoning, invalidToolCalls } = parseOpenAIChatMessage(message);
    if (invalidToolCalls) {
      throw new ProviderError("NIM returned invalid tool-call arguments. No tools were executed.", "unknown");
    }
    if (!toolCalls && !content) {
      throw new ProviderError("Empty response from NIM (no text or tool_calls).", "unknown");
    }
    return { content, toolCalls, usage: usageFrom(corpo ?? {}), reasoning };
  }

  /**
   * Streaming do NIM (v0.1.226):
   *   DESKTOP → SSE REAL via Node `https`. O servidor sempre suportou
   *   stream:true; o bloqueio era só o CORS do `fetch` do renderer. O módulo
   *   `https` do Electron faz a request fora do contexto de browser → CORS não
   *   se aplica → tokens chegam de verdade, um a um. Abort via req.destroy().
   *   MOBILE (webview, sem Node) → pseudo-stream via requestUrl (de sempre):
   *   resposta inteira de uma vez, abort checado antes/depois.
   */
  async streamChat(
    req: ProviderRequest,
    apiKey: string,
    onToken: TokenHandler,
    onUsage?: UsageHandler,
    signal?: AbortSignal,
    onReasoning?: ReasoningHandler
  ): Promise<ProviderResponse> {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    if (!apiKey || !apiKey.trim()) {
      throw new ProviderError(
        "Nvidia NIM API key not configured. Create one at build.nvidia.com (prefix 'nvapi-').",
        "no-key"
      );
    }

    const https = Platform.isMobile ? null : getNodeHttps();
    if (https) {
      return this.streamViaNode(https, req, apiKey, onToken, onUsage, signal, onReasoning);
    }

    // ── Fallback MOBILE: pseudo-stream (reusa a chat() via requestUrl).
    const response = await this.chat(req, apiKey);
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    // Reasoning (DeepSeek R1 e afins) vem inteiro no non-stream — roteia ANTES
    // do texto, igual à ordem dos deltas num stream real. v0.1.225
    if (response.reasoning && onReasoning) {
      onReasoning(response.reasoning);
    }
    if (response.content) {
      onToken(response.content);
    }
    if (response.usage && onUsage) {
      onUsage(response.usage);
    }
    // Retorna a resposta completa pra Agent loop poder consumir tool_calls.
    return response;
  }

  /** SSE real via Node https (desktop). Retry sem stream_options se o modelo
   *  recusar (alguns NIM antigos 400am em params desconhecidos). */
  private async streamViaNode(
    https: NodeHttpsLike,
    req: ProviderRequest,
    apiKey: string,
    onToken: TokenHandler,
    onUsage?: UsageHandler,
    signal?: AbortSignal,
    onReasoning?: ReasoningHandler,
    includeUsage = true
  ): Promise<ProviderResponse> {
    const body = buildChatBody(req, { provider: "nim", stream: true, includeUsage });
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey.trim()}`,
      Accept: "text/event-stream",
    };

    let resp: { status: number; body: ReadableStream<Uint8Array> };
    try {
      resp = await nodeStreamRequest(https, NIM_ENDPOINT, headers, JSON.stringify(body), signal);
    } catch (err) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      console.error("[corvus] NIM stream network error:", err);
      throw new ProviderError("NIM connection failed.", "network");
    }

    if (resp.status < 200 || resp.status >= 300) {
      const text = await readAllText(resp.body).catch(() => "");
      let json: ErroNim | undefined;
      try {
        json = JSON.parse(text) as ErroNim;
      } catch {
        /* corpo não-JSON */
      }
      // Modelo recusou stream_options? Tenta 1× sem (param novo p/ NIM antigo).
      // v0.1.228: um 400 aqui é REJEIÇÃO de request — nada foi gerado, então o
      // resend não duplica custo. Casamos "stream_options" e qualquer 400 que
      // mencione "stream"/parâmetro/argumento, pois nem todo NIM nomeia o campo.
      if (
        includeUsage &&
        resp.status === 400 &&
        /stream_options|stream|param|argument|unexpected|unrecognized/i.test(text)
      ) {
        return this.streamViaNode(https, req, apiKey, onToken, onUsage, signal, onReasoning, false);
      }
      console.error("[corvus] NIM stream failed:", resp.status, json ?? text);
      throw this.nimError(resp.status, json, text, req.model);
    }

    try {
      return await parseOpenAICompatSSE(resp.body, onToken, onUsage, "nim_call", onReasoning);
    } catch (err) {
      // req.destroy() no abort derruba o reader com erro — normaliza pra
      // AbortError (o caller trata como "parado pelo user").
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      throw err;
    }
  }

  /**
   * Gera imagem via NIM Visual GenAI (Stable Diffusion 3, FLUX, SDXL).
   * Endpoint: https://ai.api.nvidia.com/v1/genai/{publisher}/{model}
   *
   * Confirmado via webfetch (docs.api.nvidia.com/nim/reference/stabilityai-stable-diffusion-3-medium-infer):
   *  - URL contém publisher/model na path
   *  - Body inclui: prompt, mode="text-to-image", aspect_ratio, cfg_scale,
   *    steps, seed, output_format ("png"|"jpeg"), optional negative_prompt
   *  - Stable Diffusion 3 também exige `model: "sd3"` no body além da URL
   *
   * Response: dois shapes possíveis dependendo do modelo:
   *   { artifacts: [{ base64: "...", finishReason: "SUCCESS" }] } (SDXL/FLUX clássicos)
   *   { image: "base64..." } (alguns modelos)
   *   Ambos suportados.
   */
  async generateImage(
    request: MediaGenerationRequest,
    apiKey: string
  ): Promise<MediaGenerationItem[]> {
    if (!apiKey || !apiKey.trim()) {
      throw new ProviderError("Nvidia NIM API key not configured.", "no-key");
    }
    const url = `${NIM_INFER_BASE}/${request.model}`;
    const aspectRatio = sizeToAspectRatio(request.size);
    const body: Record<string, unknown> = {
      prompt: request.prompt,
      mode: "text-to-image",
      aspect_ratio: aspectRatio,
      cfg_scale: 5,
      steps: 50,
      seed: request.seed ?? 0,
      output_format: "png",
      negative_prompt: "",
    };
    // Stable Diffusion 3 family exige `model: "sd3"` no body (docs oficiais).
    // Outros modelos ignoram.
    if (request.model.includes("stable-diffusion-3")) {
      body.model = "sd3";
    }
    let res;
    try {
      res = await requestUrl({
        url,
        method: "POST",
        contentType: "application/json",
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        throw: false,
      });
    } catch (err) {
      console.error("[corvus] NIM image gen network error:", err);
      throw new ProviderError("NIM image gen connection failed.", "network");
    }
    if (res.status < 200 || res.status >= 300) {
      console.error("[corvus] NIM image gen failed:", res.status, res.json ?? res.text);
      const erro = res.json as ErroNim | undefined;
      const detail =
        erro?.detail ??
        erro?.error?.message ??
        erro?.message ??
        (typeof res.text === "string" ? res.text.slice(0, 280) : null) ??
        `HTTP ${res.status}`;
      throw new ProviderError(`NIM image gen (${res.status}): ${detail}`, "unknown");
    }
    // Várias APIs com shapes diferentes — tenta os mais comuns
    const items: MediaGenerationItem[] = [];
    const imagem = res.json as RespostaDeImagemNim | undefined;
    const artifacts = imagem?.artifacts;
    if (Array.isArray(artifacts)) {
      for (const a of artifacts) {
        const b64 =
          typeof a?.base64 === "string"
            ? a.base64
            : typeof a?.image === "string"
              ? a.image
              : null;
        if (b64) items.push({ data: base64ToBytes(b64), mime: "image/png" });
      }
    }
    if (items.length === 0 && typeof imagem?.image === "string") {
      items.push({ data: base64ToBytes(imagem.image), mime: "image/png" });
    }
    if (items.length === 0 && typeof imagem?.b64_json === "string") {
      items.push({ data: base64ToBytes(imagem.b64_json), mime: "image/png" });
    }
    if (items.length === 0) {
      console.error("[corvus] NIM unknown response shape:", res.json);
      throw new ProviderError(
        `NIM returned no images — check whether "${request.model}" supports text-to-image. See the DevTools console for the raw response.`,
        "unknown"
      );
    }
    return items;
  }

  /** Lista modelos NIM disponíveis no endpoint hospedado. Filtra prefixos relevantes. */
  async listModels(apiKey: string): Promise<string[]> {
    if (!apiKey || !apiKey.trim()) {
      throw new ProviderError(
        "Nvidia NIM API key not configured.",
        "no-key"
      );
    }
    const res = await requestUrl({
      url: NIM_MODELS_ENDPOINT,
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
      throw: false,
    });
    if (res.status === 401 || res.status === 403) {
      throw new ProviderError("Invalid Nvidia NIM API key.", "invalid-key");
    }
    if (res.status < 200 || res.status >= 300) {
      throw new ProviderError(`NIM: HTTP ${res.status}`, "unknown");
    }
    const all: string[] = ((res.json as CatalogoNim | undefined)?.data ?? [])
      .map((m) => m?.id)
      .filter((id): id is string => typeof id === "string");
    return all.filter(isRelevantNimModel).sort();
  }

  /** Modelos de EMBEDDING do catálogo (pro RAG). Graceful: [] em erro/no-key. */
  async listEmbeddingModels(apiKey: string): Promise<string[]> {
    if (!apiKey || !apiKey.trim()) return [];
    try {
      const res = await requestUrl({
        url: NIM_MODELS_ENDPOINT,
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey.trim()}` },
        throw: false,
      });
      if (res.status < 200 || res.status >= 300) return [];
      const all: string[] = ((res.json as CatalogoNim | undefined)?.data ?? [])
        .map((m) => m?.id)
        .filter((id): id is string => typeof id === "string");
      return all.filter(isEmbeddingModelId).sort();
    } catch {
      return [];
    }
  }

  /**
   * Os modelos GRÁTIS de verdade no NIM: os marcados "Free Endpoint" no
   * catálogo da NVIDIA (o filtro `nimType:nim_type_preview` do
   * build.nvidia.com). O /v1/models lista tudo que o endpoint serve —
   * inclusive o que NÃO é do tier grátis — e não traz preço nenhum; a marca só
   * existe no catálogo público, que não pede chave. Em out/2026 eram 20 dos 81
   * modelos da API.
   *
   * Graceful: [] em erro — sem o catálogo, o fetch não cai por isso.
   */
  async listFreeModels(_apiKey: string): Promise<string[]> {
    const ids = new Set<string>();
    try {
      for (let page = 0; page < 5; page++) {
        const q = JSON.stringify({
          query: "*:*",
          page,
          pageSize: 100,
          filters: [{ field: "nimType", value: "nim_type_preview" }],
        });
        const res = await requestUrl({
          url: `${NGC_CATALOGO}?q=${encodeURIComponent(q)}`,
          method: "GET",
          throw: false,
        });
        if (res.status < 200 || res.status >= 300) break;
        const { ids: pagina, total } = gratisDoCatalogoNvidia(res.json);
        for (const id of pagina) ids.add(id);
        if (pagina.length === 0 || (page + 1) * 100 >= total) break;
      }
    } catch {
      // Sem o catálogo: segue sem a lista.
    }
    return Array.from(ids).sort();
  }
}

/** O catálogo público da NVIDIA — o mesmo que o build.nvidia.com consulta pra
 *  marcar "Free Endpoint". Não precisa de chave. */
const NGC_CATALOGO = "https://api.ngc.nvidia.com/v2/search/catalog/resources/ENDPOINT";

interface RecursoDoCatalogo {
  name?: unknown;
  labels?: unknown;
}

interface EtiquetaDoCatalogo {
  key?: unknown;
  values?: unknown;
  unresolvedValues?: unknown;
}

/**
 * Os ids GRÁTIS numa página do catálogo da NVIDIA. O id da API é
 * `publisher/nome` (o publisher vem numa etiqueta), e o "_" do catálogo vira
 * "." como na API (`riva-translate-4b-instruct-v1_1` → `…-v1.1`). Só entra o
 * que tem a marca "Free Endpoint" no próprio registro: se o filtro da busca
 * um dia deixar de valer, nada vira grátis por engano. O grupo "_scored" só
 * repete os primeiros resultados.
 */
export function gratisDoCatalogoNvidia(json: unknown): { ids: string[]; total: number } {
  const j = json as { resultTotal?: unknown; results?: unknown } | undefined;
  const grupos = Array.isArray(j?.results)
    ? (j.results as Array<{ groupValue?: unknown; resources?: unknown }>)
    : [];
  const ids = new Set<string>();
  for (const g of grupos) {
    if (g?.groupValue === "_scored" || !Array.isArray(g?.resources)) continue;
    for (const r of g.resources as RecursoDoCatalogo[]) {
      if (typeof r?.name !== "string") continue;
      const etiquetas = Array.isArray(r.labels) ? (r.labels as EtiquetaDoCatalogo[]) : [];
      const valores = (e: EtiquetaDoCatalogo | undefined, campo: "values" | "unresolvedValues") =>
        Array.isArray(e?.[campo]) ? (e[campo] as unknown[]).filter((v): v is string => typeof v === "string") : [];
      const marcadoGratis = etiquetas.some(
        (e) =>
          valores(e, "unresolvedValues").includes("nim_type_preview") ||
          valores(e, "values").includes("Free Endpoint")
      );
      const publisher = valores(etiquetas.find((e) => e?.key === "publisher"), "values")[0];
      if (!marcadoGratis || !publisher) continue;
      ids.add(`${publisher}/${r.name}`.toLowerCase().replace(/_/g, "."));
    }
  }
  const total = typeof j?.resultTotal === "number" ? j.resultTotal : ids.size;
  return { ids: Array.from(ids), total };
}

/**
 * Filtro de modelos NIM relevantes pro plugin.
 *
 * Auditoria v0.1.225: a ALLOWLIST de publishers escondia modelos válidos de
 * publishers fora dela — ex: "openai/gpt-oss-120b" e "ibm/granite-*" são
 * hospedados no NIM e NÃO apareciam. Estratégia invertida: aceita TUDO que
 * tem formato publisher/model e exclui só componentes de pipeline
 * (embedding/rerank/retriever), ASR/voz de baixo nível e visão NeMo — que
 * não fazem sentido na UI de chat.
 */
export function isRelevantNimModel(id: string): boolean {
  // Catálogo NIM é sempre publisher/model — sem "/" não é um modelo servível.
  if (!id.includes("/")) return false;
  const excludeKeywords = [
    "embed", // embedding/embedqa
    "rerank",
    "retriever",
    "parakeet", // ASR
    "canary", // ASR
    "fastpitch", // TTS de baixo nível
    "riva", // pipeline de voz
    "studiovoice",
    "maxine",
    "ocdrnet", // OCR
    "paddleocr",
    "vista", // NeMo vision pipeline
  ];
  if (excludeKeywords.some((kw) => id.includes(kw))) return false;
  return true;
}

/** Helper: mapeia size canonical → aspect_ratio do NIM Visual GenAI. */
function sizeToAspectRatio(size?: string): string {
  switch (size) {
    case "1024x1792": return "9:16";
    case "1792x1024": return "16:9";
    case "512x512":
    case "1024x1024":
    case undefined:
    case "auto":
      return "1:1";
    default: return "1:1";
  }
}

/** Decode base64 → Uint8Array. Tolera data-URL e whitespace; lança
 *  ProviderError em base64 inválido (atob throw) em vez de explodir cru. v0.1.228 */
function base64ToBytes(b64: string): Uint8Array {
  // Alguns modelos devolvem "data:image/png;base64,...." em vez de base64 puro;
  // strip do prefixo + whitespace antes do atob (que é estrito).
  const clean = b64.replace(/^data:[^;]*;base64,/, "").replace(/\s/g, "");
  let bin: string;
  try {
    bin = atob(clean);
  } catch {
    throw new ProviderError("NIM returned an image in an invalid format.", "unknown");
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export const nimProvider = new NimProvider();
