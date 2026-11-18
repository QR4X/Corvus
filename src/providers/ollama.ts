import { requestUrl } from "obsidian";
import { isAbortError } from "./abort";
import { looksLikeOllamaEmbedding } from "../rag/types";
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

interface OllamaToolCall {
  id?: string;
  function?: { name?: string; arguments?: unknown };
}

interface OllamaMessage {
  content?: unknown;
  tool_calls?: unknown;
}

interface OllamaResponse {
  message?: OllamaMessage;
  done?: boolean;
  error?: unknown;
  prompt_eval_count?: number;
  eval_count?: number;
}

interface OllamaModelList {
  models?: Array<{ name?: unknown }>;
}

interface OpenAIMessage {
  role?: string;
  content?: unknown;
  tool_call_id?: string;
  tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: unknown } }>;
}

export function toOllamaMessages(messages: ProviderRequest["messages"]): unknown[] {
  const nameById = new Map<string, string>();
  return (toOpenAIMessages(messages) as OpenAIMessage[]).map((m) => {
    if (m.role === "assistant" && Array.isArray(m.tool_calls)) {
      return {
        role: "assistant",
        content: typeof m.content === "string" ? m.content : "",
        tool_calls: m.tool_calls.map((tc) => {
          const toolName = tc.function?.name ?? "";
          if (tc.id) nameById.set(tc.id, toolName);
          const rawArgs = tc.function?.arguments;
          let args: unknown = rawArgs ?? {};
          if (typeof rawArgs === "string") {
            try {
              args = JSON.parse(rawArgs);
            } catch {
              args = {};
            }
          }
          return { function: { name: toolName, arguments: args } };
        }),
      };
    }
    if (m.role === "tool") {
      const toolName = m.tool_call_id ? nameById.get(m.tool_call_id) : undefined;
      return { role: "tool", content: m.content, ...(toolName ? { tool_name: toolName } : {}) };
    }
    if (Array.isArray(m.content)) {
      const parts = m.content as OpenAIPart[];
      const text = parts
        .filter((p) => p.type === "text" && typeof p.text === "string")
        .map((p) => p.text as string)
        .join("\n\n");
      const images = parts
        .filter((p) => p.type === "image_url")
        .map((p) => base64FromDataUrl(p.image_url?.url ?? ""))
        .filter((b) => b !== "");
      return {
        role: m.role,
        content: text,
        ...(images.length > 0 ? { images } : {}),
      };
    }
    return m;
  });
}

interface OpenAIPart {
  type?: string;
  text?: unknown;
  image_url?: { url?: string };
}

function base64FromDataUrl(url: string): string {
  const comma = url.indexOf(",");
  if (url.startsWith("data:")) return comma >= 0 ? url.slice(comma + 1) : "";
  return /^https?:/i.test(url) ? "" : url;
}

function parseOllamaToolCalls(rawCalls: unknown): ProviderToolCall[] {
  if (!Array.isArray(rawCalls)) return [];
  const calls: ProviderToolCall[] = [];
  for (const [idx, tc] of (rawCalls as OllamaToolCall[]).entries()) {
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
    calls.push({
      id: tc.id ?? `ollama_call_${Date.now()}_${idx}`,
      name: fn.name,
      arguments: parsedArgs,
    });
  }
  return calls;
}

interface ModelShow {
  model_info?: Record<string, unknown>;
  capabilities?: unknown;
}
const showCache = new Map<string, ModelShow>();

async function fetchModelShow(
  endpoint: string,
  model: string
): Promise<ModelShow | null> {
  const key = `${endpoint}|${model}`;
  const cached = showCache.get(key);
  if (cached) return cached;
  try {
    const res = await requestUrl({
      url: `${endpoint}/api/show`,
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify({ model }),
      throw: false,
    });
    if (res.status < 200 || res.status >= 300) return null;
    const json = res.json as ModelShow | undefined;
    if (!json || typeof json !== "object") return null;
    showCache.set(key, json);
    return json;
  } catch {

    return null;
  }
}

async function modelContextLength(endpoint: string, model: string): Promise<number | undefined> {
  const info = (await fetchModelShow(endpoint, model))?.model_info;
  for (const [k, v] of Object.entries(info ?? {})) {
    if (k.endsWith(".context_length") && typeof v === "number" && v > 0) return v;
  }
  return undefined;
}

function capabilitiesOf(show: ModelShow | null): string[] | null {
  const caps = show?.capabilities;
  if (!Array.isArray(caps)) return null;
  const list = caps.filter((c): c is string => typeof c === "string");
  return list.length > 0 ? list : null;
}

export async function enrichOllamaCapabilities(
  endpoint: string,
  models: readonly string[]
): Promise<number> {
  if (!endpoint) return 0;
  let recorded = 0;
  for (const model of models) {
    if (!model) continue;
    const caps = capabilitiesOf(await fetchModelShow(endpoint, model));
    if (!caps) continue;
    recordModelInfo("ollama", model, {

      modalities: caps.includes("vision") ? ["image"] : [],
      supportsTools: caps.includes("tools"),
      source: "ollama",
      fetchedAt: new Date().toISOString(),
    });
    recorded++;
  }
  return recorded;
}

export function estimateRequestTokens(req: ProviderRequest): number {
  let chars = 0;
  let images = 0;
  for (const m of req.messages) {
    chars += m.content.length;
    if (m.toolCalls) chars += JSON.stringify(m.toolCalls).length;
    for (const a of m.attachments ?? []) if (a.type === "image") images++;
  }
  if (req.tools && req.tools.length > 0) chars += JSON.stringify(req.tools).length;
  return Math.ceil(chars / 3) + images * 1000;
}

const CONTEXT_STEPS = [8192, 16384, 32768, 65536, 131072, 262144];

export function ollamaContextSize(prompt: number, output: number, modelMax?: number): number {
  const needed = prompt + Math.min(output, 8192);
  const step =
    CONTEXT_STEPS.find((d) => d >= needed) ??
    CONTEXT_STEPS[CONTEXT_STEPS.length - 1];
  const cap = modelMax && modelMax > 0 ? modelMax : 32768;
  return Math.min(step, cap);
}

class OllamaProvider implements Provider {
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

  private async buildBody(
    req: ProviderRequest,
    endpoint: string,
    stream: boolean
  ): Promise<Record<string, unknown>> {
    const numPredict = resolveMaxTokens("ollama", req.model, req.maxTokens ?? 2000, req.effort);
    const numCtx = ollamaContextSize(
      estimateRequestTokens(req),
      numPredict,
      await modelContextLength(endpoint, req.model)
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
    const body = await this.buildBody(req, endpoint, false);

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

    const payload = res.json as OllamaResponse | undefined;
    const message = payload?.message;
    if (!message) {
      throw new ProviderError("Empty response from Ollama.", "unknown");
    }

    const parsedCalls = parseOllamaToolCalls(message.tool_calls);
    const toolCalls = parsedCalls.length > 0 ? parsedCalls : undefined;

    const content = typeof message.content === "string" ? message.content : "";
    if (!toolCalls && !content) {
      throw new ProviderError(
        "Empty response from Ollama (no text or tool_calls).",
        "unknown"
      );
    }

    const result: ProviderResponse = { content };
    if (toolCalls) result.toolCalls = toolCalls;

    if (payload?.prompt_eval_count !== undefined || payload?.eval_count !== undefined) {
      result.usage = {
        input: payload.prompt_eval_count ?? 0,
        output: payload.eval_count ?? 0,
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
    const body = await this.buildBody(req, endpoint, true);

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
          let json: OllamaResponse;
          try {
            json = JSON.parse(trimmed) as OllamaResponse;
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

          const parsed = parseOllamaToolCalls(message?.tool_calls);
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
    const models = (res.json as OllamaModelList | undefined)?.models ?? [];
    return models
      .map((m) => m?.name)
      .filter((n): n is string => typeof n === "string")
      .sort();
  }

  async listEmbeddingModels(apiKey: string): Promise<string[]> {
    const endpoint = this.getEndpoint(apiKey);
    const all = await this.listModels(apiKey);
    const byName = all.filter((m) => looksLikeOllamaEmbedding(m));
    const rest = all.filter((m) => !looksLikeOllamaEmbedding(m));
    const byCapability = await Promise.all(
      rest.map(async (model) => {
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
    return [...byName, ...byCapability.filter((m): m is string => m !== null)].sort();
  }
}

export const ollamaProvider = new OllamaProvider();
