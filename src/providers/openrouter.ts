import { requestUrl } from "obsidian";
import {
  Provider,
  ProviderError,
  ProviderRequest,
  ProviderResponse,
  TokenHandler,
  UsageHandler,
  responseIssue,
} from "./base";
import { resolveMaxTokens } from "./paramPolicy";
import { isEmbeddingModelId } from "../rag/types";
import {
  buildChatBody,
  ensureOkStream,
  ensureOkRequest,
  parseOpenAIChatMessage,
  usageFrom,
  parseOpenAICompatSSE,
  hasPdfAttachment,
  fetchStream,
} from "./_shared";
import type { RespostaNoFio } from "./_shared";
import { ehGratisNoOpenRouter, ehPrecoZero, type EntradaOpenRouter } from "./openrouterFree";

export { ehGratisNoOpenRouter, ehPrecoZero };

interface ModeloOpenRouter {
  id?: unknown;
  pricing?: Record<string, unknown>;
  architecture?: { output_modalities?: unknown };
  description?: unknown;
}

interface CatalogoOpenRouter {
  data?: unknown;
}

function modelosDo(json: unknown): EntradaOpenRouter[] {
  const data = (json as CatalogoOpenRouter | undefined)?.data;
  if (!Array.isArray(data)) return [];
  return (data as ModeloOpenRouter[]).filter(
    (m): m is EntradaOpenRouter => typeof m?.id === "string"
  );
}
import { getModelCapabilities } from "./modelCapabilities";

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODELS_ENDPOINT = "https://openrouter.ai/api/v1/models";

const OPENROUTER_EMBEDDING_MODELS_ENDPOINT = "https://openrouter.ai/api/v1/embeddings/models";

export function proximaPagina(json: unknown): string | null {
  const next = (json as { links?: { next?: unknown } } | null)?.links?.next;
  return typeof next === "string" && /^https:\/\/openrouter\.ai\//.test(next) ? next : null;
}

const OPENROUTER_KEY_ENDPOINT = "https://openrouter.ai/api/v1/key";

const APP_HEADERS = {
  "HTTP-Referer": "https://github.com/QR4X/Corvus",
  "X-Title": "Corvus",
};

export function applyPdfPlugin(
  body: Record<string, unknown>,
  req: ProviderRequest
): Record<string, unknown> {
  if (!hasPdfAttachment(req.messages)) return body;
  const caps = getModelCapabilities("openrouter", req.model);
  body.plugins = [
    {
      id: "file-parser",
      pdf: { engine: caps.vision ? "native" : "cloudflare-ai" },
    },
  ];
  return body;
}

export class OpenRouterProvider implements Provider {
  id = "openrouter";
  name = "OpenRouter";

  supportsTools = true;

  async chat(req: ProviderRequest, apiKey: string): Promise<ProviderResponse> {
    if (!apiKey || !apiKey.trim()) {
      throw new ProviderError("OpenRouter API key not configured.", "no-key");
    }

    const body = applyPdfPlugin(
      buildChatBody(req, { provider: "openrouter" }),
      req
    );

    let res;
    try {
      res = await requestUrl({
        url: OPENROUTER_ENDPOINT,
        method: "POST",
        contentType: "application/json",
        headers: { Authorization: `Bearer ${apiKey.trim()}`, ...APP_HEADERS },
        body: JSON.stringify(body),
        throw: false,
      });
    } catch {
      throw new ProviderError("Connection failed.", "network");
    }
    ensureOkRequest(res, { label: "OpenRouter" });

    const corpo = res.json as RespostaNoFio | undefined;
    const message = corpo?.choices?.[0]?.message;
    if (!message) throw new ProviderError("Empty response.", "unknown");

    const parsed = parseOpenAIChatMessage(message);
    const finishReason = corpo?.choices?.[0]?.finish_reason;
    if (finishReason === "length") {
      if (parsed.toolCalls?.length) parsed.invalidToolCalls = true;
      delete parsed.toolCalls;
    }
    return { ...parsed, usage: usageFrom(corpo ?? {}), finishReason };
  }

  async streamChat(
    req: ProviderRequest,
    apiKey: string,
    onToken: TokenHandler,
    onUsage?: UsageHandler,
    signal?: AbortSignal,
    onReasoning?: (delta: string) => void
  ): Promise<ProviderResponse> {
    if (!apiKey || !apiKey.trim()) {
      throw new ProviderError("OpenRouter API key not configured.", "no-key");
    }

    const body = applyPdfPlugin(
      buildChatBody(req, {
        provider: "openrouter",
        stream: true,
        includeUsage: true,
      }),
      req
    );

    const recover = async (): Promise<ProviderResponse> => {
      if (signal?.aborted) throw new DOMException("Interrupted", "AbortError");
      req.onRecovery?.();
      if (signal?.aborted) throw new DOMException("Interrupted", "AbortError");
      const retryReq = {
        ...req,
        maxTokens: resolveMaxTokens("openrouter", req.model, Number(body.max_tokens) * 2, req.effort),
      };
      const result = await this.chat(retryReq, apiKey);

      if (result.usage && onUsage) onUsage(result.usage);
      if (signal?.aborted) throw new DOMException("Interrupted", "AbortError");
      if (result.reasoning && onReasoning) onReasoning(result.reasoning);
      if (result.content) onToken(result.content);
      return result;
    };

    let res: Response;
    try {
      res = await fetchStream(OPENROUTER_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey.trim()}`,
          ...APP_HEADERS,
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;

      return recover();
    }
    await ensureOkStream(res, { label: "OpenRouter" });
    if (!res.body) return recover();

    const parsed = await parseOpenAICompatSSE(
      res.body,
      onToken,
      onUsage,
      "openrouter_call",
      onReasoning
    );

    if (!parsed.content.trim() && !parsed.toolCalls?.length && responseIssue(parsed)) {
      const recovered = await recover();
      if (parsed.reasoning && !recovered.reasoning) recovered.reasoning = parsed.reasoning;
      return recovered;
    }

    return parsed;
  }

  async listModels(apiKey: string): Promise<string[]> {
    if (!apiKey || !apiKey.trim()) {
      throw new ProviderError("OpenRouter API key not configured.", "no-key");
    }
    const res = await requestUrl({
      url: OPENROUTER_MODELS_ENDPOINT,
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        ...APP_HEADERS,
      },
      throw: false,
    });
    if (res.status === 401) {
      throw new ProviderError("Invalid OpenRouter API key.", "invalid-key");
    }
    if (res.status < 200 || res.status >= 300) {
      throw new ProviderError(`OpenRouter: HTTP ${res.status}`, "unknown");
    }

    const all = modelosDo(res.json).map((m) => m.id);
    return all.filter(isRelevantOpenRouterModel).sort();
  }

  async freeQuota(apiKey: string): Promise<{ limit: number; remaining?: number } | null> {
    if (!apiKey || !apiKey.trim()) return null;
    try {
      const res = await requestUrl({
        url: OPENROUTER_KEY_ENDPOINT,
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey.trim()}`, ...APP_HEADERS },
        throw: false,
      });
      if (res.status < 200 || res.status >= 300) return null;
      return cotaGratisDaChave(res.json);
    } catch {
      return null;
    }
  }

  async keyStatus(apiKey: string): Promise<EstadoDaChave | null> {
    if (!apiKey || !apiKey.trim()) return null;
    try {
      const res = await requestUrl({
        url: OPENROUTER_KEY_ENDPOINT,
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey.trim()}`, ...APP_HEADERS },
        throw: false,
      });
      if (res.status < 200 || res.status >= 300) return null;
      return estadoDaChave(res.json);
    } catch {
      return null;
    }
  }

  async listFreeModels(apiKey: string): Promise<string[]> {
    if (!apiKey || !apiKey.trim()) return [];
    try {
      const res = await requestUrl({
        url: OPENROUTER_MODELS_ENDPOINT,
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey.trim()}`, ...APP_HEADERS },
        throw: false,
      });
      if (res.status < 200 || res.status >= 300) return [];
      return modelosDo(res.json)
        .filter(ehGratisNoOpenRouter)
        .map((m) => m.id)
        .filter(isRelevantOpenRouterModel)
        .sort();
    } catch {
      return [];
    }
  }

  async listEmbeddingModels(apiKey: string): Promise<string[]> {
    if (!apiKey || !apiKey.trim()) return [];
    const headers = { Authorization: `Bearer ${apiKey.trim()}`, ...APP_HEADERS };
    try {
      const ids: string[] = [];
      let url: string | null = OPENROUTER_EMBEDDING_MODELS_ENDPOINT;
      for (let pagina = 0; url && pagina < 5; pagina++) {
        const res = await requestUrl({ url, method: "GET", headers, throw: false });
        if (res.status < 200 || res.status >= 300) break;
        ids.push(...modelosDo(res.json).map((m) => m.id));
        url = proximaPagina(res.json);
      }
      if (ids.length > 0) return [...new Set(ids)].sort();
    } catch { void 0; }
    try {
      const res = await requestUrl({ url: OPENROUTER_MODELS_ENDPOINT, method: "GET", headers, throw: false });
      if (res.status < 200 || res.status >= 300) return [];
      return modelosDo(res.json)
        .map((m) => m.id)
        .filter(isEmbeddingModelId)
        .sort();
    } catch {
      return [];
    }
  }
}

export interface EstadoDaChave {

  gratis?: { limite: number; usados?: number; restantes?: number };

  creditoRestante?: number | null;

  creditoVolta?: string;

  gastoHoje?: number;
}

const numero = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

export function estadoDaChave(json: unknown): EstadoDaChave | null {
  const d = (json as { data?: Record<string, unknown> } | undefined)?.data;
  if (!d || typeof d !== "object") return null;
  const out: EstadoDaChave = {};
  const cota = cotaGratisDaChave(json);
  if (cota) {
    const f = d.free_model_daily_requests as { used?: unknown } | undefined;
    const usados = numero(f?.used);
    out.gratis = {
      limite: cota.limit,
      ...(usados != null ? { usados } : {}),
      ...(cota.remaining != null ? { restantes: cota.remaining } : {}),
    };
  }
  if ("limit_remaining" in d) {
    out.creditoRestante = d.limit_remaining === null ? null : (numero(d.limit_remaining) ?? null);
  }
  if (typeof d.limit_reset === "string" && d.limit_reset) out.creditoVolta = d.limit_reset;
  const hoje = numero(d.usage_daily);
  if (hoje != null) out.gastoHoje = hoje;
  return out;
}

export function cotaGratisDaChave(json: unknown): { limit: number; remaining?: number } | null {
  const d = (json as { data?: Record<string, unknown> } | undefined)?.data;
  if (!d || typeof d !== "object") return null;
  const f = d.free_model_daily_requests as { limit?: unknown; remaining?: unknown } | undefined;
  if (f && typeof f.limit === "number" && f.limit > 0) {
    return typeof f.remaining === "number"
      ? { limit: f.limit, remaining: f.remaining }
      : { limit: f.limit };
  }
  if (typeof d.is_free_tier === "boolean") return { limit: d.is_free_tier ? 50 : 1000 };
  return null;
}

export function isRelevantOpenRouterModel(id: string): boolean {
  if (id === "openrouter/auto") return true;
  if (id.startsWith("openrouter/")) return false; 
  if (isEmbeddingModelId(id)) return false;
  return true;
}

export const openrouterProvider = new OpenRouterProvider();
