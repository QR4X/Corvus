import { requestUrl } from "obsidian";
import { ProviderError } from "./base";

export const OPENAI_TRANSCRIBE_ENDPOINT =
  "https://api.openai.com/v1/audio/transcriptions";
export const OPENROUTER_TRANSCRIBE_ENDPOINT =
  "https://openrouter.ai/api/v1/audio/transcriptions";

export const TRANSCRIBE_MAX_BYTES = 25 * 1024 * 1024;

export type MultipartField =
  | { name: string; value: string }
  | {
      name: string;
      filename: string;
      contentType: string;
      data: Uint8Array;
    };

export function buildMultipartBody(
  fields: MultipartField[],
  boundary = `----corvus${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
): { body: ArrayBuffer; contentType: string } {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  for (const f of fields) {
    if ("value" in f) {
      chunks.push(
        enc.encode(
          `--${boundary}\r\nContent-Disposition: form-data; name="${f.name}"\r\n\r\n${f.value}\r\n`
        )
      );
      continue;
    }
    chunks.push(
      enc.encode(
        `--${boundary}\r\nContent-Disposition: form-data; name="${f.name}"; filename="${f.filename}"\r\n` +
          `Content-Type: ${f.contentType}\r\n\r\n`
      )
    );
    chunks.push(f.data);
    chunks.push(enc.encode("\r\n"));
  }
  chunks.push(enc.encode(`--${boundary}--\r\n`));

  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return {
    body: out.buffer.slice(0, total),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

export function audioMimeFor(path: string): string {
  const ext = (path.split(".").pop() ?? "").toLowerCase();
  switch (ext) {
    case "mp3":
      return "audio/mpeg";
    case "m4a":
    case "mp4":
      return "audio/mp4";
    case "ogg":
      return "audio/ogg";
    case "wav":
      return "audio/wav";
    default:
      return "audio/webm";
  }
}

export interface TranscribeOptions {
  apiKey: string;

  provider?: "openai" | "openrouter";

  endpoint?: string;

  model: string;
  data: Uint8Array;

  filename: string;

  language?: string;
}

export interface TranscribeCredentialSettings {
  openaiApiKey?: string;
  openrouterApiKey?: string;
  defaultProvider?: string;
}

export interface TranscribeCredential {
  apiKey: string;
  provider: "openai" | "openrouter";
}

export function getTranscriptionCredential(
  settings: TranscribeCredentialSettings
): TranscribeCredential | null {
  const oai = settings.openaiApiKey?.trim();
  const or = settings.openrouterApiKey?.trim();
  if (oai && or) {
    if (settings.defaultProvider === "openrouter") {
      return { apiKey: or, provider: "openrouter" };
    }
    return { apiKey: oai, provider: "openai" };
  }
  if (oai) return { apiKey: oai, provider: "openai" };
  if (or) return { apiKey: or, provider: "openrouter" };
  return null;
}

export async function transcribeAudio(
  opts: TranscribeOptions
): Promise<string> {
  if (!opts.apiKey?.trim()) {
    throw new ProviderError("OpenAI or OpenRouter API key not configured.", "no-key");
  }
  if (opts.data.byteLength === 0) {
    throw new ProviderError("Empty audio file.", "unknown");
  }
  if (opts.data.byteLength > TRANSCRIBE_MAX_BYTES) {
    throw new ProviderError("Audio file too large (max 25MB).", "unknown");
  }

  const isRouter =
    opts.provider === "openrouter" ||
    Boolean(opts.endpoint && opts.endpoint.includes("openrouter.ai")) ||
    (!opts.provider && opts.apiKey.trim().startsWith("sk-or-"));

  const endpoint =
    opts.endpoint ??
    (isRouter ? OPENROUTER_TRANSCRIBE_ENDPOINT : OPENAI_TRANSCRIBE_ENDPOINT);

  const model = isRouter
    ? opts.model.includes("/")
      ? opts.model
      : `openai/${opts.model}`
    : opts.model.replace(/^openai\//, "");

  const fields: MultipartField[] = [
    { name: "model", value: model },
    {
      name: "file",
      filename: opts.filename,
      contentType: audioMimeFor(opts.filename),
      data: opts.data,
    },
  ];
  if (opts.language) fields.push({ name: "language", value: opts.language });

  const { body, contentType } = buildMultipartBody(fields);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.apiKey.trim()}`,
  };
  if (isRouter) {
    headers["HTTP-Referer"] = "https://github.com/QR4X/Corvus";
    headers["X-Title"] = "Corvus";
  }

  let res;
  try {
    res = await requestUrl({
      url: endpoint,
      method: "POST",
      contentType,
      headers,
      body,
      throw: false,
    });
  } catch {
    throw new ProviderError("Transcription connection failed.", "network");
  }

  if (res.status === 401) {
    throw new ProviderError("Invalid API key.", "invalid-key");
  }
  if (res.status === 429) {
    throw new ProviderError(
      isRouter
        ? "OpenRouter transcription rate limit or insufficient credits."
        : "OpenAI transcription rate limit.",
      "rate-limit"
    );
  }
  if (res.status < 200 || res.status >= 300) {
    const msg =
      (res.json as { error?: { message?: string } } | undefined)?.error?.message ??
      `HTTP ${res.status}`;
    throw new ProviderError(
      `${isRouter ? "OpenRouter" : "OpenAI"} transcription: ${msg}`,
      "unknown"
    );
  }

  const text = extractTranscript(res.json, res.text);
  if (!text) {
    throw new ProviderError("Empty transcription response.", "unknown");
  }
  return text;
}

export function extractTranscript(
  json: unknown,
  raw?: string
): string {
  const j = json as { text?: unknown } | undefined;
  if (typeof j?.text === "string" && j.text.trim()) return j.text.trim();
  if (raw && raw.trim() && !raw.trim().startsWith("{")) return raw.trim();
  return "";
}
