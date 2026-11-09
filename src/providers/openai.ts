import { requestUrl } from "obsidian";
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
  ehRecusaDeRaciocinioComFerramentas,
  lembrarSemRaciocinioComFerramentas,
} from "./paramPolicy";
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

export { toOpenAIMessages, finalizeOpenAIResponse } from "./_shared";
import type { ErroNoFio, RespostaNoFio } from "./_shared";

interface ItemDeImagem {
  b64_json?: string;
  url?: string;
  revised_prompt?: string;
}

interface RespostaDeImagemOpenAI extends ErroNoFio {
  data?: unknown;
}

interface CatalogoOpenAI {
  data?: Array<{ id?: unknown }>;
}

const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";

function recusouRaciocinioComFerramentas(
  err: unknown,
  body: Record<string, unknown>,
  model: string
): boolean {
  if (!(err instanceof ProviderError)) return false;
  if (!body.tools || body.reasoning_effort === undefined || body.reasoning_effort === "none") {
    return false;
  }
  if (!ehRecusaDeRaciocinioComFerramentas(err.message)) return false;
  lembrarSemRaciocinioComFerramentas(model);
  body.reasoning_effort = "none";
  return true;
}
const OPENAI_MODELS_ENDPOINT = "https://api.openai.com/v1/models";
const OPENAI_IMAGES_ENDPOINT = "https://api.openai.com/v1/images/generations";
const OPENAI_AUDIO_SPEECH_ENDPOINT = "https://api.openai.com/v1/audio/speech";

export class OpenAIProvider implements Provider {
  id = "openai";
  name = "OpenAI";
  supportsTools = true;

  async chat(req: ProviderRequest, apiKey: string): Promise<ProviderResponse> {
    if (!apiKey || !apiKey.trim()) {
      throw new ProviderError("OpenAI API key not configured.", "no-key");
    }
    const body = buildChatBody(req, {
      provider: "openai",
      maxTokensField: "max_completion_tokens", 
    });

    const pedir = async () => {
      let r;
      try {
        r = await requestUrl({
          url: OPENAI_ENDPOINT,
          method: "POST",
          contentType: "application/json",
          headers: { Authorization: `Bearer ${apiKey.trim()}` },
          body: JSON.stringify(body),
          throw: false,
        });
      } catch {
        throw new ProviderError("Connection failed. Check your internet.", "network");
      }
      ensureOkRequest(r, { label: "OpenAI" });
      return r;
    };
    let res;
    try {
      res = await pedir();
    } catch (err) {
      if (!recusouRaciocinioComFerramentas(err, body, req.model)) throw err;
      res = await pedir();
    }

    const corpo = res.json as RespostaNoFio | undefined;
    const message = corpo?.choices?.[0]?.message;
    if (!message) throw new ProviderError("Empty response from OpenAI.", "unknown");
    const { content, toolCalls, invalidToolCalls } = parseOpenAIChatMessage(message);
    if (invalidToolCalls) {
      throw new ProviderError("OpenAI returned invalid tool-call arguments. No tools were executed.", "unknown");
    }
    if (!toolCalls && !content) {
      throw new ProviderError("Empty response from OpenAI (no text or tool_calls).", "unknown");
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
        "OpenAI API key not configured. Go to Settings → Corvus to paste your key.",
        "no-key"
      );
    }

    const body = buildChatBody(req, {
      provider: "openai",
      stream: true,
      includeUsage: true,
      maxTokensField: "max_completion_tokens",
    });

    const abrir = () =>
      fetchStream(OPENAI_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify(body),
        signal,
      });
    let res: Response;
    try {
      res = await abrir();
    } catch (err) {

      if (err instanceof DOMException && err.name === "AbortError") throw err;

      return streamFallbackToChat(
        () => this.chat(req, apiKey),
        onToken,
        onUsage,
        onReasoning
      );
    }
    try {
      await ensureOkStream(res, { label: "OpenAI" });
    } catch (err) {
      if (!recusouRaciocinioComFerramentas(err, body, req.model)) throw err;
      res = await abrir();
      await ensureOkStream(res, { label: "OpenAI" });
    }
    if (!res.body) throw new ProviderError("Empty stream from OpenAI.", "unknown");

    return parseOpenAICompatSSE(res.body, onToken, onUsage, "openai_call", onReasoning);
  }

  async generateImage(
    request: MediaGenerationRequest,
    apiKey: string
  ): Promise<MediaGenerationItem[]> {
    if (!apiKey || !apiKey.trim()) {
      throw new ProviderError("OpenAI API key not configured.", "no-key");
    }
    const isGptImage = request.model.startsWith("gpt-image");
    const isDallE3 = request.model.startsWith("dall-e-3");

    const body: Record<string, unknown> = {
      model: request.model,
      prompt: request.prompt,
      n: request.n ?? 1,
      size: request.size && request.size !== "auto" ? request.size : "1024x1024",
    };

    if (!isGptImage) {
      body.response_format = "b64_json";
    }

    if (isDallE3) body.n = 1;

    let res;
    let attempt = 0;
    const MAX_ATTEMPTS = 3;
    while (attempt < MAX_ATTEMPTS) {
      attempt++;
      try {
        res = await requestUrl({
          url: OPENAI_IMAGES_ENDPOINT,
          method: "POST",
          contentType: "application/json",
          headers: { Authorization: `Bearer ${apiKey.trim()}` },
          body: JSON.stringify(body),
          throw: false,
        });
      } catch (err) {
        console.error("[corvus] OpenAI image gen network error:", err);
        throw new ProviderError("Connection failed during generation.", "network");
      }
      if (res.status < 500 || attempt >= MAX_ATTEMPTS) break;

      console.warn(`[corvus] OpenAI image gen ${res.status}, retry ${attempt}/${MAX_ATTEMPTS}`);
      await new Promise((r) => window.setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
    }
    if (!res) {
      throw new ProviderError("OpenAI images: no response.", "unknown");
    }
    if (res.status < 200 || res.status >= 300) {
      console.error("[corvus] OpenAI image gen failed:", res.status, res.json ?? res.text);
    }
    if (res.status === 401) {
      throw new ProviderError("Invalid API key.", "invalid-key");
    }
    if (res.status === 403) {

      const apiMsg = (res.json as ErroNoFio | undefined)?.error?.message ?? "";
      const isOrgIssue = /verif|organization/i.test(apiMsg);
      if (isOrgIssue || isGptImage) {
        throw new ProviderError(
          `OpenAI: organization not verified for ${request.model}. ` +
            `Go to platform.openai.com → Settings → Organization → General → "Verify Organization" ` +
            `(requires a phone + valid ID). After verifying, wait up to 30 min and try again.`,
          "invalid-key"
        );
      }
      throw new ProviderError(`OpenAI: access denied. ${apiMsg}`, "invalid-key");
    }
    if (res.status === 429) {
      throw new ProviderError("OpenAI rate limit.", "rate-limit");
    }
    if (res.status >= 500) {
      throw new ProviderError(
        `OpenAI server issue (${res.status}). ` +
          `May be a temporary incident — check status.openai.com. ` +
          `Retried ${MAX_ATTEMPTS} times with backoff.`,
        "unknown"
      );
    }
    if (res.status < 200 || res.status >= 300) {
      const msg =
        (res.json as ErroNoFio | undefined)?.error?.message ??
        (typeof res.text === "string" ? res.text.slice(0, 240) : null) ??
        `HTTP ${res.status}`;
      throw new ProviderError(`OpenAI images (${res.status}): ${msg}`, "unknown");
    }
    const items = (res.json as RespostaDeImagemOpenAI | undefined)?.data;
    if (!Array.isArray(items) || items.length === 0) {
      throw new ProviderError("OpenAI: response had no images (empty data).", "unknown");
    }

    const sizeRequested = request.size && request.size !== "auto" ? body.size as string : "";
    const [width, height] = parseSize(sizeRequested);
    return (items as ItemDeImagem[]).map((it) => {
      const b64 = it.b64_json ?? "";
      if (!b64) {

        throw new ProviderError(
          "OpenAI: image returned without b64_json (url only). URL fetch not implemented.",
          "unknown"
        );
      }
      const data = base64ToBytes(b64);
      return {
        data,
        mime: "image/png",
        width,
        height,
        text: it.revised_prompt,
      };
    });
  }

  async generateAudio(
    request: MediaGenerationRequest,
    apiKey: string
  ): Promise<MediaGenerationItem[]> {
    if (!apiKey || !apiKey.trim()) {
      throw new ProviderError("OpenAI API key not configured.", "no-key");
    }
    const body: Record<string, unknown> = {
      model: request.model,
      input: request.prompt,
      voice: request.voice ?? "alloy",
      response_format: "mp3",
    };
    let res;
    try {
      res = await requestUrl({
        url: OPENAI_AUDIO_SPEECH_ENDPOINT,
        method: "POST",
        contentType: "application/json",
        headers: { Authorization: `Bearer ${apiKey.trim()}` },
        body: JSON.stringify(body),
        throw: false,
      });
    } catch {
      throw new ProviderError("TTS connection failed.", "network");
    }
    if (res.status === 401) {
      throw new ProviderError("Invalid API key.", "invalid-key");
    }
    if (res.status === 429) {
      throw new ProviderError("OpenAI TTS rate limit.", "rate-limit");
    }
    if (res.status < 200 || res.status >= 300) {
      const msg =
        (res.json as ErroNoFio | undefined)?.error?.message ?? `HTTP ${res.status}`;
      throw new ProviderError(`OpenAI TTS: ${msg}`, "unknown");
    }

    const buf = res.arrayBuffer;
    const data = new Uint8Array(buf);
    return [{ data, mime: "audio/mpeg" }];
  }

  async listModels(apiKey: string): Promise<string[]> {
    if (!apiKey || !apiKey.trim()) {
      throw new ProviderError("OpenAI API key not configured.", "no-key");
    }
    const res = await requestUrl({
      url: OPENAI_MODELS_ENDPOINT,
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
      throw: false,
    });
    if (res.status === 401) {
      throw new ProviderError("Invalid API key.", "invalid-key");
    }
    if (res.status < 200 || res.status >= 300) {
      throw new ProviderError(`OpenAI: HTTP ${res.status}`, "unknown");
    }

    const all: string[] = ((res.json as CatalogoOpenAI | undefined)?.data ?? [])
      .map((m) => m?.id)
      .filter((id): id is string => typeof id === "string");
    return all.filter(isRelevantOpenAIModel).sort();
  }

  async listEmbeddingModels(apiKey: string): Promise<string[]> {
    if (!apiKey || !apiKey.trim()) return [];
    try {
      const res = await requestUrl({
        url: OPENAI_MODELS_ENDPOINT,
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey.trim()}` },
        throw: false,
      });
      if (res.status < 200 || res.status >= 300) return [];
      const all: string[] = ((res.json as CatalogoOpenAI | undefined)?.data ?? [])
        .map((m) => m?.id)
        .filter((id): id is string => typeof id === "string");
      return all.filter(isEmbeddingModelId).sort();
    } catch {
      return [];
    }
  }
}

export function isRelevantOpenAIModel(id: string): boolean {

  if (id.startsWith("dall-e") || id.startsWith("gpt-image")) return true;
  if (id === "tts-1" || id === "tts-1-hd" || id.startsWith("gpt-4o-mini-tts"))
    return true;

  if (
    /^gpt-(3\.5-turbo|4|5)/.test(id) ||
    /^chatgpt-/.test(id) ||
    /^o[0-9]+(-|$)/.test(id)
  ) {
    const excludeKeywords = [
      "audio",
      "realtime",
      "transcribe",
      "search",
      "vision", 
      "instruct", 
      "moderation",
      "tts", 
    ];
    return !excludeKeywords.some((kw) => id.includes(kw));
  }
  return false;
}

function parseSize(s: string): [number | undefined, number | undefined] {
  const m = /^(\d+)x(\d+)$/.exec(s);
  if (!m) return [undefined, undefined];
  return [parseInt(m[1], 10), parseInt(m[2], 10)];
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export const openaiProvider = new OpenAIProvider();
