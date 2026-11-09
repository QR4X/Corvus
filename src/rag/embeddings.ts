import { requestUrl } from "obsidian";
import { ProviderError } from "../providers/base";
import { getEmbeddingSpec } from "./types";
import { anotarUso } from "../usage/recorder";

const OPENAI_EMBEDDINGS_ENDPOINT = "https://api.openai.com/v1/embeddings";
const OPENROUTER_EMBEDDINGS_ENDPOINT =
  "https://openrouter.ai/api/v1/embeddings";
const GEMINI_EMBEDDINGS_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/openai/embeddings";
const NIM_EMBEDDINGS_ENDPOINT = "https://integrate.api.nvidia.com/v1/embeddings";

function ehVetor(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((n) => typeof n === "number");
}

interface OpenAIEmbeddingResponse {
  data: { embedding: number[]; index: number }[];
  usage: { prompt_tokens: number; total_tokens: number };
}

const EMBED_REQUEST_TIMEOUT_MS = 60_000;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: number;
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => {
      reject(
        new ProviderError(
          `Timed out after ${EMBED_REQUEST_TIMEOUT_MS / 1000}s calling ${label} embeddings.`,
          "network"
        )
      );
    }, EMBED_REQUEST_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
}

export type EmbedInput =
  | { kind: "text"; text: string }
  | { kind: "image"; dataUrl: string; alt?: string };

export interface EmbedCredentials {
  openaiApiKey: string;
  openrouterApiKey: string;
  geminiApiKey?: string;
  nimApiKey?: string;

  ollamaEndpoint?: string;
}

export function arrayBufferToDataUrl(
  buffer: ArrayBuffer,
  mimeType: string
): string {

  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000; 
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);

    binary += String.fromCharCode(...chunk);
  }
  const b64 = btoa(binary);
  return `data:${mimeType};base64,${b64}`;
}

async function embedOpenAICompat(
  texts: string[],
  apiKey: string,
  model: string,
  endpoint: string,
  label: string,

  provider: string,
  opts?: { dimensions?: number; extraBody?: Record<string, unknown> }
): Promise<number[][]> {
  if (!apiKey || !apiKey.trim()) {
    throw new ProviderError(
      `${label} API key not configured — embeddings need one.`,
      "no-key"
    );
  }
  if (texts.length === 0) return [];

  let res;
  try {
    res = await withTimeout(
      requestUrl({
        url: endpoint,
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          model,
          input: texts,
          ...(opts?.dimensions && opts.dimensions > 0
            ? { dimensions: opts.dimensions }
            : {}),
          ...(opts?.extraBody ?? {}),
        }),
        throw: false,
      }),
      label
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error.";
    throw new ProviderError(
      `Failed to call ${label} embeddings: ${msg}`,
      "network"
    );
  }

  if (res.status === 401 || res.status === 403) {
    throw new ProviderError(`${label} API key is invalid.`, "invalid-key");
  }
  if (res.status === 429) {
    throw new ProviderError(
      "Embedding rate limit exceeded. Wait and try again.",
      "rate-limit"
    );
  }
  if (res.status >= 400) {
    throw new ProviderError(
      `${label} embeddings returned ${res.status}: ${res.text?.slice(0, 200) ?? ""}`,
      "unknown"
    );
  }

  const parsed = res.json as OpenAIEmbeddingResponse | undefined;
  if (!parsed || !Array.isArray(parsed.data)) {
    throw new ProviderError(
      `${label} embeddings response missing data field.`,
      "unknown"
    );
  }

  const out = new Array<number[]>(texts.length);
  for (const d of parsed.data ?? []) {
    if (d && d.index >= 0 && d.index < out.length && ehVetor(d.embedding)) {
      out[d.index] = d.embedding;
    }
  }
  for (let i = 0; i < out.length; i++) {
    if (!Array.isArray(out[i]) || out[i].length === 0) {
      throw new ProviderError(
        `${label} embeddings: the API returned ${parsed.data?.length ?? 0} vectors for ${texts.length} inputs (index ${i} is missing).`,
        "unknown"
      );
    }
  }

  anotarUso(provider, model, { r: 1, i: parsed.usage?.prompt_tokens ?? 0 });
  return out;
}

export async function embedBatch(
  texts: string[],
  apiKey: string,
  model = "text-embedding-3-small",
  dimensions?: number
): Promise<number[][]> {
  return embedOpenAICompat(
    texts,
    apiKey,
    model,
    OPENAI_EMBEDDINGS_ENDPOINT,
    "OpenAI",
    "openai",
    { dimensions }
  );
}

interface OpenRouterEmbeddingResponse {
  data: { embedding: number[]; index: number }[];
  usage?: { prompt_tokens?: number; total_tokens?: number };
}

function buildOpenRouterInput(item: EmbedInput): unknown {
  if (item.kind === "text") {
    return [{ type: "text", text: item.text }];
  }
  return [{ type: "image_url", image_url: { url: item.dataUrl } }];
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}

export async function embedBatchOpenRouter(
  items: EmbedInput[],
  apiKey: string,
  model: string
): Promise<number[][]> {
  if (!apiKey || !apiKey.trim()) {
    throw new ProviderError(
      "OpenRouter API key not configured — multimodal (VL) embeddings need one.",
      "no-key"
    );
  }
  if (items.length === 0) return [];

  const results: number[][] = [];
  for (const item of items) {
    const body = {
      model,
      input: buildOpenRouterInput(item),
    };
    let res;
    let attempt = 0;
    const MAX_ATTEMPTS = 4;
    while (true) {
      attempt++;
      try {
        res = await withTimeout(
          requestUrl({
            url: OPENROUTER_EMBEDDINGS_ENDPOINT,
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://github.com/QR4X/Corvus",
              "X-Title": "Corvus",
            },
            body: JSON.stringify(body),
            throw: false,
          }),
          "OpenRouter"
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Network error.";
        throw new ProviderError(
          `Failed to call OpenRouter embeddings: ${msg}`,
          "network"
        );
      }

      const transient = res.status === 429 || res.status >= 500;
      if (transient && attempt < MAX_ATTEMPTS) {
        const backoff = 1000 * 2 ** (attempt - 1) + Math.floor(Math.random() * 500);
        console.warn(
          `[corvus/rag] OpenRouter ${res.status} — waiting ${backoff}ms before retry ${attempt + 1}/${MAX_ATTEMPTS}`
        );
        await sleep(backoff);
        continue;
      }
      break;
    }

    if (res.status === 401) {
      throw new ProviderError("OpenRouter API key is invalid.", "invalid-key");
    }
    if (res.status === 429) {
      throw new ProviderError(
        "OpenRouter rate limit persisted after retry. Wait 1 minute and try again.",
        "rate-limit"
      );
    }
    if (res.status >= 400) {

      console.error(
        `[corvus/rag] OpenRouter ${res.status} — request body:`,
        JSON.stringify(body).slice(0, 400)
      );
      console.error(
        `[corvus/rag] OpenRouter ${res.status} — response:`,
        res.text?.slice(0, 500)
      );
      throw new ProviderError(
        `OpenRouter embeddings returned ${res.status}.`,
        "unknown"
      );
    }

    const parsed = res.json as OpenRouterEmbeddingResponse | undefined;
    if (!parsed || !Array.isArray(parsed.data) || parsed.data.length === 0) {

      console.error(
        "[corvus/rag] Nemotron returned empty data. Model:",
        model
      );
      console.error(
        "[corvus/rag] Request body:",
        JSON.stringify(body).slice(0, 400)
      );
      console.error(
        "[corvus/rag] Full response:",
        res.text?.slice(0, 800)
      );
      throw new ProviderError(
        `Nemotron returned no data. Likely causes: (1) incompatible payload, ` +
          `(2) a silent rate limit, (3) the model is offline.`,
        "unknown"
      );
    }
    const emb = parsed.data[0]?.embedding;
    if (!ehVetor(emb) || emb.length === 0) {
      throw new ProviderError(
        "Nemotron returned data with no embedding (empty or invalid item).",
        "unknown"
      );
    }
    results.push(emb);

    anotarUso("openrouter", model, { r: 1, i: parsed.usage?.prompt_tokens ?? 0 });
  }
  return results;
}

export async function embedOllama(
  texts: string[],
  endpoint: string,
  model: string
): Promise<number[][]> {
  const base = (endpoint || "http://localhost:11434").replace(/\/+$/, "");
  if (texts.length === 0) return [];
  const pedir = async (path: string, body: unknown) => {
    try {
      return await withTimeout(
        requestUrl({
          url: `${base}${path}`,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          throw: false,
        }),
        "Ollama"
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "network error";
      throw new ProviderError(`Couldn't reach Ollama at ${base} (${msg}) — is it running?`, "network");
    }
  };

  const res = await pedir("/api/embed", { model, input: texts, truncate: true });
  if (res.status === 404) {

    const out: number[][] = [];
    for (const prompt of texts) {
      const r = await pedir("/api/embeddings", { model, prompt });
      if (r.status >= 400) {
        throw new ProviderError(`Ollama embeddings returned ${r.status}: ${r.text?.slice(0, 200) ?? ""}`, "unknown");
      }
      const emb = (r.json as { embedding?: unknown } | undefined)?.embedding;
      if (!ehVetor(emb) || emb.length === 0) {
        throw new ProviderError(`Ollama returned no embedding for ${model}.`, "unknown");
      }
      out.push(emb);
      anotarUso("ollama", model, { r: 1 });
    }
    return out;
  }
  if (res.status >= 400) {
    throw new ProviderError(`Ollama embeddings returned ${res.status}: ${res.text?.slice(0, 200) ?? ""}`, "unknown");
  }
  const lista = (res.json as { embeddings?: unknown } | undefined)?.embeddings;
  if (!Array.isArray(lista) || lista.length !== texts.length || !lista.every((v) => ehVetor(v) && v.length > 0)) {
    throw new ProviderError(
      `Ollama returned ${Array.isArray(lista) ? lista.length : 0} vectors for ${texts.length} inputs.`,
      "unknown"
    );
  }
  anotarUso("ollama", model, { r: 1 });
  return lista as number[][];
}

export async function embedItems(
  items: EmbedInput[],
  creds: EmbedCredentials,
  model: string,
  dimensions?: number
): Promise<number[][]> {
  const spec = getEmbeddingSpec(model);
  const hasImage = items.some((i) => i.kind === "image");

  if (hasImage && !spec.supportsImage) {
    throw new ProviderError(
      `${model} does not support image embeddings. Use nvidia/llama-nemotron-embed-vl-1b-v2:free (OpenRouter, free) for multimodal.`,
      "unknown"
    );
  }

  if (spec.provider === "openrouter") {

    return embedBatchOpenRouter(items, creds.openrouterApiKey, model);
  }

  if (hasImage) {
    throw new ProviderError(
      `Image embedding is only supported through OpenRouter (Nemotron VL). ${model} (${spec.provider}) cannot embed images.`,
      "unknown"
    );
  }

  const texts = items.map((i) => (i.kind === "text" ? i.text : ""));
  if (spec.provider === "ollama") {
    return embedOllama(texts, creds.ollamaEndpoint ?? "", model);
  }
  if (spec.provider === "gemini") {
    return embedOpenAICompat(
      texts,
      creds.geminiApiKey ?? "",
      model,
      GEMINI_EMBEDDINGS_ENDPOINT,
      "Gemini",
      "gemini",
      { dimensions: spec.supportsDimensions ? dimensions : undefined }
    );
  }
  if (spec.provider === "nim") {

    return embedOpenAICompat(
      texts,
      creds.nimApiKey ?? "",
      model,
      NIM_EMBEDDINGS_ENDPOINT,
      "NIM",
      "nim",
      { extraBody: { input_type: "passage" } }
    );
  }

  return embedBatch(texts, creds.openaiApiKey, model, dimensions);
}

export async function embedQuery(
  text: string,
  creds: EmbedCredentials,
  model: string,
  dimensions?: number
): Promise<number[]> {
  const [vec] = await embedItems(
    [{ kind: "text", text }],
    creds,
    model,
    dimensions
  );
  return vec;
}

export function chunkText(
  text: string,
  maxSize = 1500,
  overlap = 200
): string[] {
  const cleaned = text.trim();
  if (cleaned.length <= maxSize) return cleaned.length > 0 ? [cleaned] : [];

  const paragraphs = cleaned.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  for (const p of paragraphs) {
    if (!p.trim()) continue;
    if ((current + "\n\n" + p).length > maxSize) {
      if (current.length > 0) {
        chunks.push(current.trim());

        const tail = current.slice(-overlap);
        current = tail + "\n\n" + p;
      } else {

        const step = Math.max(1, maxSize - overlap);
        for (let i = 0; i < p.length; i += step) {
          chunks.push(p.slice(i, i + maxSize));
        }
        current = "";
      }
    } else {
      current = current ? current + "\n\n" + p : p;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export interface MarkdownChunk {
  text: string;

  breadcrumb: string;
}

export function chunkMarkdown(
  content: string,
  maxSize = 1500,
  overlap = 200
): MarkdownChunk[] {
  const lines = content.split("\n");
  const sections: { breadcrumb: string; body: string }[] = [];
  const stack: { level: number; title: string }[] = [];
  let body: string[] = [];

  const flush = () => {
    const text = body.join("\n");
    if (text.trim()) {
      sections.push({
        breadcrumb: stack.map((h) => h.title).join(" > "),
        body: text,
      });
    }
    body = [];
  };

  for (const line of lines) {

    const m = /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);
    if (m) {
      flush();
      const level = m[1].length;
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      stack.push({ level, title: m[2].trim() });
      body.push(line);
    } else {
      body.push(line);
    }
  }
  flush();

  const out: MarkdownChunk[] = [];
  for (const sec of sections) {
    for (const piece of chunkText(sec.body, maxSize, overlap)) {
      out.push({ text: piece, breadcrumb: sec.breadcrumb });
    }
  }

  if (out.length === 0) {
    return chunkText(content, maxSize, overlap).map((t) => ({
      text: t,
      breadcrumb: "",
    }));
  }
  return out;
}

export async function sha1Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export { estimateTokens } from "../core/tokens";
