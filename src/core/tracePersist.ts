import type { ChatMessage } from "../store/chat";
import { buildTurnTraces, type TraceItem, type TraceTool } from "../ui/trace";

export type StoredTraceItem =
  | { kind: "thought"; text: string }
  | {
      kind: "tool";
      label: string;
      icon: string;
      status: TraceTool["status"];
      result: string;
      toolName?: string;
      args?: Record<string, unknown>;
      output?: string;
    };

export const MAX_THOUGHT_CHARS = 20000;
const MAX_OUTPUT_CHARS = 600;
const MAX_ARGS_CHARS = 1000;

export function toStoredTrace(items: TraceItem[]): StoredTraceItem[] {
  let budget = MAX_THOUGHT_CHARS;
  const out: StoredTraceItem[] = [];
  for (const item of items) {
    if (item.kind === "thought") {
      if (budget <= 0 || !item.text.trim()) continue;
      const text =
        item.text.length > budget ? item.text.slice(0, budget).trimEnd() + "…" : item.text;
      budget -= item.text.length;
      out.push({ kind: "thought", text });
      continue;
    }
    const args =
      item.args && JSON.stringify(item.args).length <= MAX_ARGS_CHARS
        ? item.args
        : undefined;
    out.push({
      kind: "tool",
      label: item.label,
      icon: item.icon,
      status: item.status === "pending" ? "failed" : item.status,
      result: item.result,
      ...(item.toolName ? { toolName: item.toolName } : {}),
      ...(args ? { args } : {}),
      ...(item.output ? { output: item.output.slice(0, MAX_OUTPUT_CHARS) } : {}),
    });
  }
  return out;
}

export function fromStoredTrace(items: StoredTraceItem[], prefix: string): TraceItem[] {
  return items.map((item, i): TraceItem =>
    item.kind === "thought"
      ? { kind: "thought", id: `${prefix}-${i}`, text: item.text }
      : { ...item, id: `${prefix}-${i}` }
  );
}

export function storedTracesByResponse(
  messages: ChatMessage[]
): Map<string, StoredTraceItem[]> {
  const out = new Map<string, StoredTraceItem[]>();
  for (const [id, group] of buildTurnTraces(messages).byResponse) {
    const stored = toStoredTrace(group.items);
    if (stored.some((i) => i.kind === "thought")) out.set(id, stored);
  }
  return out;
}

export function isStoredTrace(value: unknown): value is StoredTraceItem[] {
  return (
    Array.isArray(value) &&
    value.every(
      (v) =>
        v &&
        typeof v === "object" &&
        ((v as { kind?: string }).kind === "thought"
          ? typeof (v as { text?: unknown }).text === "string"
          : (v as { kind?: string }).kind === "tool" &&
            typeof (v as { label?: unknown }).label === "string")
    )
  );
}
