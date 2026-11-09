import type { EffortLevel } from "../core/effort";

export interface ProviderToolDefinition {
  name: string;
  description: string;
  parameters: object;
}

export interface ProviderToolCall {

  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ImageAttachment {
  type: "image";

  dataUrl: string;

  mimeType?: string;

  name?: string;

  path?: string;
}

export interface NoteAttachment {
  type: "note";

  path: string;

  content: string;
}

export interface PdfAttachment {
  type: "pdf";
  path?: string;
  dataUrl?: string;
  name: string;
}

export interface AudioAttachment {
  type: "audio";

  path: string;

  durationMs?: number;
}

export type MessageAttachment =
  | ImageAttachment
  | NoteAttachment
  | PdfAttachment
  | AudioAttachment;

export interface ProviderMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;

  toolCalls?: ProviderToolCall[];

  toolCallId?: string;

  attachments?: MessageAttachment[];
}

export interface ProviderRequest {
  model: string;
  messages: ProviderMessage[];
  maxTokens?: number;

  tools?: ProviderToolDefinition[];

  temperature?: number;

  effort?: EffortLevel;

  onRecovery?: () => void;
}

export interface ProviderResponse {
  content: string;

  toolCalls?: ProviderToolCall[];
  usage?: { input: number; output: number };

  reasoning?: string;
  finishReason?: string;

  streamCompleted?: boolean;
  invalidToolCalls?: boolean;
}

export function responseIssue(response: ProviderResponse):
  "outputLimit" | "streamIncomplete" | "invalidToolResponse" | "emptyResponse" | undefined {
  if (response.finishReason === "length") return "outputLimit";
  if (response.streamCompleted === false) return "streamIncomplete";
  if (response.invalidToolCalls) return "invalidToolResponse";
  if (!response.content.trim() && !response.toolCalls?.length) return "emptyResponse";
  return undefined;
}

export type TokenHandler = (token: string) => void;

export type ReasoningHandler = (delta: string) => void;

export interface Usage {
  input: number;
  output: number;
}

export type UsageHandler = (usage: Usage) => void;

export interface MediaGenerationRequest {
  model: string;
  prompt: string;

  size?: "1024x1024" | "1024x1792" | "1792x1024" | "512x512" | "auto";

  n?: number;

  seed?: number;

  voice?: string;

  image?: { data: string; mimeType: string };
}

export interface MediaGenerationItem {

  data: Uint8Array;

  mime: string;
  width?: number;
  height?: number;

  duration?: number;

  seed?: number;

  text?: string;
}

export interface Provider {
  id: string;
  name: string;

  supportsTools?: boolean;
  chat(request: ProviderRequest, apiKey: string): Promise<ProviderResponse>;

  streamChat(
    request: ProviderRequest,
    apiKey: string,
    onToken: TokenHandler,
    onUsage?: UsageHandler,
    signal?: AbortSignal,
    onReasoning?: ReasoningHandler
  ): Promise<ProviderResponse>;

  generateImage?(
    request: MediaGenerationRequest,
    apiKey: string
  ): Promise<MediaGenerationItem[]>;
  generateAudio?(
    request: MediaGenerationRequest,
    apiKey: string
  ): Promise<MediaGenerationItem[]>;
  generateVideo?(
    request: MediaGenerationRequest,
    apiKey: string
  ): Promise<MediaGenerationItem[]>;

  listModels?(apiKey: string): Promise<string[]>;

  listFreeModels?(apiKey: string): Promise<string[]>;

  freeQuota?(apiKey: string): Promise<{ limit: number; remaining?: number } | null>;

  keyStatus?(apiKey: string): Promise<import("./openrouter").EstadoDaChave | null>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "no-key"
      | "invalid-key"
      | "rate-limit"
      | "network"

      | "billing"

      | "context-overflow"
      | "unknown"
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
