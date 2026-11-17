import { ProviderError } from "../providers/base";
import type { Translations } from "../i18n/en-us";
import type { AIErrorCode } from "../store/chat";
import { asText } from "./text";
import { tr } from "../i18n/tr";

export function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function agentActivitySpec(
  toolName: string,
  args: Record<string, unknown>
): {
  iconPending: string;
  iconDone: string;
  pendingText: string;
  doneText: string;
  failedText: string;
} {
  const path = asText(args.path) || asText(args.from) || asText(args.folder);

  const shorten = (p: string) => (p.length > 48 ? "…" + p.slice(-46) : p);
  const shortPath = shorten(path);

  const target = asText(args.to);
  const shortTo = target ? shorten(target) : "?";
  const query = asText(args.query).slice(0, 40);
  const pathArgs = { path: shortPath };

  switch (toolName) {
    case "vault_search":
      return {
        iconPending: "radar",
        iconDone: "search-check",
        pendingText: tr("Searching \"{query}\"", { query }),
        doneText: tr("Searched \"{query}\"", { query }),
        failedText: tr("Failed on \"{query}\"", { query }),
      };
    case "vault_list":
      return shortPath
        ? {
            iconPending: "folder-search",
            iconDone: "folder-check",
            pendingText: tr("Listing {path}", pathArgs),
            doneText: tr("Listed {path}", pathArgs),
            failedText: tr("Failed on {path}", pathArgs),
          }
        : {
            iconPending: "folder-search",
            iconDone: "folder-check",
            pendingText: tr("Listing root"),
            doneText: tr("Listed root"),
            failedText: tr("Failed on root"),
          };
    case "vault_read":
      return {
        iconPending: "eye",
        iconDone: "file-check-2",
        pendingText: tr("Reading {path}", pathArgs),
        doneText: tr("Read {path}", pathArgs),
        failedText: tr("Failed on {path}", pathArgs),
      };
    case "vault_create":
      return {
        iconPending: "file-plus-2",
        iconDone: "file-check-2",
        pendingText: tr("Creating {path}", pathArgs),
        doneText: tr("Created {path}", pathArgs),
        failedText: tr("Failed on {path}", pathArgs),
      };
    case "vault_edit":
      return {
        iconPending: "file-pen-line",
        iconDone: "file-check-2",
        pendingText: tr("Editing {path}", pathArgs),
        doneText: tr("Edited {path}", pathArgs),
        failedText: tr("Failed on {path}", pathArgs),
      };
    case "vault_move": {
      const route = { from: shortPath, to: shortTo };
      return {
        iconPending: "move",
        iconDone: "check-circle-2",
        pendingText: tr("Moving {from} → {to}", route),
        doneText: tr("Moved {from} → {to}", route),
        failedText: tr("Failed on {from} → {to}", route),
      };
    }
    case "vault_delete":
      return {
        iconPending: "trash-2",
        iconDone: "circle-check-big",
        pendingText: tr("Deleting {path}", pathArgs),
        doneText: tr("Deleted {path}", pathArgs),
        failedText: tr("Failed on {path}", pathArgs),
      };
    case "vault_create_folder":
      return {
        iconPending: "folder-plus",
        iconDone: "folder-check",
        pendingText: tr("Creating folder {path}", pathArgs),
        doneText: tr("Created folder {path}", pathArgs),
        failedText: tr("Failed on folder {path}", pathArgs),
      };
    case "web_search":
      return {
        iconPending: "globe",
        iconDone: "globe",
        pendingText: tr("Searching the web for \"{query}\"", { query }),
        doneText: tr("Searched the web for \"{query}\"", { query }),
        failedText: tr("Failed on web search \"{query}\"", { query }),
      };
    case "web_fetch": {
      let host = asText(args.url);
      try {
        host = new URL(host).hostname;
      } catch { void 0; }
      const site = { host: shorten(host) };
      return {
        iconPending: "link",
        iconDone: "link",
        pendingText: tr("Opening {host}", site),
        doneText: tr("Read {host}", site),
        failedText: tr("Failed on {host}", site),
      };
    }
    default:
      return {
        iconPending: "wrench",
        iconDone: "check-circle-2",
        pendingText: tr("Running {tool}", { tool: toolName }),
        doneText: tr("{tool} completed", { tool: toolName }),
        failedText: tr("Failed on {tool}", { tool: toolName }),
      };
  }
}

export function summarizeToolResult(toolName: string, result: string): string {
  if (!result) return "";
  switch (toolName) {
    case "vault_list": {

      const m = /\((\d+)\s+items?\)/.exec(result);
      if (!m) return "";
      return m[1] === "1" ? tr("1 item") : tr("{n} items", { n: m[1] });
    }
    case "vault_read":
      return tr("{n} chars", {
        n: result.length >= 1000 ? (result.length / 1000).toFixed(1) + "k" : result.length,
      });
    case "vault_create": {
      const m = /\((\d+)\s+chars\)/.exec(result);
      return m ? tr("{n} chars", { n: m[1] }) : "";
    }
    case "vault_edit": {
      const m = /\(([+-]\d+)\s+chars\)/.exec(result);
      return m ? tr("{n} chars", { n: m[1] }) : "";
    }
    default:
      return "";
  }
}

export function describeProviderError(
  err: unknown,
  t: Translations,
  providerName: string
): { message: string; code: AIErrorCode } {
  if (err instanceof ProviderError) {
    switch (err.code) {
      case "no-key":
        return { message: t.ai.err.noKey(providerName), code: "no-key" };
      case "invalid-key":
        return { message: t.ai.err.invalidKey(providerName), code: "invalid-key" };
      case "rate-limit":
        return { message: t.ai.err.rateLimit, code: "rate-limit" };
      case "network":
        return { message: t.ai.err.network, code: "network" };
      case "billing":
        return { message: t.ai.err.billing, code: "billing" };
      case "context-overflow":
        return { message: t.ai.err.contextOverflow, code: "context-overflow" };
      default:

        return { message: err.message || t.ai.unknownError, code: "unknown" };
    }
  }
  if (err instanceof Error) {
    return { message: err.message || t.ai.unknownError, code: "unknown" };
  }
  return { message: t.ai.unknownError, code: "unknown" };
}

function providerNeedsKey(providerId: string): boolean {
  return providerId !== "ollama";
}

export function missingCredentialError(
  providerId: string,
  credential: string,
  t: Translations,
  providerName: string
): string | null {
  if (credential.trim()) return null;
  return providerNeedsKey(providerId)
    ? t.ai.err.noKey(providerName)
    : t.ai.err.noEndpoint(providerName);
}
