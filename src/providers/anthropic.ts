import { requestUrl } from "obsidian";
import {
  Provider,
  ProviderError,
  ProviderRequest,
  ProviderResponse,
  ProviderMessage,
  ProviderToolCall,
  TokenHandler,
  UsageHandler,
  ReasoningHandler,
} from "./base";
import { aplicarEsforco, resolveTemperature, resolveMaxTokens } from "./paramPolicy";
import {
  ensureOkRequest,
  ensureOkStream,
  streamFallbackToChat,
  parseDataUrl,
  fetchStream,
} from "./_shared";

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

interface TextBlock {
  type: "text";
  text: string;
}
interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}
interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
}
interface ImageBlock {
  type: "image";
  source: {
    type: "base64" | "url";
    media_type?: string;
    data?: string;
    url?: string;
  };
}

interface DocumentBlock {
  type: "document";
  source: {
    type: "base64";
    media_type: "application/pdf";
    data: string;
  };

  title?: string;
}
type ContentBlock =
  | TextBlock
  | ToolUseBlock
  | ToolResultBlock
  | ImageBlock
  | DocumentBlock;

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: object;
}

interface AnthropicBody {
  model: string;
  max_tokens: number;
  messages: AnthropicMessage[];
  stream?: boolean;
  system?: string;
  tools?: AnthropicTool[];
  temperature?: number;

  output_config?: { effort: string };
}

interface BlocoDaResposta {
  type?: string;
  text?: unknown;
  id?: string;
  name?: string;
  input?: unknown;
}

interface UsoAnthropic {
  input_tokens?: number;
  output_tokens?: number;
}

interface RespostaAnthropic {
  content?: BlocoDaResposta[];
  usage?: UsoAnthropic;
}

interface EventoAnthropic {
  type?: string;
  index?: number;
  content_block?: { type?: string; id?: string; name?: string };
  delta?: {
    type?: string;
    text?: unknown;
    thinking?: unknown;
    partial_json?: string;
  };
  message?: { usage?: UsoAnthropic };
  usage?: UsoAnthropic;
  error?: { message?: string };
}

interface ModelosAnthropic {
  data?: Array<{ id?: string }>;
}

export function toAnthropicPayload(messages: ProviderMessage[]): {
  system: string | undefined;
  messages: AnthropicMessage[];
} {
  let system: string | undefined;
  const converted: AnthropicMessage[] = [];

  for (const m of messages) {
    if (m.role === "system") {

      system = system ? system + "\n\n" + m.content : m.content;
      continue;
    }

    if (m.role === "tool") {

      if (!m.toolCallId) {
        console.warn(
          "[anthropic] tool message missing toolCallId — appending as text to avoid 400"
        );
        converted.push({ role: "user", content: m.content || " " });
        continue;
      }
      converted.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: m.toolCallId,
            content: m.content,
          },
        ],
      });
      continue;
    }

    if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
      const blocks: ContentBlock[] = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      for (const tc of m.toolCalls) {
        blocks.push({
          type: "tool_use",
          id: tc.id,
          name: tc.name,
          input: tc.arguments,
        });
      }
      converted.push({ role: "assistant", content: blocks });
      continue;
    }

    const imageAtt =
      m.role === "user" && m.attachments
        ? m.attachments.filter((a) => a.type === "image")
        : [];
    const pdfAtt =
      m.role === "user" && m.attachments
        ? m.attachments.filter((a) => a.type === "pdf")
        : [];
    if (m.role === "user" && (imageAtt.length > 0 || pdfAtt.length > 0)) {
      const blocks: ContentBlock[] = [];

      for (const att of pdfAtt) {
        if (att.type !== "pdf" || !att.dataUrl) continue;
        const parsed = parseDataUrl(att.dataUrl);
        if (!parsed) continue;
        blocks.push({
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: parsed.base64,
          },
          title: att.name,
        });
      }
      if (m.content) blocks.push({ type: "text", text: m.content });
      for (const att of imageAtt) {
        if (att.type === "image") {

          const isDataUrl = att.dataUrl.startsWith("data:");
          if (isDataUrl) {

            const match = /^data:([^;]+);base64,(.+)$/.exec(att.dataUrl);
            if (match) {
              blocks.push({
                type: "image",
                source: {
                  type: "base64",
                  media_type: match[1],
                  data: match[2],
                },
              });
            }
          } else {
            blocks.push({
              type: "image",
              source: { type: "url", url: att.dataUrl },
            });
          }
        }
      }

      const onlyText = blocks.every((b) => b.type === "text");
      if (onlyText) {
        converted.push({ role: "user", content: m.content || " " });
      } else {
        converted.push({ role: "user", content: blocks });
      }
      continue;
    }

    converted.push({
      role: m.role,
      content: m.content,
    });
  }

  const toBlocks = (c: string | ContentBlock[]): ContentBlock[] =>
    Array.isArray(c) ? c : c ? [{ type: "text" as const, text: c }] : [];

  const merged: AnthropicMessage[] = [];
  for (const m of converted) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) {

      if (!Array.isArray(last.content)) last.content = toBlocks(last.content);
      last.content.push(...toBlocks(m.content));
    } else {
      merged.push({ ...m });
    }
  }

  return { system, messages: merged };
}

function buildBody(req: ProviderRequest, stream: boolean): AnthropicBody {
  const { system, messages } = toAnthropicPayload(req.messages);

  const body: AnthropicBody = {
    model: req.model,
    max_tokens: resolveMaxTokens("anthropic", req.model, req.maxTokens ?? 2000, req.effort),
    messages,
    stream,
  };
  if (system) body.system = system;

  const temp = resolveTemperature("anthropic", req.model, req.temperature);
  if (temp !== undefined) body.temperature = temp;

  aplicarEsforco(body as unknown as Record<string, unknown>, "anthropic", req.model, req.effort);
  if (req.tools && req.tools.length > 0) {
    body.tools = req.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }
  return body;
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    "x-api-key": apiKey.trim(),
    "anthropic-version": ANTHROPIC_VERSION,
    "anthropic-dangerous-direct-browser-access": "true",
  };
}

export class AnthropicProvider implements Provider {
  id = "anthropic";
  name = "Anthropic";
  supportsTools = true;

  async chat(req: ProviderRequest, apiKey: string): Promise<ProviderResponse> {
    if (!apiKey || !apiKey.trim()) {
      throw new ProviderError(
        "Anthropic API key not configured. Go to Settings → Corvus.",
        "no-key"
      );
    }

    let res;
    try {
      res = await requestUrl({
        url: ANTHROPIC_ENDPOINT,
        method: "POST",
        contentType: "application/json",
        headers: authHeaders(apiKey),
        body: JSON.stringify(buildBody(req, false)),
        throw: false,
      });
    } catch {
      throw new ProviderError("Connection failed. Check your internet.", "network");
    }

    ensureOkRequest(res, { label: "Anthropic" });

    const corpo = res.json as RespostaAnthropic | undefined;
    const content = corpo?.content;
    if (!Array.isArray(content)) {
      throw new ProviderError("Empty response from Anthropic.", "unknown");
    }

    let text = "";
    const toolCalls: ProviderToolCall[] = [];
    for (const block of content) {
      if (block.type === "text" && typeof block.text === "string") {
        text += block.text;
      } else if (block.type === "tool_use" && block.name) {
        toolCalls.push({
          id: block.id || `anthropic_call_${crypto.randomUUID()}`,
          name: block.name,
          arguments: (block.input as Record<string, unknown> | undefined) ?? {},
        });
      }
    }

    if (!text && toolCalls.length === 0) {
      throw new ProviderError(
        "Empty response from Anthropic (no text or tool_use).",
        "unknown"
      );
    }

    const result: ProviderResponse = { content: text };
    if (toolCalls.length > 0) result.toolCalls = toolCalls;

    const usage = corpo?.usage;
    if (usage) {
      result.usage = {
        input: usage.input_tokens ?? 0,
        output: usage.output_tokens ?? 0,
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
    onReasoning?: ReasoningHandler
  ): Promise<ProviderResponse> {
    if (!apiKey || !apiKey.trim()) {
      throw new ProviderError(
        "Anthropic API key not configured. Go to Settings → Corvus.",
        "no-key"
      );
    }

    let res: Response;
    try {
      res = await fetchStream(ANTHROPIC_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(apiKey),
        },
        body: JSON.stringify(buildBody(req, true)),
        signal,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;

      return streamFallbackToChat(
        () => this.chat(req, apiKey),
        onToken,
        onUsage,
        onReasoning
      );
    }

    await ensureOkStream(res, { label: "Anthropic" });
    if (!res.body) {
      throw new ProviderError("Empty stream from Anthropic.", "unknown");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let accumulatedText = "";

    const toolUseAccum: Record<number, { id: string; name: string; jsonBuf: string }> = {};

    try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (!data) continue;
        let json: EventoAnthropic;
        try {
          json = JSON.parse(data) as EventoAnthropic;
        } catch {

          continue;
        }
        try {
          if (json.type === "content_block_start") {
            const block = json.content_block;
            if (block?.type === "tool_use" && typeof json.index === "number") {
              toolUseAccum[json.index] = {
                id: block.id ?? "",
                name: block.name ?? "",
                jsonBuf: "",
              };
            }
          } else if (json.type === "content_block_delta") {
            if (json.delta?.type === "text_delta") {
              const token = json.delta.text;
              if (typeof token === "string" && token.length > 0) {
                accumulatedText += token;
                onToken(token);
              }
            } else if (json.delta?.type === "thinking_delta") {

              const th = json.delta.thinking;
              if (onReasoning && typeof th === "string" && th.length > 0) {
                onReasoning(th);
              }
            } else if (json.delta?.type === "input_json_delta") {
              const idx = json.index ?? -1;
              if (toolUseAccum[idx]) {
                toolUseAccum[idx].jsonBuf += json.delta.partial_json ?? "";
              }
            }
          } else if (json.type === "message_start") {
            inputTokens = json.message?.usage?.input_tokens ?? 0;
          } else if (json.type === "message_delta") {
            outputTokens = json.usage?.output_tokens ?? outputTokens;
          } else if (json.type === "message_stop") {

            const stopOut =
              json.message?.usage?.output_tokens ??
              json.usage?.output_tokens ??
              0;
            if (stopOut > outputTokens) outputTokens = stopOut;
            if (onUsage) onUsage({ input: inputTokens, output: outputTokens });
            return buildAnthropicStreamResponse(
              accumulatedText,
              toolUseAccum,
              inputTokens,
              outputTokens
            );
          } else if (json.type === "error") {
            throw new ProviderError(
              `Anthropic: ${json.error?.message ?? "error during stream"}`,
              "unknown"
            );
          }
        } catch (err) {
          if (err instanceof ProviderError) throw err;

          throw err;
        }
      }
    }
    } finally {

      try {
        await reader.cancel();
      } catch { void 0; }
    }

    if (onUsage && (inputTokens > 0 || outputTokens > 0)) {
      onUsage({ input: inputTokens, output: outputTokens });
    }
    return buildAnthropicStreamResponse(
      accumulatedText,
      toolUseAccum,
      inputTokens,
      outputTokens
    );
  }

  private curatedModels(): string[] {
    return [
      "claude-fable-5",
      "claude-opus-4-8",
      "claude-sonnet-4-6",
      "claude-haiku-4-5-20251001",
    ];
  }

  async listModels(apiKey: string): Promise<string[]> {

    if (!apiKey || !apiKey.trim()) return this.curatedModels();
    try {
      const res = await requestUrl({
        url: "https://api.anthropic.com/v1/models?limit=100",
        method: "GET",
        headers: {
          "x-api-key": apiKey.trim(),
          "anthropic-version": ANTHROPIC_VERSION,
          "anthropic-dangerous-direct-browser-access": "true",
        },
        throw: false,
      });
      if (res.status < 200 || res.status >= 300) return this.curatedModels();
      const catalogo = res.json as ModelosAnthropic | undefined;
      const ids: string[] = (catalogo?.data ?? [])
        .map((m) => m.id)
        .filter((id): id is string => typeof id === "string");

      const merged = Array.from(new Set([...ids, ...this.curatedModels()]));
      return merged.length > 0 ? merged : this.curatedModels();
    } catch {
      return this.curatedModels();
    }
  }
}

function buildAnthropicStreamResponse(
  text: string,
  toolUseAccum: Record<number, { id: string; name: string; jsonBuf: string }>,
  inputTokens: number,
  outputTokens: number
): ProviderResponse {
  const indices = Object.keys(toolUseAccum)
    .map((k) => Number(k))
    .sort((a, b) => a - b);
  const toolCalls: ProviderToolCall[] = [];
  for (const i of indices) {
    const acc = toolUseAccum[i];
    if (!acc.name) continue;
    let parsedArgs: Record<string, unknown> = {};
    try {

      parsedArgs = acc.jsonBuf
        ? (JSON.parse(acc.jsonBuf) as Record<string, unknown>)
        : {};
    } catch {
      parsedArgs = { _raw: acc.jsonBuf };
    }
    toolCalls.push({

      id: acc.id || `anthropic_call_${crypto.randomUUID()}`,
      name: acc.name,
      arguments: parsedArgs,
    });
  }
  const result: ProviderResponse = { content: text };
  if (toolCalls.length > 0) result.toolCalls = toolCalls;
  if (inputTokens > 0 || outputTokens > 0) {
    result.usage = { input: inputTokens, output: outputTokens };
  }
  return result;
}

export const anthropicProvider = new AnthropicProvider();
