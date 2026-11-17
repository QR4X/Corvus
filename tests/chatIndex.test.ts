import { describe, it, expect } from "vitest";
import { chatIndexSignature } from "../src/core/chatIndex";
import type { ChatSummary } from "../src/core/chatPersistence";

const chat = (over: Partial<ChatSummary> = {}): ChatSummary => ({
  id: "a",
  title: "t",
  date: "2026-09-16T10:00:00.000Z",
  mode: "agent",
  provider: "openai",
  model: "gpt-5",
  effort: "",
  tokensIn: 0,
  tokensOut: 0,
  messageCount: 2,
  toolCount: 3,
  filePath: "p",
  starred: false,
  preview: "moved 18 notes",
  ...over,
});

describe("chatIndexSignature", () => {
  it("gives equal lists the same signature", () => {
    expect(chatIndexSignature([chat()])).toBe(chatIndexSignature([chat()]));
  });

  it("changes when anything the card shows changes", () => {
    const base = chatIndexSignature([chat()]);
    const changes: Array<Partial<ChatSummary>> = [
      { title: "other" },
      { date: "2026-09-17T10:00:00.000Z" },
      { model: "gpt-5-mini" },
      { messageCount: 3 },
      { tokensIn: 10 },
      { tokensOut: 10 },
      { toolCount: 4 },
      { starred: true },
      { preview: "something else" },
    ];
    for (const m of changes) {
      expect(chatIndexSignature([chat(m)])).not.toBe(base);
    }
  });

  it("does not treat an old index without the preview field as current", () => {
    const old = { ...chat(), preview: undefined } as unknown as ChatSummary;
    expect(chatIndexSignature([old])).not.toBe(chatIndexSignature([chat()]));
  });

  it("changes when the number of chats changes", () => {
    expect(chatIndexSignature([chat(), chat({ id: "b" })])).not.toBe(
      chatIndexSignature([chat()])
    );
  });

  it("gives an empty list its own signature", () => {
    expect(chatIndexSignature([])).toBe("0:");
  });
});
