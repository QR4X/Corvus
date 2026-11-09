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

interface ErroNim {
  detail?: string;
  error?: { message?: string };
  message?: string;
}

interface RespostaDeImagemNim extends ErroNim {
  artifacts?: Array<{ base64?: unknown; image?: unknown }>;
  image?: unknown;
  b64_json?: unknown;
}

interface CatalogoNim {
  data?: Array<{ id?: unknown }>;
}

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

function getNodeHttps(): NodeHttpsLike | null {
  try {

    const req = (window as unknown as { require?: (m: string) => unknown })
      .require;
    if (!req) return null;

    const mod = req("https") as Partial<NodeHttpsLike> | null;
    return typeof mod?.request === "function" ? (mod as NodeHttpsLike) : null;
  } catch {
    return null;
  }
}

export function nodeBodyToWebStream(res: NodeIncomingLike): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {

      let closed = false;
      const finish = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch { void 0; }
      };
      res.on("data", (chunk) => controller.enqueue(new Uint8Array(chunk)));
      res.on("end", finish);
      res.on("close", finish);
      res.on("error", (err) => controller.error(err));
    },
  });
}

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

        headers: { ...headers, "Content-Length": String(new TextEncoder().encode(body).length) },
      },
      (res) => {

        res.on("end", () => signal?.removeEventListener("abort", onAbort));
        res.on("close", () => signal?.removeEventListener("abort", onAbort));
        resolve({ status: res.statusCode ?? 0, body: nodeBodyToWebStream(res) });
      }
    );
    const onAbort = () => req.destroy(new Error("aborted"));
    signal?.addEventListener("abort", onAbort, { once: true });

    req.setTimeout(timeoutMs, () => req.destroy(new Error("timeout")));
    req.on("error", (err) => {
      signal?.removeEventListener("abort", onAbort);
      reject(err);
    });

    req.end(body);
  });
}

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

const NIM_INFER_BASE = "https://ai.api.nvidia.com/v1/genai";

export class NimProvider implements Provider {
  id = "nim";
  name = "Nvidia NIM";

  supportsTools = true;

  private nimError(
    status: number,
    json: { detail?: string; error?: { message?: string }; message?: string } | undefined,
    text: string | undefined,
    model: string
  ): ProviderError {
    if (status === 401 || status === 403) {

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

    if (res.status < 200 || res.status >= 300) {

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

    const response = await this.chat(req, apiKey);
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    if (response.reasoning && onReasoning) {
      onReasoning(response.reasoning);
    }
    if (response.content) {
      onToken(response.content);
    }
    if (response.usage && onUsage) {
      onUsage(response.usage);
    }

    return response;
  }

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
      } catch { void 0; }

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

      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      throw err;
    }
  }

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
    } catch { void 0; }
    return Array.from(ids).sort();
  }
}

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

export function isRelevantNimModel(id: string): boolean {

  if (!id.includes("/")) return false;
  const excludeKeywords = [
    "embed", 
    "rerank",
    "retriever",
    "parakeet", 
    "canary", 
    "fastpitch", 
    "riva", 
    "studiovoice",
    "maxine",
    "ocdrnet", 
    "paddleocr",
    "vista", 
  ];
  if (excludeKeywords.some((kw) => id.includes(kw))) return false;
  return true;
}

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

function base64ToBytes(b64: string): Uint8Array {

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
