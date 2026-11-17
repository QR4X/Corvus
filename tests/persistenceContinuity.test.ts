import { describe, it, expect } from "vitest";
import {
  renderChatMarkdown,
  parseChatMarkdown,
  type ChatData,
  type ChatMessageStored,
} from "../src/core/chatPersistence";
import { storeMessagesToProvider } from "../src/agent/conversation";
import { toOpenAIMessages } from "../src/providers/_shared";
import { toAnthropicPayload } from "../src/providers/anthropic";
import type { AIToolStep } from "../src/agent/types";
import type { ProviderMessage } from "../src/providers/base";

const baseChat: ChatData = {
  id: "edge1",
  title: "Edge",
  date: "2026-06-11T00:00:00.000Z",
  mode: "agent",
  provider: "anthropic",
  model: "claude-opus-4-8",
  effort: "high",
  tokensIn: 10,
  tokensOut: 20,
  messages: [],
};

const mkChat = (messages: ChatMessageStored[]): ChatData => ({
  ...baseChat,
  messages,
});

function assertOpenAIToolIntegrity(wire: Array<Record<string, any>>) {
  const declared = new Set<string>();
  for (const m of wire) {
    if (m.role === "assistant" && Array.isArray(m.tool_calls)) {
      for (const tc of m.tool_calls) {
        declared.add(tc.id);

        expect(typeof tc.function.arguments).toBe("string");
      }
    }
    if (m.role === "tool") {
      expect(declared.has(m.tool_call_id)).toBe(true);
    }
  }
}

function assertAnthropicValid(payload: ReturnType<typeof toAnthropicPayload>) {
  const { messages } = payload;
  if (messages.length === 0) return;

  expect(messages[0].role).toBe("user");

  for (let i = 1; i < messages.length; i++) {
    expect(messages[i].role).not.toBe(messages[i - 1].role);
  }

  const useIds: string[] = [];
  const resultIds: string[] = [];
  for (const m of messages) {
    const blocks = Array.isArray(m.content) ? m.content : [];
    for (const b of blocks as Array<Record<string, any>>) {
      if (b.type === "tool_use") useIds.push(b.id);
      if (b.type === "tool_result") resultIds.push(b.tool_use_id);
    }
  }
  expect(useIds.sort()).toEqual(resultIds.sort());

  for (const m of messages) {
    const blocks = Array.isArray(m.content) ? m.content : [];
    for (const b of blocks as Array<Record<string, any>>) {
      if (b.type === "text") expect(b.text.length).toBeGreaterThan(0);
    }
  }
}

const steps2: AIToolStep[] = [
  { id: "c1", name: "vault_create", arguments: { path: "p/project.md" }, result: "created", ok: true },
  { id: "c2", name: "vault_search", arguments: { query: "architecture" }, result: "3 hits", ok: true },
];

describe("persistence round-trip edge cases", () => {
  it("a result containing '## You' or '## Assistant' headings does not break parsing", () => {
    const steps: AIToolStep[] = [
      {
        id: "c1",
        name: "vault_read",
        arguments: { path: "n.md" },
        result: "## You\nfake\n## Assistant\nmore fake",
        ok: true,
      },
    ];
    const chat = mkChat([
      { type: "user", content: "read it", timestamp: 1 },
      { type: "ai-response", content: "done reading", timestamp: 2, agentSteps: steps },
    ]);
    const r = parseChatMarkdown(renderChatMarkdown(chat));
    expect(r.messages).toHaveLength(2);
    expect(r.messages[1].agentSteps).toEqual(steps);
    expect(r.messages[1].content).toBe("done reading");
  });

  it("emoji and accented characters in content and results survive", () => {
    const steps: AIToolStep[] = [
      { id: "c1", name: "vault_create", arguments: { path: "résumé.md" }, result: "✅ done — façade", ok: true },
    ];
    const chat = mkChat([
      { type: "user", content: "açaí 🍇 and ñ", timestamp: 1 },
      { type: "ai-response", content: "ready 🚀 naïve", timestamp: 2, agentSteps: steps },
    ]);
    const r = parseChatMarkdown(renderChatMarkdown(chat));
    expect(r.messages[0].content).toBe("açaí 🍇 and ñ");
    expect(r.messages[1].content).toBe("ready 🚀 naïve");
    expect(r.messages[1].agentSteps).toEqual(steps);
  });

  it("several replies with steps are all listed in tools_used and round-trip exactly", () => {
    const chat = mkChat([
      { type: "user", content: "t1", timestamp: 1 },
      { type: "ai-response", content: "r1", timestamp: 2, agentSteps: [steps2[0]] },
      { type: "user", content: "t2", timestamp: 3 },
      { type: "ai-response", content: "r2", timestamp: 4, agentSteps: [steps2[1]] },
    ]);
    const md = renderChatMarkdown(chat);
    expect(md).toContain("vault_create p/project.md");
    expect(md).toContain("vault_search architecture");
    const r = parseChatMarkdown(md);
    expect(r.messages[1].agentSteps).toEqual([steps2[0]]);
    expect(r.messages[3].agentSteps).toEqual([steps2[1]]);
  });

  it("a step with an empty result and nested args survives", () => {
    const steps: AIToolStep[] = [
      { id: "c1", name: "vault_edit", arguments: { path: "a.md", patch: { from: "x", to: "y" } }, result: "", ok: true },
    ];
    const chat = mkChat([
      { type: "user", content: "edit it", timestamp: 1 },
      { type: "ai-response", content: "ok", timestamp: 2, agentSteps: steps },
    ]);
    const r = parseChatMarkdown(renderChatMarkdown(chat));
    expect(r.messages[1].agentSteps).toEqual(steps);
  });

  it("a reaction and agent steps on the same message both round-trip", () => {
    const chat = mkChat([
      { type: "user", content: "go", timestamp: 1 },
      { type: "ai-response", content: "done", timestamp: 2, reaction: "like", agentSteps: [steps2[0]] },
    ]);
    const r = parseChatMarkdown(renderChatMarkdown(chat));
    expect(r.messages[1].reaction).toBe("like");
    expect(r.messages[1].agentSteps).toEqual([steps2[0]]);
  });

  it("content without steps ending in a fake corvus-steps comment stays intact", () => {
    const chat = mkChat([
      { type: "user", content: "hi", timestamp: 1 },
      { type: "ai-response", content: "see <!-- corvus-steps: bogus -->", timestamp: 2 },
    ]);
    const r = parseChatMarkdown(renderChatMarkdown(chat));
    expect(r.messages[1].content).toBe("see <!-- corvus-steps: bogus -->");
    expect(r.messages[1].agentSteps).toBeUndefined();
  });
});

describe("storeMessagesToProvider across modes", () => {
  it("in tool mode an empty agent reply becomes an assistant message carrying the tool calls", () => {
    const out = storeMessagesToProvider(
      [
        { type: "user", content: "do it" },
        { type: "ai-response", content: "", agentSteps: steps2 },
      ],
      undefined,
      true
    );

    expect(out.map((m) => m.role)).toEqual(["user", "assistant", "tool", "tool"]);
    expect(out.some((m) => m.role === "assistant" && m.content === "")).toBe(true);

    const emptyAssist = out.find((m) => m.role === "assistant" && m.content === "")!;
    expect(emptyAssist.toolCalls?.length).toBe(2);
  });

  it("outside tool mode each agent reply becomes one text assistant message with no tool messages", () => {
    const out = storeMessagesToProvider([
      { type: "user", content: "t1" },
      { type: "ai-response", content: "r1", agentSteps: [steps2[0]] },
      { type: "user", content: "t2" },
      { type: "ai-response", content: "r2", agentSteps: [steps2[1]] },
    ]);
    expect(out.some((m) => m.role === "tool")).toBe(false);
    expect(out.some((m) => "toolCalls" in m)).toBe(false);
    expect(out.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(out[1].content).toContain("vault_create");
    expect(out[3].content).toContain("vault_search");
  });
});

describe("cross-provider continuity produces valid wire payloads", () => {
  const singleTurn: ProviderMessage[] = [
    { role: "system", content: "AGENT" },
    ...storeMessagesToProvider(
      [
        { type: "user", content: "create the project" },
        { type: "ai-response", content: "Done!", agentSteps: steps2 },
        { type: "user", content: "done, continue" },
      ],
      undefined,
      true
    ),
  ];

  const multiTurn: ProviderMessage[] = [
    { role: "system", content: "AGENT" },
    ...storeMessagesToProvider(
      [
        { type: "user", content: "build the app" },
        { type: "ai-response", content: "Let me look at the structure…" },
        { type: "ai-response", content: "Now I will create the files…" },
        { type: "ai-response", content: "All done.", agentSteps: steps2 },
      ],
      undefined,
      true
    ),
  ];

  it("OpenAI-compatible single turn has matching tool ids and JSON string args", () => {
    assertOpenAIToolIntegrity(toOpenAIMessages(singleTurn) as Array<Record<string, any>>);
  });

  it("OpenAI-compatible multi turn with consecutive assistants keeps integrity", () => {
    assertOpenAIToolIntegrity(toOpenAIMessages(multiTurn) as Array<Record<string, any>>);
  });

  it("Anthropic single turn alternates roles and matches tool_use with tool_result", () => {
    assertAnthropicValid(toAnthropicPayload(singleTurn));
  });

  it("Anthropic multi turn merges consecutive assistants to avoid a 400", () => {
    const payload = toAnthropicPayload(multiTurn);
    assertAnthropicValid(payload);

    expect(payload.system).toBe("AGENT");

    const firstAssistant = payload.messages.find((m) => m.role === "assistant")!;
    const blocks = Array.isArray(firstAssistant.content) ? firstAssistant.content : [];
    const texts = blocks.filter((b: any) => b.type === "text").map((b: any) => b.text);
    expect(texts.join(" ")).toContain("Let me look");
    expect(texts.join(" ")).toContain("create the files");
    expect(blocks.some((b: any) => b.type === "tool_use")).toBe(true);
  });

  it("steps with ids from another provider (openai_call_*) match on Anthropic", () => {
    const foreignSteps: AIToolStep[] = [
      { id: "openai_call_1717_0", name: "vault_create", arguments: { path: "x.md" }, result: "ok", ok: true },
    ];
    const hist: ProviderMessage[] = storeMessagesToProvider(
      [
        { type: "user", content: "create" },
        { type: "ai-response", content: "done", agentSteps: foreignSteps },
      ],
      undefined,
      true
    );
    const payload = toAnthropicPayload([{ role: "system", content: "A" }, ...hist]);
    assertAnthropicValid(payload);

    const flat = payload.messages.flatMap((m) =>
      Array.isArray(m.content) ? m.content : []
    ) as Array<Record<string, any>>;
    expect(flat.find((b) => b.type === "tool_use")?.id).toBe("openai_call_1717_0");
    expect(flat.find((b) => b.type === "tool_result")?.tool_use_id).toBe("openai_call_1717_0");
  });

  it("flattened chat mode history also produces a valid Anthropic payload", () => {
    const flat = storeMessagesToProvider([
      { type: "user", content: "hi" },
      { type: "ai-response", content: "thinking…" },
      { type: "ai-response", content: "done", agentSteps: steps2 },
    ]);
    const payload = toAnthropicPayload([{ role: "system", content: "S" }, ...flat]);
    assertAnthropicValid(payload);

    const flatBlocks = payload.messages.flatMap((m) =>
      Array.isArray(m.content) ? m.content : []
    ) as Array<Record<string, any>>;
    expect(flatBlocks.some((b) => b.type === "tool_use")).toBe(false);
  });

  it("saving to markdown, reloading and rebuilding yields valid payloads end to end", () => {
    const chat = mkChat([
      { type: "user", content: "create the project", timestamp: 1 },
      { type: "ai-response", content: "looking…", timestamp: 2 },
      { type: "ai-response", content: "Done!", timestamp: 3, agentSteps: steps2 },
    ]);
    const reloaded = parseChatMarkdown(renderChatMarkdown(chat));
    const hist = storeMessagesToProvider(
      reloaded.messages.concat({ type: "user", content: "done", timestamp: 4 }),
      undefined,
      true
    );
    assertOpenAIToolIntegrity(
      toOpenAIMessages([{ role: "system", content: "A" }, ...hist]) as Array<Record<string, any>>
    );
    assertAnthropicValid(toAnthropicPayload([{ role: "system", content: "A" }, ...hist]));
  });
});
