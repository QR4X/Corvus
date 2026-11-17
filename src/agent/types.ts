import type { Credentials } from "../core/providersMeta";
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

  embed: Credentials;

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

export interface PermissionDecision {

  autoApprove: boolean;
}
