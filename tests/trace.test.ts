import { describe, it, expect } from "vitest";
import {
  buildTrace,
  buildTurnTraces,
  dedupeItems,
  elapsedLabel,
  resultLine,
  summaryLabel,
  currentStepLabel,
  type TraceItem,
} from "../src/ui/trace";
import type { ChatMessage, ActivityMeta } from "../src/store/chat";

let n = 0;
const thought = (text: string, ts = 1000): ChatMessage => ({
  id: `t${++n}`,
  type: "ai-comment",
  content: "",
  thought: text,
  timestamp: ts,
});
const tool = (
  label: string,
  phase: ActivityMeta["phase"] = "done",
  extra: Partial<ActivityMeta> = {},
  content = "",
  ts = 1000
): ChatMessage => ({
  id: `a${++n}`,
  type: "ai-comment",
  content,
  timestamp: ts,
  activity: {
    phase,
    toolName: "vault_read",
    iconPending: "eye",
    pendingText: label,
    doneText: label,
    failedText: label,
    ...extra,
  },
});
const placeholder = (): ChatMessage => ({
  id: `p${++n}`,
  type: "ai-comment",
  content: "",
  timestamp: 900,
  activity: {
    phase: "done",
    iconPending: "sparkles",
    pendingText: "Agent thinking...",
  },
});
const response = (extra: Partial<ChatMessage> = {}): ChatMessage =>
  ({
    id: `r${++n}`,
    type: "ai-response",
    content: "answer",
    timestamp: 13000,
    ...extra,
  }) as ChatMessage;
const user = (): ChatMessage => ({
  id: `u${++n}`,
  type: "user",
  content: "hi",
  timestamp: 0,
});

describe("buildTrace", () => {
  it("keeps thinking and tool calls in chronological order and drops the placeholder", () => {
    const g = buildTrace([
      placeholder(),
      thought("plan"),
      tool("Read A"),
      thought("next"),
      tool("Read B"),
    ]);
    expect(g.items.map((i) => (i.kind === "thought" ? i.text : i.label))).toEqual([
      "plan",
      "Read A",
      "next",
      "Read B",
    ]);
    expect(g.startedAt).toBe(900);
  });

  it("falls back to reasoning followed by steps for legacy responses", () => {
    const r = response({
      reasoning: "old thoughts",
      agentSteps: [
        { id: "1", name: "vault_read", arguments: { path: "A.md" }, result: "x", ok: true },
      ],
    }) as never;
    const g = buildTrace([], r);
    expect(g.items.map((i) => i.kind)).toEqual(["thought", "tool"]);
    expect(g.items[1]).toMatchObject({ label: "Read A.md", status: "done" });
    expect(g.endedAt).toBeNull();
  });

  it("does not duplicate steps when activity comments exist", () => {
    const r = response({
      agentSteps: [
        { id: "1", name: "vault_read", arguments: {}, result: "x", ok: true },
      ],
    }) as never;
    const g = buildTrace([tool("Read A")], r);
    expect(g.items).toHaveLength(1);
    expect(g.endedAt).toBe(13000);
  });

  it("uses the tool summary as the result line and keeps full output for expansion", () => {
    const g = buildTrace([
      tool("Read A", "done", { detail: "line one\nline two" }, "1.2k chars"),
    ]);
    expect(g.items[0]).toMatchObject({
      result: "1.2k chars",
      output: "line one\nline two",
    });
  });
});

describe("buildTurnTraces", () => {
  it("attaches comments to the following response and keeps the trailing ones live", () => {
    const t1 = thought("a");
    const r = response();
    const t2 = tool("Read B", "pending");
    const t = buildTurnTraces([user(), t1, r, t2]);
    expect(t.hidden.has(t1.id)).toBe(true);
    expect(t.byResponse.get(r.id)?.items).toHaveLength(1);
    expect(t.live?.items).toHaveLength(1);
  });

  it("reuses unchanged groups while the answer streams", () => {
    const t1 = thought("a");
    const r = response();
    const first = buildTurnTraces([user(), t1, r]);
    const streamed = { ...r, content: "answer more" } as ChatMessage;
    const second = buildTurnTraces([user(), t1, streamed], first);
    expect(second.byResponse.get(r.id)).toBe(first.byResponse.get(r.id));
  });
});

describe("dedupeItems", () => {
  it("drops empty thoughts and consecutive identical tool rows", () => {
    const a = buildTrace([thought("  "), tool("Read A"), tool("Read A"), tool("Read B")]);
    expect(a.items).toHaveLength(2);
  });

  it("keeps repeats separated by other items", () => {
    const items = buildTrace([tool("Read A"), thought("x"), tool("Read A")]).items;
    expect(dedupeItems(items)).toHaveLength(3);
  });
});

describe("labels", () => {
  const items = (): TraceItem[] =>
    buildTrace([thought("x"), tool("Read A"), tool("Read B", "failed")]).items;

  it("summarises elapsed time and steps", () => {
    expect(summaryLabel(items(), 12000)).toBe("Thought for 12s · 2 steps · 1 failed");
    expect(summaryLabel(buildTrace([tool("Read A")]).items, null)).toBe("Thought · 1 step");
    expect(summaryLabel(buildTrace([thought("x")]).items, 100)).toBe("Thought for 1s");
  });

  it("formats elapsed time", () => {
    expect(elapsedLabel(72_000)).toBe("1m 12s");
    expect(elapsedLabel(-3000)).toBe("0s");
  });

  it("reports the pending step", () => {
    expect(currentStepLabel(buildTrace([tool("Read A", "pending")]).items)).toBe("Read A");
    expect(currentStepLabel(items())).toBe("");
  });

  it("uses the first non-empty line and truncates with an ellipsis", () => {
    expect(resultLine("\n  7 notes found\nmore")).toBe("7 notes found");
    expect(resultLine("x".repeat(200))).toHaveLength(80);
    expect(resultLine("x".repeat(200)).endsWith("…")).toBe(true);
    expect(resultLine(undefined)).toBe("");
  });
});
