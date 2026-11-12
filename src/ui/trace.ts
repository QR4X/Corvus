import type { AIToolStep } from "../agent/types";
import { agentActivitySpec } from "../core/helpers";
import { tr } from "../i18n/tr";
import type {
  ActivityMeta,
  AIResponseMessage,
  ChatMessage,
} from "../store/chat";

export type TraceStatus = "pending" | "done" | "failed";

export interface TraceThought {
  kind: "thought";
  id: string;
  text: string;
}

export interface TraceTool {
  kind: "tool";
  id: string;
  icon: string;
  label: string;
  status: TraceStatus;
  result: string;
  toolName?: string;
  args?: Record<string, unknown>;
  output?: string;
  undoId?: string;
  undone?: boolean;
}

export type TraceItem = TraceThought | TraceTool;

export interface TraceGroup {
  items: TraceItem[];
  startedAt: number | null;
  endedAt: number | null;
  sources: unknown[];
}

export interface TurnTraces {
  hidden: Set<string>;
  byResponse: Map<string, TraceGroup>;
  live: TraceGroup | null;
}

const RESULT_MAX = 80;

export function elapsedLabel(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${String(s % 60).padStart(2, "0")}s`;
}

export function resultLine(text: string | undefined): string {
  if (!text) return "";
  const first = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!first) return "";
  return first.length > RESULT_MAX ? first.slice(0, RESULT_MAX - 1).trimEnd() + "…" : first;
}

export function isPlaceholder(activity: ActivityMeta): boolean {
  return !activity.toolName && activity.iconPending === "sparkles";
}

function activityStatus(activity: ActivityMeta): TraceStatus {
  return activity.phase;
}

function activityLabel(activity: ActivityMeta): string {
  if (activity.phase === "pending") return activity.pendingText;
  if (activity.phase === "done") return activity.doneText ?? activity.pendingText;
  return activity.failedText ?? tr("Failed");
}

function activityIcon(activity: ActivityMeta): string {
  if (activity.phase === "failed") return activity.iconFailed ?? "circle-alert";
  if (activity.phase === "done") return activity.iconDone ?? activity.iconPending;
  return activity.iconPending;
}

export function toolFromActivity(
  id: string,
  activity: ActivityMeta,
  content: string
): TraceTool {
  const summary = resultLine(content) || resultLine(activity.detail);
  return {
    kind: "tool",
    id,
    icon: activityIcon(activity),
    label: activityLabel(activity),
    status: activityStatus(activity),
    result: summary,
    toolName: activity.toolName,
    args: activity.toolArguments,
    output: activity.detail || content || undefined,
    undoId: activity.undoId,
    undone: activity.undone,
  };
}

export function toolFromStep(step: AIToolStep, index: number): TraceTool {
  const spec = agentActivitySpec(step.name, step.arguments ?? {});
  return {
    kind: "tool",
    id: `step-${step.id || index}`,
    icon: step.ok ? spec.iconDone : "circle-alert",
    label: step.ok ? spec.doneText : spec.failedText,
    status: step.ok ? "done" : "failed",
    result: resultLine(step.result),
    toolName: step.name,
    args: step.arguments,
    output: step.result || undefined,
  };
}

function sameTool(a: TraceTool, b: TraceTool): boolean {
  return (
    a.toolName === b.toolName &&
    a.label === b.label &&
    a.status === b.status &&
    a.result === b.result &&
    JSON.stringify(a.args ?? null) === JSON.stringify(b.args ?? null)
  );
}

export function dedupeItems(items: TraceItem[]): TraceItem[] {
  const out: TraceItem[] = [];
  for (const item of items) {
    if (item.kind === "thought" && !item.text.trim()) continue;
    const prev = out[out.length - 1];
    if (prev && prev.kind === "tool" && item.kind === "tool" && sameTool(prev, item)) {
      continue;
    }
    out.push(item);
  }
  return out;
}

export function buildTrace(
  comments: ChatMessage[],
  response?: AIResponseMessage
): TraceGroup {
  const items: TraceItem[] = [];
  const sources: unknown[] = [];
  let startedAt: number | null = null;
  let hasActivity = false;

  for (const m of comments) {
    if (m.type !== "ai-comment") continue;
    sources.push(m);
    if (startedAt === null) startedAt = m.timestamp;
    if (m.thought !== undefined) {
      items.push({ kind: "thought", id: m.id, text: m.thought });
    } else if (m.activity && !isPlaceholder(m.activity)) {
      hasActivity = true;
      items.push(toolFromActivity(m.id, m.activity, m.content));
    }
  }

  if (response?.trace?.length && items.length === 0) {
    items.push(...response.trace);
  } else if (response) {
    sources.push(response.reasoning, response.agentSteps, response.trace);
    const hasThought = items.some((i) => i.kind === "thought");
    if (response.reasoning && !hasThought) {
      items.unshift({
        kind: "thought",
        id: `reasoning-${response.id}`,
        text: response.reasoning,
      });
    }
    if (!hasActivity && response.agentSteps) {
      response.agentSteps.forEach((step, i) => items.push(toolFromStep(step, i)));
    }
  }

  return {
    items: dedupeItems(items),
    startedAt,
    endedAt: response && startedAt !== null ? response.timestamp : null,
    sources,
  };
}

function reusable(prev: TraceGroup | undefined, next: TraceGroup): boolean {
  return (
    !!prev &&
    prev.sources.length === next.sources.length &&
    prev.sources.every((s, i) => s === next.sources[i])
  );
}

export function buildTurnTraces(
  messages: ChatMessage[],
  prev?: TurnTraces
): TurnTraces {
  const hidden = new Set<string>();
  const byResponse = new Map<string, TraceGroup>();
  let bucket: ChatMessage[] = [];

  for (const m of messages) {
    if (m.type === "ai-comment" && (m.activity || m.thought !== undefined)) {
      bucket.push(m);
      hidden.add(m.id);
    } else if (m.type === "ai-response") {
      const group = buildTrace(bucket, m);
      const old = prev?.byResponse.get(m.id);
      byResponse.set(m.id, reusable(old, group) ? (old as TraceGroup) : group);
      bucket = [];
    } else if (m.type === "user") {
      bucket = [];
    }
  }

  let live: TraceGroup | null = null;
  if (bucket.length > 0) {
    const group = buildTrace(bucket);
    live = reusable(prev?.live ?? undefined, group) ? (prev?.live ?? group) : group;
  }
  return { hidden, byResponse, live };
}

export function countSteps(items: TraceItem[]): number {
  return items.filter((i) => i.kind === "tool").length;
}

export function countFailed(items: TraceItem[]): number {
  return items.filter((i) => i.kind === "tool" && i.status === "failed").length;
}

export function currentStepLabel(items: TraceItem[]): string {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.kind === "tool" && item.status === "pending") return item.label;
  }
  return "";
}

export function summaryLabel(
  items: TraceItem[],
  elapsedMs: number | null,
  stopped = false
): string {
  const time = elapsedMs === null ? "" : elapsedLabel(Math.max(1000, elapsedMs));
  const parts = [
    stopped
      ? time
        ? tr("Stopped after {time}", { time })
        : tr("Stopped")
      : time
        ? tr("Thought for {time}", { time })
        : tr("Thought"),
  ];
  const steps = countSteps(items);
  if (steps > 0) {
    parts.push(steps === 1 ? tr("1 step") : tr("{n} steps", { n: steps }));
  }
  const failed = countFailed(items);
  if (failed > 0) parts.push(tr("{n} failed", { n: failed }));
  return parts.join(" · ");
}

export function hasTrace(items: TraceItem[]): boolean {
  return items.length > 0;
}
