import { requestUrl } from "obsidian";
import { isAbortError } from "./abort";
import {
  Provider,
  ProviderError,
  ProviderRequest,
  ProviderResponse,
  TokenHandler,
  UsageHandler,
  MediaGenerationRequest,
  MediaGenerationItem,
} from "./base";
import { isEmbeddingModelId } from "../rag/types";
import {
  buildChatBody,
  ensureOkStream,
  ensureOkRequest,
  parseOpenAIChatMessage,
  usageFrom,
  parseOpenAICompatSSE,
  streamFallbackToChat,
  fetchStream,
} from "./_shared";
import type { ErroNoFio, RespostaNoFio } from "./_shared";

interface ParteDeImagem {
  inlineData?: { data: string; mimeType: string };
  inline_data?: { data: string; mime_type: string };
  text?: string;
}

interface RespostaDeImagem extends ErroNoFio {
  candidates?: Array<{ content?: { parts?: ParteDeImagem[] } }>;
}

interface RespostaImagen extends ErroNoFio {
  predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }>;
}

interface CatalogoGemini {
  data?: Array<{ id?: unknown }>;
}

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const GEMINI_MODELS_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/openai/models";

const GEMINI_NATIVE_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export function isGeminiBillingError(
  status: number,
  message: string,
  context: "chat" | "image"
): boolean {
  const m = (message || "").toLowerCase();
  if (
    m.includes("billed users") ||
    m.includes("paid tier") ||
    m.includes("only available on the paid") ||
    m.includes("only accessible to billed") ||
    m.includes("billing") ||
    m.includes("failed_precondition") ||
    m.includes("free tier") ||
    m.includes("free_tier")
  ) {
    return true;
  }
  if (
    context === "image" &&
    status === 429 &&
    (m.includes("quota") || m.includes("credit"))
  ) {
    return true;
  }
  return false;
}

export class GeminiProvider implements Provider {
  id = "gemini";
  name = "Gemini";

  supportsTools = true;

  async chat(req: ProviderRequest, apiKey: string): Promise<ProviderResponse> {
    if (!apiKey || !apiKey.trim()) {
      throw new ProviderError("Gemini API key not configured.", "no-key");
    }
    const body = buildChatBody(req, { provider: "gemini" });

    let res;
    try {
      res = await requestUrl({
        url: GEMINI_ENDPOINT,
        method: "POST",
        contentType: "application/json",
        headers: { Authorization: `Bearer ${apiKey.trim()}` },
        body: JSON.stringify(body),
        throw: false,
      });
    } catch {
      throw new ProviderError("Connection failed.", "network");
    }

    if (res.status >= 400) {
      const detail = (res.json as ErroNoFio | undefined)?.error?.message ?? "";
      if (isGeminiBillingError(res.status, detail, "chat")) {
        throw new ProviderError(`Gemini billing: ${detail}`, "billing");
      }
    }
    ensureOkRequest(res, { label: "Gemini", authStatuses: [401, 403] });

    const corpo = res.json as RespostaNoFio | undefined;
    const message = corpo?.choices?.[0]?.message;
    if (!message) throw new ProviderError("Empty response from Gemini.", "unknown");
    const { content, toolCalls, invalidToolCalls } = parseOpenAIChatMessage(message);
    if (invalidToolCalls) {
      throw new ProviderError("Gemini returned invalid tool-call arguments. No tools were executed.", "unknown");
    }
    if (!toolCalls && !content) {
      throw new ProviderError("Empty response from Gemini (no text or tool_calls).", "unknown");
    }
    return { content, toolCalls, usage: usageFrom(corpo ?? {}) };
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
      throw new ProviderError(
        "Gemini API key not configured. Create one at aistudio.google.com/apikey.",
        "no-key"
      );
    }

    const body = buildChatBody(req, {
      provider: "gemini",
      stream: true,
      includeUsage: true,
    });

    let res: Response;
    try {
      res = await fetchStream(GEMINI_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      if (isAbortError(err)) throw err;

      return streamFallbackToChat(
        () => this.chat(req, apiKey),
        onToken,
        onUsage,
        onReasoning
      );
    }

    if (!res.ok) {

      try {
        const j = (await res.clone().json()) as ErroNoFio;
        const msg = j?.error?.message;
        if (typeof msg === "string" && isGeminiBillingError(res.status, msg, "chat")) {
          throw new ProviderError(`Gemini billing: ${msg}`, "billing");
        }
      } catch (err) {
        if (err instanceof ProviderError) throw err;

      }
    }
    await ensureOkStream(res, { label: "Gemini", authStatuses: [401, 403] });
    if (!res.body) throw new ProviderError("Empty stream from Gemini.", "unknown");

    return parseOpenAICompatSSE(res.body, onToken, onUsage, "gemini_call", onReasoning);
  }

  async generateImage(
    request: MediaGenerationRequest,
    apiKey: string
  ): Promise<MediaGenerationItem[]> {
    if (!apiKey || !apiKey.trim()) {
      throw new ProviderError(
        "Gemini API key not configured.",
        "no-key"
      );
    }

    if (request.model.startsWith("imagen-")) {
      return this.generateWithImagen(request, apiKey);
    }

    const url = `${GEMINI_NATIVE_BASE}/${encodeURIComponent(request.model)}:generateContent`;

    const inputParts: Array<Record<string, unknown>> = [{ text: request.prompt }];
    if (request.image) {
      inputParts.push({
        inline_data: {
          mime_type: request.image.mimeType,
          data: request.image.data,
        },
      });
    }
    const body = {
      contents: [{ parts: inputParts }],
      generation_config: {
        response_modalities: ["TEXT", "IMAGE"],
        ...(request.seed != null ? { seed: request.seed } : {}),
      },
    };
    let res;
    try {
      res = await requestUrl({
        url,
        method: "POST",
        contentType: "application/json",
        headers: { "x-goog-api-key": apiKey.trim() },
        body: JSON.stringify(body),
        throw: false,
      });
    } catch (err) {
      console.error("[corvus] Gemini image gen network error:", err);
      throw new ProviderError("Connection failed.", "network");
    }
    if (res.status < 200 || res.status >= 300) {
      const detail =
        (res.json as ErroNoFio | undefined)?.error?.message ??
        (typeof res.text === "string" ? res.text.slice(0, 240) : null) ??
        `HTTP ${res.status}`;
      console.error("[corvus] Gemini image gen failed:", res.status, res.json ?? res.text);
      if (res.status === 401 || res.status === 403) {
        throw new ProviderError("Invalid Gemini API key.", "invalid-key");
      }

      if (isGeminiBillingError(res.status, detail, "image")) {
        throw new ProviderError(`Gemini billing: ${detail}`, "billing");
      }
      if (res.status === 429) {
        throw new ProviderError("Gemini rate limit.", "rate-limit");
      }
      throw new ProviderError(`Gemini images (${res.status}): ${detail}`, "unknown");
    }

    const imagem = res.json as RespostaDeImagem | undefined;
    const parts: ParteDeImagem[] =
      imagem?.candidates?.[0]?.content?.parts ?? [];
    const items: MediaGenerationItem[] = [];
    let textAccum = "";
    for (const p of parts) {
      const inline = p.inlineData ?? (
        p.inline_data
          ? { data: p.inline_data.data, mimeType: p.inline_data.mime_type }
          : null
      );
      if (inline?.data) {
        const data = base64ToBytes(inline.data);
        items.push({
          data,
          mime: inline.mimeType || "image/png",
        });
      } else if (p.text) {
        textAccum += p.text;
      }
    }
    if (items.length === 0) {

      throw new ProviderError(
        `Gemini "${request.model}" returned no images. ` +
          `Confirmed image gen models: gemini-2.5-flash-image (Nano Banana), imagen-3.0-generate-002.`,
        "unknown"
      );
    }

    if (textAccum && items[0]) items[0].text = textAccum;
    return items;
  }

  private async generateWithImagen(
    request: MediaGenerationRequest,
    apiKey: string
  ): Promise<MediaGenerationItem[]> {

    const url = `${GEMINI_NATIVE_BASE}/${encodeURIComponent(request.model)}:predict`;
    const body = {
      instances: [{ prompt: request.prompt }],
      parameters: {
        sampleCount: request.n ?? 1,
        aspectRatio: sizeToImagenAspect(request.size),
        personGeneration: "allow_adult",
      },
    };
    let res;
    try {
      res = await requestUrl({
        url,
        method: "POST",
        contentType: "application/json",
        headers: { "x-goog-api-key": apiKey.trim() },
        body: JSON.stringify(body),
        throw: false,
      });
    } catch (err) {
      console.error("[corvus] Imagen network error:", err);
      throw new ProviderError("Connection failed.", "network");
    }
    if (res.status < 200 || res.status >= 300) {
      const detail =
        (res.json as ErroNoFio | undefined)?.error?.message ??
        (typeof res.text === "string" ? res.text.slice(0, 240) : null) ??
        `HTTP ${res.status}`;
      console.error("[corvus] Imagen gen failed:", res.status, res.json ?? res.text);
      if (res.status === 401 || res.status === 403) {
        throw new ProviderError("Invalid Gemini API key.", "invalid-key");
      }
      if (isGeminiBillingError(res.status, detail, "image")) {
        throw new ProviderError(`Gemini billing: ${detail}`, "billing");
      }
      if (res.status === 429) {
        throw new ProviderError("Gemini rate limit.", "rate-limit");
      }
      throw new ProviderError(`Imagen (${res.status}): ${detail}`, "unknown");
    }
    const preds = (res.json as RespostaImagen | undefined)?.predictions ?? [];
    const items: MediaGenerationItem[] = [];
    for (const p of preds) {
      if (p.bytesBase64Encoded) {
        items.push({
          data: base64ToBytes(p.bytesBase64Encoded),
          mime: p.mimeType || "image/png",
        });
      }
    }
    if (items.length === 0) {
      throw new ProviderError(
        `Imagen "${request.model}" returned no images (response has no predictions).`,
        "unknown"
      );
    }
    return items;
  }

  async listModels(apiKey: string): Promise<string[]> {
    if (!apiKey || !apiKey.trim()) {
      throw new ProviderError(
        "Gemini API key not configured.",
        "no-key"
      );
    }
    const res = await requestUrl({
      url: GEMINI_MODELS_ENDPOINT,
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
      throw: false,
    });
    if (res.status === 401 || res.status === 403) {
      throw new ProviderError("Invalid Gemini API key.", "invalid-key");
    }
    if (res.status < 200 || res.status >= 300) {
      throw new ProviderError(`Gemini: HTTP ${res.status}`, "unknown");
    }

    const all: string[] = ((res.json as CatalogoGemini | undefined)?.data ?? [])
      .map((m) => m?.id)
      .filter((id): id is string => typeof id === "string");
    return all
      .map((id) => (id.startsWith("models/") ? id.slice(7) : id))
      .filter(isRelevantGeminiModel)
      .sort();
  }

  async listEmbeddingModels(apiKey: string): Promise<string[]> {
    if (!apiKey || !apiKey.trim()) return [];
    try {
      const res = await requestUrl({
        url: GEMINI_MODELS_ENDPOINT,
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey.trim()}` },
        throw: false,
      });
      if (res.status < 200 || res.status >= 300) return [];

      const all: string[] = ((res.json as CatalogoGemini | undefined)?.data ?? [])
        .map((m) => m?.id)
        .filter((id): id is string => typeof id === "string");
      return all
        .map((id) => (id.startsWith("models/") ? id.slice(7) : id))
        .filter(isEmbeddingModelId)
        .sort();
    } catch {
      return [];
    }
  }
}

function isRelevantGeminiModel(id: string): boolean {

  if (id.startsWith("gemini-")) {
    if (id.includes("embedding") || id.includes("aqa") || id.includes("live")) return false;
    return true;
  }

  if (id.startsWith("imagen-")) return true;

  if (id.startsWith("veo")) return true;
  return false;
}

function sizeToImagenAspect(size?: string): string {
  switch (size) {
    case "1024x1792":
      return "9:16";
    case "1792x1024":
      return "16:9";
    case "512x512":
    case "1024x1024":
    case "auto":
    case undefined:
      return "1:1";
    default:
      return "1:1";
  }
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export const geminiProvider = new GeminiProvider();
