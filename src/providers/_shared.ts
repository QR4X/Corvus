import {
  ProviderError,
  type ProviderRequest,
  type ProviderResponse,
  type ProviderToolCall,
  type ProviderToolDefinition,
  type ProviderMessage,
  type ImageAttachment,
  type TokenHandler,
  type UsageHandler,
  type ReasoningHandler,
} from "./base";
import {
  aplicarEsforco,
  resolveTemperature,
  resolveMaxTokens,
  semRaciocinioComFerramentas,
} from "./paramPolicy";

export async function streamFallbackToChat(
  call: () => Promise<ProviderResponse>,
  onToken: TokenHandler,
  onUsage?: UsageHandler,
  onReasoning?: ReasoningHandler
): Promise<ProviderResponse> {
  const resp = await call();
  if (resp.reasoning && onReasoning) onReasoning(resp.reasoning);
  if (resp.content) onToken(resp.content);
  if (resp.usage && onUsage) onUsage(resp.usage);
  return resp;
}

export function fetchStream(url: string, init: RequestInit): Promise<Response> {
  return window.fetch(url, init);
}

export function parseDataUrl(
  dataUrl: string | undefined
): { mediaType: string; base64: string } | null {
  if (!dataUrl) return null;
  const m = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  return { mediaType: m[1], base64: m[2] };
}

export function pdfFileData(dataUrl: string | undefined): string | null {
  if (!dataUrl) return null;
  if (dataUrl.startsWith("data:")) {
    const parsed = parseDataUrl(dataUrl);
    if (!parsed) return null;

    const mime = parsed.mediaType.toLowerCase();
    const isPdf = mime.includes("pdf") || mime === "application/octet-stream";
    if (!isPdf) return null;
    return `data:application/pdf;base64,${parsed.base64}`;
  }

  if (/^[A-Za-z0-9+/=\r\n]+$/.test(dataUrl) && dataUrl.length > 16) {
    return `data:application/pdf;base64,${dataUrl.replace(/\s+/g, "")}`;
  }
  return null;
}

export function hasPdfAttachment(messages: ProviderMessage[]): boolean {
  return messages.some(
    (m) =>
      m.role === "user" &&
      !!m.attachments?.some((a) => a.type === "pdf" && pdfFileData(a.dataUrl))
  );
}

export function toOpenAIMessages(messages: ProviderMessage[]): unknown[] {
  return messages.map((m) => {
    if (m.role === "tool") {
      return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
    }
    if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
      return {
        role: "assistant",
        content: m.content || null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      };
    }
    if (m.role === "user" && m.attachments && m.attachments.length > 0) {
      const imageAtt = m.attachments.filter(
        (a): a is ImageAttachment => a.type === "image"
      );

      const pdfParts: Array<Record<string, unknown>> = [];
      for (const a of m.attachments) {
        if (a.type !== "pdf") continue;
        const fileData = pdfFileData(a.dataUrl);
        if (!fileData) continue;
        pdfParts.push({
          type: "file",
          file: { filename: a.name, file_data: fileData },
        });
      }
      if (imageAtt.length === 0 && pdfParts.length === 0) {
        return { role: "user", content: m.content };
      }
      const parts: Array<Record<string, unknown>> = [];
      if (m.content) parts.push({ type: "text", text: m.content });
      for (const att of imageAtt) {
        parts.push({ type: "image_url", image_url: { url: att.dataUrl } });
      }
      parts.push(...pdfParts);
      return { role: "user", content: parts };
    }
    return { role: m.role, content: m.content };
  });
}

export function toOpenAITools(tools?: ProviderToolDefinition[]) {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

export interface BodyOpts {

  provider: string;
  stream?: boolean;

  maxTokensField?: "max_tokens" | "max_completion_tokens";

  includeUsage?: boolean;
}

export function buildChatBody(
  req: ProviderRequest,
  opts: BodyOpts
): Record<string, unknown> {
  const field = opts.maxTokensField ?? "max_tokens";
  const body: Record<string, unknown> = {
    model: req.model,
    messages: toOpenAIMessages(req.messages),
    [field]: resolveMaxTokens(opts.provider, req.model, req.maxTokens ?? 2000, req.effort),
  };

  aplicarEsforco(body, opts.provider, req.model, req.effort);
  if (opts.stream) {
    body.stream = true;
    if (opts.includeUsage) body.stream_options = { include_usage: true };
  }
  const temp = resolveTemperature(opts.provider, req.model, req.temperature);
  if (temp !== undefined) body.temperature = temp;
  const tools = toOpenAITools(req.tools);
  if (tools) {
    body.tools = tools;
    body.tool_choice = "auto";

    if (body.reasoning_effort !== undefined && semRaciocinioComFerramentas(opts.provider, req.model)) {
      body.reasoning_effort = "none";
    }
  }
  return body;
}

export interface ErrorMapOpts {

  label: string;

  authStatuses?: number[];
}

function extractApiMessage(json: unknown): string | null {
  const j = json as
    | {
        error?: unknown;
        errors?: unknown;
        detail?: string;
        message?: string;
      }
    | undefined;

  if (typeof j?.error === "string") return j.error;
  if (j?.error && typeof j.error === "object") {
    const m = (j.error as { message?: unknown }).message;
    if (typeof m === "string") return m;
    if (m != null) return shortJson(m);
  }

  if (Array.isArray(j?.errors) && j.errors.length > 0) {
    const first = j.errors[0] as { message?: unknown };
    if (typeof first?.message === "string") return first.message;
    return shortJson(j.errors);
  }
  return j?.detail ?? j?.message ?? null;
}

function shortJson(v: unknown): string {
  try {
    const s = JSON.stringify(v);
    return s.length > 200 ? `${s.slice(0, 200)}…` : s;
  } catch {
    return String(v);
  }
}

export function mapHttpError(
  status: number,
  bodyJson: unknown,
  opts: ErrorMapOpts
): ProviderError | null {
  if (status >= 200 && status < 300) return null;
  const auth = opts.authStatuses ?? [401];
  if (auth.includes(status)) {
    return new ProviderError(`Invalid ${opts.label} API key.`, "invalid-key");
  }
  if (status === 429) {
    return new ProviderError(
      `${opts.label} rate limit. Wait a few seconds.`,
      "rate-limit"
    );
  }

  if (status >= 500 || status === 408 || status === 409) {
    return new ProviderError(
      `${opts.label} service unavailable. Try again.`,
      "rate-limit"
    );
  }
  const detail = extractApiMessage(bodyJson) ?? `HTTP ${status}`;

  if (
    /context.{0,8}length|maximum context|context window|too many tokens|prompt is too long|exceeds? the (model'?s? )?context/i.test(
      detail
    )
  ) {
    return new ProviderError(`${opts.label}: ${detail}`, "context-overflow");
  }
  return new ProviderError(`${opts.label}: ${detail}`, "unknown");
}

export async function ensureOkStream(
  res: Response,
  opts: ErrorMapOpts
): Promise<void> {
  if (res.ok) return;

  let json: unknown;
  try {
    const raw = await res.text();
    if (raw) {
      try {
        json = JSON.parse(raw);
      } catch {
        json = { message: raw };
      }
    }
  } catch { void 0; }
  const err = mapHttpError(res.status, json, opts);
  if (err) throw err;
}

export function ensureOkRequest(
  res: { status: number; json?: unknown },
  opts: ErrorMapOpts
): void {
  const err = mapHttpError(res.status, res.json, opts);
  if (err) throw err;
}

export interface ToolCallNoFio {
  index?: number;
  type?: string;
  id?: string;
  function?: { name?: string; arguments?: string };
}

export interface DeltaNoFio {
  content?: unknown;
  reasoning?: unknown;
  reasoning_content?: unknown;
  tool_calls?: ToolCallNoFio[];
}

export interface UsoNoFio {
  prompt_tokens?: number;
  completion_tokens?: number;
}

export interface ChunkNoFio {
  choices?: Array<{ delta?: DeltaNoFio; finish_reason?: string }>;
  usage?: UsoNoFio;
}

export interface MensagemNoFio {
  content?: unknown;
  tool_calls?: ToolCallNoFio[];
  reasoning_content?: unknown;
  reasoning?: unknown;
}

export interface ErroNoFio {
  error?: { message?: string; code?: unknown; status?: unknown };
}

export interface RespostaNoFio {
  choices?: Array<{ message?: MensagemNoFio; finish_reason?: string }>;
  usage?: UsoNoFio;
}

export function parseOpenAIChatMessage(
  message: MensagemNoFio
): Pick<ProviderResponse, "content" | "toolCalls" | "reasoning" | "invalidToolCalls"> {
  let toolCalls: ProviderToolCall[] | undefined;
  let invalidToolCalls = false;
  if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
    const lidas: ProviderToolCall[] = [];
    for (const tc of message.tool_calls) {
      if (tc.type !== "function") continue;

      const nome = tc.function?.name;
      if (!nome) {
        invalidToolCalls = true;
        continue;
      }
      const brutos = tc.function?.arguments ?? "";
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = brutos ? (JSON.parse(brutos) as Record<string, unknown>) : {};
        if (!parsedArgs || typeof parsedArgs !== "object" || Array.isArray(parsedArgs)) {
          invalidToolCalls = true;
          continue;
        }
      } catch {
        invalidToolCalls = true;
        continue;
      }
      lidas.push({
        id: tc.id || `call_${crypto.randomUUID()}`,
        name: nome,
        arguments: parsedArgs,
      });
    }
    if (lidas.length > 0) toolCalls = lidas;
  }

  const content =
    typeof message.content === "string"
      ? message.content
      : Array.isArray(message.content)
        ? (message.content as Array<{ type?: string; text?: unknown }>)
            .filter((p) => p?.type === "text" && typeof p.text === "string")
            .map((p) => p.text as string)
            .join("")
        : "";

  const reasoning =
    (typeof message.reasoning_content === "string" && message.reasoning_content) ||
    (typeof message.reasoning === "string" && message.reasoning) ||
    undefined;
  return { content, toolCalls: invalidToolCalls ? undefined : toolCalls, reasoning,
    ...(invalidToolCalls ? { invalidToolCalls: true } : {}) };
}

export function usageFrom(json: {
  usage?: UsoNoFio;
}): { input: number; output: number } | undefined {
  return json.usage
    ? {
        input: json.usage.prompt_tokens ?? 0,
        output: json.usage.completion_tokens ?? 0,
      }
    : undefined;
}

type ToolAccum = Record<number, { id: string; name: string; argsBuf: string }>;

export function finalizeOpenAIResponse(
  content: string,
  toolCallAccum: ToolAccum,
  usage?: { input: number; output: number },
  idPrefix = "openai_call",
  reasoning?: string
): ProviderResponse {
  const indices = Object.keys(toolCallAccum)
    .map((k) => Number(k))
    .sort((a, b) => a - b);
  const toolCalls: ProviderToolCall[] = [];
  let invalidToolCalls = false;
  for (const i of indices) {
    const acc = toolCallAccum[i];
    if (!acc.name) {
      invalidToolCalls = true;
      continue;
    }
    let parsedArgs: Record<string, unknown> = {};
    try {
      parsedArgs = acc.argsBuf
        ? (JSON.parse(acc.argsBuf) as Record<string, unknown>)
        : {};
      if (!parsedArgs || typeof parsedArgs !== "object" || Array.isArray(parsedArgs)) {
        invalidToolCalls = true;
        continue;
      }
    } catch {
      invalidToolCalls = true;
      continue;
    }
    toolCalls.push({

      id: acc.id || `${idPrefix}_${crypto.randomUUID()}`,
      name: acc.name,
      arguments: parsedArgs,
    });
  }
  const result: ProviderResponse = { content };
  if (toolCalls.length > 0) result.toolCalls = toolCalls;
  if (usage) result.usage = usage;
  if (reasoning) result.reasoning = reasoning;
  if (invalidToolCalls) {
    result.invalidToolCalls = true;

    delete result.toolCalls;
  }
  return result;
}

export async function parseOpenAICompatSSE(
  body: ReadableStream<Uint8Array>,
  onToken: TokenHandler,
  onUsage: UsageHandler | undefined,
  idPrefix: string,
  onReasoning?: (delta: string) => void
): Promise<ProviderResponse> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulatedText = "";
  let accumulatedReasoning = "";
  const toolCallAccum: ToolAccum = {};

  let lastToolIdx = -1;
  let usage: { input: number; output: number } | undefined;
  let finishReason: string | undefined;
  let completed = false;

  const processLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) return;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") {
        if (data === "[DONE]") {
          completed = true;
        }
        return;
      }
      let json: (ChunkNoFio & { error?: unknown; errors?: unknown }) | null = null;
      try {
        json = JSON.parse(data) as ChunkNoFio & { error?: unknown; errors?: unknown };
      } catch {

        return;
      }

      if (json && (json.error !== undefined || json.errors !== undefined)) {
        const streamErr = extractApiMessage(json) ?? "Stream error received";
        const label = idPrefix ? idPrefix.replace(/_call$/, "") : "Provider";
        if (
          /context.{0,8}length|maximum context|context window|too many tokens|prompt is too long|exceeds? the (model'?s? )?context/i.test(
            streamErr
          )
        ) {
          throw new ProviderError(`${label}: ${streamErr}`, "context-overflow");
        }
        if (/rate limit|too many requests|quota|overloaded/i.test(streamErr)) {
          throw new ProviderError(`${label}: ${streamErr}`, "rate-limit");
        }
        throw new ProviderError(`${label}: ${streamErr}`, "unknown");
      }

      const choice = json?.choices?.[0];
      if (typeof choice?.finish_reason === "string") {
        finishReason = choice.finish_reason;
      }
      const delta = choice?.delta;
      if (delta) {
        const token = delta.content;
        if (typeof token === "string" && token.length > 0) {
          accumulatedText += token;
          onToken(token);
        }

        const r =
          (typeof delta.reasoning === "string" && delta.reasoning) ||
          (typeof delta.reasoning_content === "string" &&
            delta.reasoning_content) ||
          "";
        if (r) {
          accumulatedReasoning += r;
          if (onReasoning) onReasoning(r);
        }
        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {

            let idx: number;
            if (typeof tc.index === "number") {
              idx = tc.index;
              if (idx > lastToolIdx) lastToolIdx = idx;
            } else {
              if (tc.id || tc.function?.name) lastToolIdx += 1;
              idx = lastToolIdx < 0 ? 0 : lastToolIdx;
            }
            if (!toolCallAccum[idx]) {
              toolCallAccum[idx] = { id: "", name: "", argsBuf: "" };
            }
            if (tc.id) toolCallAccum[idx].id = tc.id;

            if (tc.function?.name && !toolCallAccum[idx].name) {
              toolCallAccum[idx].name = tc.function.name;
            }
            if (typeof tc.function?.arguments === "string") {
              toolCallAccum[idx].argsBuf += tc.function.arguments;
            }
          }
        }
      }
      if (json?.usage) {
        usage = {
          input: json.usage.prompt_tokens ?? 0,
          output: json.usage.completion_tokens ?? 0,
        };
        if (onUsage) onUsage(usage);
      }
  };
  try {
    while (!completed) {
      let read: ReadableStreamReadResult<Uint8Array>;
      try {
        read = await reader.read();
      } catch (err) {

        if (err instanceof TypeError) break;
        throw err;
      }
      const { done, value } = read;
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        processLine(line);
        if (completed) break;
      }
      if (done) {
        if (!completed && buffer.trim()) processLine(buffer);
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
  const result = finalizeOpenAIResponse(
    accumulatedText,
    toolCallAccum,
    usage,
    idPrefix,
    accumulatedReasoning || undefined
  );
  result.finishReason = finishReason;
  result.streamCompleted = completed || finishReason !== undefined;
  if (finishReason === "length" || !result.streamCompleted) {
    if (result.toolCalls?.length) result.invalidToolCalls = true;
    delete result.toolCalls;
  }
  return result;
}
