import { describe, it, expect } from "vitest";
import {
  parseChatMarkdown,
  renderChatMarkdown,
  type ChatData,
} from "../src/core/chatPersistence";
import { limparMarcas } from "../src/core/chatExport";
import {
  MAX_THOUGHT_CHARS,
  fromStoredTrace,
  storedTracesByResponse,
  toStoredTrace,
} from "../src/core/tracePersist";
import { buildTrace } from "../src/ui/trace";
import type { ChatMessage } from "../src/store/chat";

const base = (): Omit<ChatData, "messages"> => ({
  id: "c1",
  title: "T",
  date: "2026-01-01T00:00:00.000Z",
  mode: "agent",
  provider: "openai",
  model: "m",
  effort: "low",
  tokensIn: 0,
  tokensOut: 0,
});

const live: ChatMessage[] = [
  { id: "u", type: "user", content: "hi", timestamp: 1 },
  { id: "t1", type: "ai-comment", content: "", thought: "plan it", timestamp: 2 },
  {
    id: "a1",
    type: "ai-comment",
    content: "7 items",
    timestamp: 3,
    activity: {
      phase: "done",
      toolName: "vault_list",
      toolArguments: { path: "" },
      iconPending: "folder-search",
      iconDone: "folder-check",
      pendingText: "Listing root",
      doneText: "Listed root",
    },
  },
  { id: "t2", type: "ai-comment", content: "", thought: "now read", timestamp: 4 },
  { id: "r", type: "ai-response", content: "Done <b>", timestamp: 5 },
];

describe("trace persistence", () => {
  it("round-trips the ordered trace through the chat markdown", () => {
    const stored = storedTracesByResponse(live).get("r");
    const md = renderChatMarkdown({
      ...base(),
      messages: [
        { type: "user", content: "hi", timestamp: 1 },
        { type: "ai-response", content: "Done <b>", timestamp: 5, trace: stored },
      ],
    });
    expect(md).toContain("<!-- corvus-trace:");
    const loaded = parseChatMarkdown(md).messages[1];
    expect(loaded.content).toBe("Done <b>");
    expect(loaded.trace).toEqual(stored);
    const restored = buildTrace([], {
      id: "r2",
      type: "ai-response",
      content: loaded.content,
      timestamp: 5,
      trace: fromStoredTrace(loaded.trace ?? [], "trace"),
    });
    const original = buildTrace(live.slice(1, 4), live[4] as never);
    const strip = (items: typeof original.items) =>
      items.map(({ id: _id, ...rest }) => rest);
    expect(strip(restored.items)).toEqual(strip(original.items));
    expect(restored.items.map((i) => i.kind)).toEqual(["thought", "tool", "thought"]);
  });

  it("loads files without a trace comment unchanged", () => {
    const md = renderChatMarkdown({
      ...base(),
      messages: [
        { type: "user", content: "hi", timestamp: 1 },
        {
          type: "ai-response",
          content: "ok",
          timestamp: 2,
          agentSteps: [{ id: "1", name: "vault_list", arguments: {}, result: "x", ok: true }],
        },
      ],
    });
    expect(md).not.toContain("corvus-trace");
    const m = parseChatMarkdown(md).messages[1];
    expect(m.trace).toBeUndefined();
    expect(m.agentSteps).toHaveLength(1);
    expect(m.content).toBe("ok");
  });

  it("caps stored thought text", () => {
    const stored = toStoredTrace([
      { kind: "thought", id: "1", text: "a".repeat(MAX_THOUGHT_CHARS + 500) },
      { kind: "thought", id: "2", text: "dropped" },
    ]);
    expect(stored).toHaveLength(1);
    const first = stored[0];
    expect(first.kind === "thought" && first.text.length).toBe(MAX_THOUGHT_CHARS + 1);
  });

  it("does not leak the blob into exports", () => {
    const md = renderChatMarkdown({
      ...base(),
      messages: [
        {
          type: "ai-response",
          content: "answer",
          timestamp: 2,
          trace: [{ kind: "thought", text: "secret reasoning" }],
        },
      ],
    });
    const out = limparMarcas(md);
    expect(out).not.toContain("corvus-trace");
    expect(out).toContain("answer");
  });
});
