import { requestUrl } from "obsidian";
import { isAbortError } from "./abort";
import { pareceEmbeddingDoOllama } from "../rag/types";
import {
  Provider,
  ProviderError,
  ProviderRequest,
  ProviderResponse,
  ProviderToolCall,
  TokenHandler,
  UsageHandler,
  ReasoningHandler,
} from "./base";
import { resolveTemperature, resolveMaxTokens } from "./paramPolicy";
import { recordModelInfo } from "./modelInfoStore";
import {
  toOpenAIMessages,
  ensureOkRequest,
  ensureOkStream,
  fetchStream,
} from "./_shared";

interface ToolCallOllama {
  id?: string;
  function?: { name?: string; arguments?: unknown };
}

interface MensagemOllama {
  content?: unknown;
  tool_calls?: unknown;
}

interface RespostaOllama {
  message?: MensagemOllama;
  done?: boolean;
  error?: unknown;
  prompt_eval_count?: number;
  eval_count?: number;
}

interface CatalogoOllama {
  models?: Array<{ name?: unknown }>;
}

interface MensagemOpenAI {
  role?: string;
  content?: unknown;
  tool_call_id?: string;
  tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: unknown } }>;
}

export function toOllamaMessages(messages: ProviderRequest["messages"]): unknown[] {
  const nomePorId = new Map<string, string>();
  return (toOpenAIMessages(messages) as MensagemOpenAI[]).map((m) => {
    if (m.role === "assistant" && Array.isArray(m.tool_calls)) {
      return {
        role: "assistant",
        content: typeof m.content === "string" ? m.content : "",
        tool_calls: m.tool_calls.map((tc) => {
          const nome = tc.function?.name ?? "";
          if (tc.id) nomePorId.set(tc.id, nome);
          const bruto = tc.function?.arguments;
          let args: unknown = bruto ?? {};
          if (typeof bruto === "string") {
            try {
              args = JSON.parse(bruto);
            } catch {
              args = {};
            }
          }
          return { function: { name: nome, arguments: args } };
        }),
      };
    }
    if (m.role === "tool") {
      const nome = m.tool_call_id ? nomePorId.get(m.tool_call_id) : undefined;
      return { role: "tool", content: m.content, ...(nome ? { tool_name: nome } : {}) };
    }
    if (Array.isArray(m.content)) {
      const partes = m.content as ParteOpenAI[];
      const texto = partes
        .filter((p) => p.type === "text" && typeof p.text === "string")
        .map((p) => p.text as string)
        .join("\n\n");
      const imagens = partes
        .filter((p) => p.type === "image_url")
        .map((p) => base64DaDataUrl(p.image_url?.url ?? ""))
        .filter((b) => b !== "");
      return {
        role: m.role,
        content: texto,
        ...(imagens.length > 0 ? { images: imagens } : {}),
      };
    }
    return m;
  });
}

interface ParteOpenAI {
  type?: string;
  text?: unknown;
  image_url?: { url?: string };
}

function base64DaDataUrl(url: string): string {
  const virgula = url.indexOf(",");
  if (url.startsWith("data:")) return virgula >= 0 ? url.slice(virgula + 1) : "";
  return /^https?:/i.test(url) ? "" : url;
}

function toolCallsDoOllama(brutas: unknown): ProviderToolCall[] {
  if (!Array.isArray(brutas)) return [];
  const saida: ProviderToolCall[] = [];
  for (const [idx, tc] of (brutas as ToolCallOllama[]).entries()) {
    const fn = tc?.function;
    if (!fn?.name) continue;
    const raw = fn.arguments;
    let parsedArgs: Record<string, unknown> = {};
    if (raw && typeof raw === "object") {

      parsedArgs = raw as Record<string, unknown>;
    } else if (typeof raw === "string") {

      try {
        parsedArgs = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        parsedArgs = { _raw: raw };
      }
    }
    saida.push({
      id: tc.id ?? `ollama_call_${Date.now()}_${idx}`,
      name: fn.name,
      arguments: parsedArgs,
    });
  }
  return saida;
}

interface MostraDoModelo {
  model_info?: Record<string, unknown>;
  capabilities?: unknown;
}
const mostraConhecida = new Map<string, MostraDoModelo>();

async function mostraDoModelo(
  endpoint: string,
  model: string
): Promise<MostraDoModelo | null> {
  const chave = `${endpoint}|${model}`;
  const sabido = mostraConhecida.get(chave);
  if (sabido) return sabido;
  try {
    const res = await requestUrl({
      url: `${endpoint}/api/show`,
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify({ model }),
      throw: false,
    });
    if (res.status < 200 || res.status >= 300) return null;
    const json = res.json as MostraDoModelo | undefined;
    if (!json || typeof json !== "object") return null;
    mostraConhecida.set(chave, json);
    return json;
  } catch {

    return null;
  }
}

async function contextoDoModelo(endpoint: string, model: string): Promise<number | undefined> {
  const info = (await mostraDoModelo(endpoint, model))?.model_info;
  for (const [k, v] of Object.entries(info ?? {})) {
    if (k.endsWith(".context_length") && typeof v === "number" && v > 0) return v;
  }
  return undefined;
}

function capacidadesDe(mostra: MostraDoModelo | null): string[] | null {
  const caps = mostra?.capabilities;
  if (!Array.isArray(caps)) return null;
  const lista = caps.filter((c): c is string => typeof c === "string");
  return lista.length > 0 ? lista : null;
}

export async function enriquecerCapacidadesOllama(
  endpoint: string,
  models: readonly string[]
): Promise<number> {
  if (!endpoint) return 0;
  let gravados = 0;
  for (const model of models) {
    if (!model) continue;
    const caps = capacidadesDe(await mostraDoModelo(endpoint, model));
    if (!caps) continue;
    recordModelInfo("ollama", model, {

      modalities: caps.includes("vision") ? ["image"] : [],
      supportsTools: caps.includes("tools"),
      source: "ollama",
      fetchedAt: new Date().toISOString(),
    });
    gravados++;
  }
  return gravados;
}

export function tokensDoPedido(req: ProviderRequest): number {
  let chars = 0;
  let imagens = 0;
  for (const m of req.messages) {
    chars += m.content.length;
    if (m.toolCalls) chars += JSON.stringify(m.toolCalls).length;
    for (const a of m.attachments ?? []) if (a.type === "image") imagens++;
  }
  if (req.tools && req.tools.length > 0) chars += JSON.stringify(req.tools).length;
  return Math.ceil(chars / 3) + imagens * 1000;
}

const DEGRAUS_DE_CONTEXTO = [8192, 16384, 32768, 65536, 131072, 262144];

export function contextoDoOllama(prompt: number, resposta: number, maxModelo?: number): number {
  const precisa = prompt + Math.min(resposta, 8192);
  const degrau =
    DEGRAUS_DE_CONTEXTO.find((d) => d >= precisa) ??
    DEGRAUS_DE_CONTEXTO[DEGRAUS_DE_CONTEXTO.length - 1];
  const teto = maxModelo && maxModelo > 0 ? maxModelo : 32768;
  return Math.min(degrau, teto);
}

export class OllamaProvider implements Provider {
  id = "ollama";
  name = "Ollama";

  supportsTools = true;

  private getEndpoint(apiKey: string): string {

    const DEFAULT = "http://localhost:11434";

    if (!apiKey.trim()) {
      throw new ProviderError(
        "Set your Ollama server address first (Settings → Providers → Ollama, usually http://localhost:11434).",
        "unknown"
      );
    }
    const url = apiKey.trim().replace(/\/$/, "");

    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        console.warn(`[Ollama] Endpoint has invalid scheme (${parsed.protocol}), using ${DEFAULT}.`);
        return DEFAULT;
      }
    } catch {
      console.warn(`[Ollama] Invalid endpoint ("${url}"), using ${DEFAULT}.`);
      return DEFAULT;
    }
    return url;
  }

  private async corpo(
    req: ProviderRequest,
    endpoint: string,
    stream: boolean
  ): Promise<Record<string, unknown>> {
    const numPredict = resolveMaxTokens("ollama", req.model, req.maxTokens ?? 2000, req.effort);
    const numCtx = contextoDoOllama(
      tokensDoPedido(req),
      numPredict,
      await contextoDoModelo(endpoint, req.model)
    );
    const temp = resolveTemperature("ollama", req.model, req.temperature);

    const body: Record<string, unknown> = {
      model: req.model,
      messages: toOllamaMessages(req.messages),
      stream,
      options: {
        num_predict: numPredict,
        num_ctx: numCtx,
        ...(temp !== undefined ? { temperature: temp } : {}),
      },
    };
    if (req.tools && req.tools.length > 0) {
      body.tools = req.tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));

    }
    return body;
  }

  async chat(req: ProviderRequest, apiKey: string): Promise<ProviderResponse> {
    const endpoint = this.getEndpoint(apiKey);
    const body = await this.corpo(req, endpoint, false);

    let res;
    try {
      res = await requestUrl({
        url: `${endpoint}/api/chat`,
        method: "POST",
        contentType: "application/json",
        body: JSON.stringify(body),
        throw: false,
      });
    } catch {
      throw new ProviderError(
        `Connection to Ollama at ${endpoint} failed. Make sure the server is running.`,
        "network"
      );
    }

    ensureOkRequest(res, { label: "Ollama" });

    const corpo = res.json as RespostaOllama | undefined;
    const message = corpo?.message;
    if (!message) {
      throw new ProviderError("Empty response from Ollama.", "unknown");
    }

    const lidas = toolCallsDoOllama(message.tool_calls);
    const toolCalls = lidas.length > 0 ? lidas : undefined;

    const content = typeof message.content === "string" ? message.content : "";
    if (!toolCalls && !content) {
      throw new ProviderError(
        "Empty response from Ollama (no text or tool_calls).",
        "unknown"
      );
    }

    const result: ProviderResponse = { content };
    if (toolCalls) result.toolCalls = toolCalls;

    if (corpo?.prompt_eval_count !== undefined || corpo?.eval_count !== undefined) {
      result.usage = {
        input: corpo.prompt_eval_count ?? 0,
        output: corpo.eval_count ?? 0,
      };
    }
    return result;
  }

  async streamChat(
    req: ProviderRequest,
    apiKey: string,
    onToken: TokenHandler,
    onUsage?: UsageHandler,
    signal?: AbortSignal,

    _onReasoning?: ReasoningHandler
  ): Promise<ProviderResponse> {
    const endpoint = this.getEndpoint(apiKey);
    const body = await this.corpo(req, endpoint, true);

    let res: Response;
    try {
      res = await fetchStream(`${endpoint}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      if (isAbortError(err)) throw err;
      throw new ProviderError(
        `Connection to Ollama at ${endpoint} failed. Is the server running?`,
        "network"
      );
    }

    await ensureOkStream(res, { label: "Ollama" });
    if (!res.body) {
      throw new ProviderError("Empty stream from Ollama.", "unknown");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let accumulatedText = "";
    let usage: { input: number; output: number } | undefined;

    let lastToolCalls: ProviderToolCall[] = [];

    try {
      while (true) {

        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let json: RespostaOllama;
          try {
            json = JSON.parse(trimmed) as RespostaOllama;
          } catch {

            continue;
          }

          if (typeof json.error === "string" && json.error) {
            throw new ProviderError(`Ollama: ${json.error}`, "unknown");
          }
          const message = json?.message;
          const token = message?.content;
          if (typeof token === "string" && token.length > 0) {
            accumulatedText += token;
            onToken(token);
          }

          const parsed = toolCallsDoOllama(message?.tool_calls);
          if (parsed.length > 0) lastToolCalls = parsed;
          if (json?.done === true) {
            usage = {
              input: json.prompt_eval_count ?? 0,
              output: json.eval_count ?? 0,
            };
            if (onUsage) onUsage(usage);
            const result: ProviderResponse = { content: accumulatedText };
            if (lastToolCalls.length > 0) result.toolCalls = lastToolCalls;
            if (usage) result.usage = usage;
            return result;
          }
        }
      }
    } finally {
      try { reader.releaseLock(); } catch { void 0; }
    }
    const result: ProviderResponse = { content: accumulatedText };
    if (lastToolCalls.length > 0) result.toolCalls = lastToolCalls;
    if (usage) result.usage = usage;
    return result;
  }

  async listModels(apiKey: string): Promise<string[]> {
    const endpoint = this.getEndpoint(apiKey);
    let res;
    try {
      res = await requestUrl({
        url: `${endpoint}/api/tags`,
        method: "GET",
        throw: false,
      });
    } catch {
      throw new ProviderError(
        `Connection to Ollama at ${endpoint} failed.`,
        "network"
      );
    }
    if (res.status < 200 || res.status >= 300) {
      throw new ProviderError(`Ollama: HTTP ${res.status}`, "unknown");
    }
    const models = (res.json as CatalogoOllama | undefined)?.models ?? [];
    return models
      .map((m) => m?.name)
      .filter((n): n is string => typeof n === "string")
      .sort();
  }

  async listEmbeddingModels(apiKey: string): Promise<string[]> {
    const endpoint = this.getEndpoint(apiKey);
    const todos = await this.listModels(apiKey);
    const porNome = todos.filter((m) => pareceEmbeddingDoOllama(m));
    const resto = todos.filter((m) => !pareceEmbeddingDoOllama(m));
    const porCapacidade = await Promise.all(
      resto.map(async (model) => {
        try {
          const res = await requestUrl({
            url: `${endpoint}/api/show`,
            method: "POST",
            contentType: "application/json",
            body: JSON.stringify({ model }),
            throw: false,
          });
          const caps = (res.json as { capabilities?: unknown } | undefined)?.capabilities;
          return Array.isArray(caps) && caps.includes("embedding") ? model : null;
        } catch {
          return null;
        }
      })
    );
    return [...porNome, ...porCapacidade.filter((m): m is string => m !== null)].sort();
  }
}

export const ollamaProvider = new OllamaProvider();
