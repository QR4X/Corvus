import { requestUrl } from "obsidian";
import { isAbortError } from "./abort";
import {
  KeyStatus,
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
import type { WireResponse } from "./_shared";
import { isFreeOnOpenRouter, type OpenRouterEntry } from "./openrouterFree";

interface RawOpenRouterModel {
  id?: unknown;
  pricing?: Record<string, unknown>;
  architecture?: { output_modalities?: unknown };
  description?: unknown;
}

interface OpenRouterCatalog {
  data?: unknown;
}

function modelsFrom(json: unknown): OpenRouterEntry[] {
  const data = (json as OpenRouterCatalog | undefined)?.data;
  if (!Array.isArray(data)) return [];
  return (data as RawOpenRouterModel[]).filter(
    (m): m is OpenRouterEntry => typeof m?.id === "string"
  );
}
import { getModelCapabilities } from "./modelCapabilities";

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODELS_ENDPOINT = "https://openrouter.ai/api/v1/models";

const OPENROUTER_EMBEDDING_MODELS_ENDPOINT = "https://openrouter.ai/api/v1/embeddings/models";

export function nextPageUrl(json: unknown): string | null {
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

class OpenRouterProvider implements Provider {
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

    const payload = res.json as WireResponse | undefined;
    const message = payload?.choices?.[0]?.message;
    if (!message) throw new ProviderError("Empty response.", "unknown");

    const parsed = parseOpenAIChatMessage(message);
    const finishReason = payload?.choices?.[0]?.finish_reason;
    if (finishReason === "length") {
      if (parsed.toolCalls?.length) parsed.invalidToolCalls = true;
      delete parsed.toolCalls;
    }
    return { ...parsed, usage: usageFrom(payload ?? {}), finishReason };
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
      if (isAbortError(err)) throw err;

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

    const all = modelsFrom(res.json).map((m) => m.id);
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
      return keyFreeQuota(res.json);
    } catch {
      return null;
    }
  }

  async keyStatus(apiKey: string): Promise<KeyStatus | null> {
    if (!apiKey || !apiKey.trim()) return null;
    try {
      const res = await requestUrl({
        url: OPENROUTER_KEY_ENDPOINT,
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey.trim()}`, ...APP_HEADERS },
        throw: false,
      });
      if (res.status < 200 || res.status >= 300) return null;
      return keyStatusFrom(res.json);
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
      return modelsFrom(res.json)
        .filter(isFreeOnOpenRouter)
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
      for (let page = 0; url && page < 5; page++) {
        const res = await requestUrl({ url, method: "GET", headers, throw: false });
        if (res.status < 200 || res.status >= 300) break;
        ids.push(...modelsFrom(res.json).map((m) => m.id));
        url = nextPageUrl(res.json);
      }
      if (ids.length > 0) return [...new Set(ids)].sort();
    } catch { void 0; }
    try {
      const res = await requestUrl({ url: OPENROUTER_MODELS_ENDPOINT, method: "GET", headers, throw: false });
      if (res.status < 200 || res.status >= 300) return [];
      return modelsFrom(res.json)
        .map((m) => m.id)
        .filter(isEmbeddingModelId)
        .sort();
    } catch {
      return [];
    }
  }
}

const finiteNumber = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

export function keyStatusFrom(json: unknown): KeyStatus | null {
  const d = (json as { data?: Record<string, unknown> } | undefined)?.data;
  if (!d || typeof d !== "object") return null;
  const out: KeyStatus = {};
  const quota = keyFreeQuota(json);
  if (quota) {
    const f = d.free_model_daily_requests as { used?: unknown } | undefined;
    const used = finiteNumber(f?.used);
    out.free = {
      limit: quota.limit,
      ...(used != null ? { used } : {}),
      ...(quota.remaining != null ? { remaining: quota.remaining } : {}),
    };
  }
  if ("limit_remaining" in d) {
    out.creditRemaining = d.limit_remaining === null ? null : (finiteNumber(d.limit_remaining) ?? null);
  }
  if (typeof d.limit_reset === "string" && d.limit_reset) out.creditResetsAt = d.limit_reset;
  const today = finiteNumber(d.usage_daily);
  if (today != null) out.spentToday = today;
  return out;
}

export function keyFreeQuota(json: unknown): { limit: number; remaining?: number } | null {
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
