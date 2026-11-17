import { describe, it, expect } from "vitest";
import {
  renderChatMarkdown,
  parseChatMarkdown,
  summaryFromFrontmatter,
  type ChatData,
} from "../src/core/chatPersistence";

const baseChat: ChatData = {
  id: "abc123",
  title: "Test chat",
  date: "2026-06-10T12:00:00.000Z",
  mode: "chat",
  provider: "anthropic",
  model: "claude-fable-5",
  effort: "high",
  tokensIn: 1234,
  tokensOut: 567,
  persona: "You are a pirate.",
  messages: [
    { type: "user", content: "Explain recursion", timestamp: 1_700_000_000_000 },
    {
      type: "ai-response",
      content: "Recursion is when...\n\n```js\nfunction f() { return f(); }\n```\n\n---\n\nend",
      timestamp: 1_700_000_001_000,
      reaction: "like",
    },
  ],
};

describe("chat persistence round-trip", () => {
  it("preserves failed responses with completed tool actions", () => {
    const chat: ChatData = { ...baseChat, messages: [{
      type: "ai-response", content: "[Error] output limit", timestamp: 1, isError: true,
      agentSteps: [{ id: "call-1", name: "vault_read", arguments: { path: "a.md" }, result: "already read", ok: true }],
    }] };
    expect(parseChatMarkdown(renderChatMarkdown(chat))).toEqual(chat);
  });
  it("keeps every chat field, including code blocks, --- and reactions", () => {
    const restored = parseChatMarkdown(renderChatMarkdown(baseChat));
    expect(restored).toEqual(baseChat);
  });

  it("keeps a missing persona undefined instead of an empty string", () => {
    const noPersona: ChatData = { ...baseChat, persona: undefined };
    const restored = parseChatMarkdown(renderChatMarkdown(noPersona));
    expect(restored.persona).toBeUndefined();
  });

  it("does not add a reaction field to messages without one", () => {
    const restored = parseChatMarkdown(renderChatMarkdown(baseChat));
    expect("reaction" in restored.messages[0]).toBe(false);
    expect(restored.messages[1].reaction).toBe("like");
  });

  it("keeps titles with YAML special characters intact", () => {
    const tricky: ChatData = {
      ...baseChat,
      title: 'Chat: "quotes", colons & commas',
      messages: [{ type: "user", content: "hi", timestamp: 1 }],
    };
    const restored = parseChatMarkdown(renderChatMarkdown(tricky));
    expect(restored.title).toBe(tricky.title);
  });

  it("restores tokens and timestamps as numbers", () => {
    const restored = parseChatMarkdown(renderChatMarkdown(baseChat));
    expect(restored.tokensIn).toBe(1234);
    expect(restored.tokensOut).toBe(567);
    expect(restored.messages[0].timestamp).toBe(1_700_000_000_000);
  });

  it("handles a chat without messages", () => {
    const empty: ChatData = { ...baseChat, messages: [] };
    const restored = parseChatMarkdown(renderChatMarkdown(empty));
    expect(restored.messages).toEqual([]);
    expect(restored.id).toBe("abc123");
  });

  it("throws on invalid frontmatter", () => {
    expect(() => parseChatMarkdown("no frontmatter here")).toThrow();
  });

  it("keeps agentSteps whose result contains '-->' and lists tools_used in frontmatter", () => {
    const steps = [
      {
        id: "c1",
        name: "vault_create",
        arguments: { path: "notes/project.md", content: "x" },
        result: "created <!-- note --> ok",
        ok: true,
      },
      { id: "c2", name: "vault_search", arguments: { query: "architecture" }, result: "3 hits", ok: true },
    ];
    const chat: ChatData = {
      ...baseChat,
      messages: [
        { type: "user", content: "create the project", timestamp: 1 },
        { type: "ai-response", content: "Done", timestamp: 2, agentSteps: steps },
      ],
    };
    const md = renderChatMarkdown(chat);

    expect(md).toContain("tools_used:");
    expect(md).toContain("vault_create notes/project.md");

    const r = parseChatMarkdown(md);
    expect(r.messages[1].agentSteps).toEqual(steps);
    expect(r.messages[1].content).toBe("Done");
  });

  it.each([
    ["openai", "gpt-4o"],
    ["anthropic", "claude-fable-5"],
    ["openrouter", "anthropic/claude-3.5-sonnet"],
    ["openrouter", "meta-llama/llama-3.1-8b-instruct:free"],
    ["nim", "nvidia/llama-3.3-nemotron-super-49b-v1.5"],
    ["gemini", "gemini-2.5-flash-image"],
    ["ollama", "qwen2.5:14b"],
  ])("keeps provider=%s model=%s through a round-trip", (provider, model) => {
    const chat: ChatData = { ...baseChat, provider, model };
    const r = parseChatMarkdown(renderChatMarkdown(chat));
    expect(r.provider).toBe(provider);
    expect(r.model).toBe(model);
  });

  it("persists attachments as small descriptors with an exact round-trip", () => {
    const chat: ChatData = {
      ...baseChat,
      messages: [
        {
          type: "user",
          content: "look at the screenshot",
          timestamp: 1,
          attachments: [
            {
              type: "image",
              path: "corvus-ai/generation/images/1700-print.png",
              name: "print.png",
              mimeType: "image/png",
            },
            { type: "note", path: "PROJECTS/FRAMEWORKS.md" },
            { type: "pdf", name: "contract.pdf" },
            { type: "audio", path: "corvus-ai/generation/audio/1800-speech.webm", durationMs: 1200 },
            { type: "image", path: "https://example.com/photo.png", name: "photo.png" },
          ],
        },
      ],
    };
    const md = renderChatMarkdown(chat);

    expect(md).not.toContain("data:image");
    const r = parseChatMarkdown(md);

    expect(r.messages[0].content).toBe("look at the screenshot");
    expect(r.messages[0].attachments).toEqual(chat.messages[0].attachments);
  });

  it("does not add an attachments field to messages sent without one", () => {
    const md = renderChatMarkdown(baseChat);
    expect(md).not.toContain("corvus-att:");
    const r = parseChatMarkdown(md);
    expect("attachments" in r.messages[0]).toBe(false);
  });
});

describe("legacy axxa markers", () => {
  it("parses old chats with axxa markers, keeping timestamps and agentSteps", () => {
    const oldMd = `---
id: "old1"
title: "Old chat"
date: "2026-10-01T10:00:00.000Z"
mode: "agent"
provider: "openrouter"
model: "deepseek/deepseek-v4-flash-0731"
effort: "low"
tokens_in: 100
tokens_out: 50
message_count: 2
tags:
  - axxa-chat
  - axxa-mode-agent
---

## You
<!-- axxa: ts=1792000000000 -->

Question

## Assistant
<!-- axxa: ts=1792000001000 -->

Answer

<!-- axxa-steps: ${Buffer.from(JSON.stringify([{ id: "s1", name: "vault_search", arguments: { query: "x" }, result: "ok", ok: true }])).toString("base64")} -->
`;
    const chat = parseChatMarkdown(oldMd);
    expect(chat.messages[0].timestamp).toBe(1792000000000);
    expect(chat.messages[1].timestamp).toBe(1792000001000);
    expect(chat.messages[1].agentSteps?.[0].name).toBe("vault_search");
    expect(chat.messages[1].content).toBe("Answer");
  });

  it("does not leak axxa comments into the content", () => {
    const md = renderChatMarkdown(baseChat);
    const oldMd = md.replaceAll("corvus:", "axxa:").replaceAll("corvus-steps:", "axxa-steps:").replaceAll("corvus-att:", "axxa-att:");
    const r = parseChatMarkdown(oldMd);
    expect(r.messages[1].content).toBe(baseChat.messages[1].content);
  });
});

describe("chat starred", () => {
  it("survives a round-trip when starred", () => {
    const starred: ChatData = { ...baseChat, starred: true };
    const md = renderChatMarkdown(starred);
    expect(md).toContain("starred: true");
    expect(parseChatMarkdown(md).starred).toBe(true);
  });

  it("comes back undefined, not false, when absent", () => {
    const md = renderChatMarkdown(baseChat);
    expect(md).not.toContain("starred:");
    const r = parseChatMarkdown(md);
    expect(r.starred).toBeUndefined();
    expect(r).toEqual(baseChat);
  });

  it("leaves no residue in frontmatter when unstarred", () => {
    const off: ChatData = { ...baseChat, starred: false };
    const md = renderChatMarkdown(off);
    expect(md).not.toContain("starred:");
    expect(parseChatMarkdown(md).starred).toBeUndefined();
  });

  it("summaryFromFrontmatter accepts a boolean from metadataCache and a string from our parser", () => {
    const base = { id: "x", date: "2026-01-01", title: "t" };
    expect(summaryFromFrontmatter({ ...base, starred: true }, "chat", "p.md").starred).toBe(true);
    expect(summaryFromFrontmatter({ ...base, starred: "true" }, "chat", "p.md").starred).toBe(true);
    expect(summaryFromFrontmatter(base, "chat", "p.md").starred).toBe(false);

    expect(summaryFromFrontmatter({ ...base, starred: "yes" }, "chat", "p.md").starred).toBe(false);
  });
});
