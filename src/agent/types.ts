import type { App } from "obsidian";
import type { VectorIndex } from "../rag/vectorIndex";

export interface AIToolStep {

  id: string;
  name: string;
  arguments: Record<string, unknown>;

  result: string;

  ok: boolean;
}

export type PermissionLevel = "ask" | "vault" | "yolo";

export interface ToolContext {
  app: App;

  vectorIndex: VectorIndex | null;

  appDataPaths?: readonly string[];

  embed: {
    openaiApiKey: string;
    openrouterApiKey: string;
    geminiApiKey?: string;
    nimApiKey?: string;
    ollamaEndpoint?: string;
  };

  web?: { tavilyApiKey: string };
}

export interface ToolDefinition {

  name: string;

  description: string;

  parameters: {
    type: "object";
    properties: Record<
      string,
      {
        type: "string" | "number" | "boolean" | "array" | "object";
        description: string;
        items?: { type: string };
      }
    >;
    required: string[];
  };

  destructive: boolean;

  irreversible?: boolean;

  network?: boolean;
}

export interface ToolCall {

  id: string;

  name: string;

  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;

  content: string;

  isError?: boolean;
}

export interface ToolExecution {
  toolCall: ToolCall;
  status: "pending" | "approved" | "denied" | "running" | "done" | "error";
  result?: ToolResult;

  label: string;
}

export interface PermissionDecision {

  autoApprove: boolean;
}
