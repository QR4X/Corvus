import { describe, it, expect } from "vitest";
import {
  buildChatSystemPrompt,
  buildAgentSystemPrompt,
  storeMessagesToProvider,
  flattenAgentResponse,
} from "../src/agent/conversation";

describe("buildChatSystemPrompt", () => {
  it("uses the base prompt without a persona", () => {
    expect(buildChatSystemPrompt({ base: "BASE" })).toBe("BASE");
  });
  it("replaces the base prompt with the persona", () => {
    expect(buildChatSystemPrompt({ persona: "PIRATE", base: "BASE" })).toBe("PIRATE");
  });
  it("appends the suffix and block for a non-empty vaultBlock", () => {
    const r = buildChatSystemPrompt({
      base: "BASE",
      vaultSuffix: "\n\nNOTES:\n",
      vaultBlock: "relevant excerpt",
    });
    expect(r).toBe("BASE\n\nNOTES:\nrelevant excerpt");
  });
  it("skips the suffix for an empty vaultBlock", () => {
    expect(
      buildChatSystemPrompt({ base: "BASE", vaultSuffix: "SUF", vaultBlock: "" })
    ).toBe("BASE");
  });
  it("appends noteBlock at the end", () => {
    expect(buildChatSystemPrompt({ base: "BASE", noteBlock: "\n\n[notes]" })).toBe(
      "BASE\n\n[notes]"
    );
  });
  it("places styleInstruction after the head and before the vault", () => {
    expect(
      buildChatSystemPrompt({ base: "BASE", styleInstruction: "Be concise." })
    ).toBe("BASE\n\nBe concise.");
  });
  it("ignores a blank styleInstruction", () => {
    expect(buildChatSystemPrompt({ base: "BASE", styleInstruction: "   " })).toBe(
      "BASE"
    );
  });
  it("orders persona, style, vault and notes", () => {
    const r = buildChatSystemPrompt({
      persona: "P",
      base: "BASE",
      styleInstruction: "S",
      vaultSuffix: "\n\nV:\n",
      vaultBlock: "ctx",
      noteBlock: "\n\nN",
    });
    expect(r).toBe("P\n\nS\n\nV:\nctx\n\nN");
  });
  it("falls back to the base for a whitespace-only persona", () => {
    expect(buildChatSystemPrompt({ persona: "   ", base: "BASE" })).toBe("BASE");
  });
  it("applies the style without a persona", () => {
    expect(
      buildChatSystemPrompt({ base: "BASE", styleInstruction: "S" })
    ).toBe("BASE\n\nS");
  });
});

describe("buildAgentSystemPrompt", () => {
  it("returns only the agent prompt without a persona", () => {
    expect(buildAgentSystemPrompt(undefined, "AGENT")).toBe("AGENT");
    expect(buildAgentSystemPrompt("  ", "AGENT")).toBe("AGENT");
  });
  it("prepends the persona instead of replacing the prompt", () => {
    expect(buildAgentSystemPrompt("PIRATE", "AGENT")).toBe("PIRATE\n\nAGENT");
  });
  it("appends notes at the end with the same suffix chat uses", () => {
    const r = buildAgentSystemPrompt(undefined, "AGENT", {
      suffix: "SUFFIX",
      block: "BLOCK",
    });
    expect(r).toBe("AGENTSUFFIXBLOCK");
  });
  it("leaves no trace, not even the suffix, for an empty block", () => {
    expect(
      buildAgentSystemPrompt(undefined, "AGENT", { suffix: "SUFFIX", block: "" })
    ).toBe("AGENT");
    expect(buildAgentSystemPrompt(undefined, "AGENT", {})).toBe("AGENT");
  });
});

describe("storeMessagesToProvider", () => {
  it("retains completed tool results from errors without replaying error text", () => {
    const messages = [{
      type: "ai-response", content: "[Error] output limit", isError: true,
      agentSteps: [{ id: "call-1", name: "vault_read", arguments: { path: "a.md" }, result: "already read", ok: true }],
    }];
    expect(storeMessagesToProvider(messages, undefined, true)).toEqual([
      { role: "assistant", content: "", toolCalls: [{ id: "call-1", name: "vault_read", arguments: { path: "a.md" } }] },
      { role: "tool", toolCallId: "call-1", content: "already read" },
    ]);
    const text = storeMessagesToProvider(messages)[0].content;
    expect(text).toContain("already read");
    expect(text).not.toContain("[Error]");
  });
  const msgs = [
    { type: "user", content: "hi" },
    { type: "ai-comment", content: "thinking…" },
    { type: "ai-response", content: "hello" },
    { type: "ai-response", content: "[Error] x", isError: true },
    { type: "user", content: "again" },
  ];

  it("drops ai-comment and failed ai-response messages and maps roles", () => {
    const out = storeMessagesToProvider(msgs);
    expect(out).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
      { role: "user", content: "again" },
    ]);
  });

  it("attaches attachments only to the last user message", () => {
    const att = [{ type: "image" as const, dataUrl: "data:..." }];
    const out = storeMessagesToProvider(msgs, att);
    expect(out[out.length - 1]).toMatchObject({
      role: "user",
      content: "again",
      attachments: att,
    });
    expect(out[0]).not.toHaveProperty("attachments");
  });

  it("adds no attachments field without attachments", () => {
    const out = storeMessagesToProvider(msgs);
    expect(out.some((m) => "attachments" in m)).toBe(false);
  });

  it("returns an empty list for no messages", () => {
    expect(storeMessagesToProvider([])).toEqual([]);
  });

  it("returns an empty list when only comments and errors exist", () => {
    const out = storeMessagesToProvider([
      { type: "ai-comment", content: "..." },
      { type: "ai-response", content: "[Error]", isError: true },
    ]);
    expect(out).toEqual([]);
  });

  it("adds no attachments field for an empty attachments array", () => {
    const out = storeMessagesToProvider(msgs, []);
    expect(out.some((m) => "attachments" in m)).toBe(false);
  });

  it("does not apply attachments when the last usable message is from the assistant", () => {
    const out = storeMessagesToProvider(
      [
        { type: "user", content: "hi" },
        { type: "ai-response", content: "answer" },
      ],
      [{ type: "image" as const, dataUrl: "data:..." }]
    );
    expect(out.some((m) => "attachments" in m)).toBe(false);
  });

  it("turns missing content into an empty string", () => {
    const out = storeMessagesToProvider([{ type: "user" }]);
    expect(out).toEqual([{ role: "user", content: "" }]);
  });

  it("treats empty agentSteps as a plain assistant message", () => {
    const out = storeMessagesToProvider([
      { type: "user", content: "hi" },
      { type: "ai-response", content: "ok", agentSteps: [] },
    ]);
    expect(out[1]).toEqual({ role: "assistant", content: "ok" });
  });

  it("emits no final text assistant message in tool mode when content is empty", () => {
    const out = storeMessagesToProvider(
      [{ type: "ai-response", content: "", agentSteps: [
        { id: "c1", name: "vault_read", arguments: { path: "a.md" }, result: "x", ok: true },
      ] }],
      undefined,
      true
    );
    expect(out.filter((m) => m.role === "assistant")).toHaveLength(1);
    expect(out.some((m) => m.role === "tool")).toBe(true);
  });

  const stepsFixture = [
    { id: "c1", name: "vault_create", arguments: { path: "a.md" }, result: "created", ok: true },
    { id: "c2", name: "vault_search", arguments: { query: "x" }, result: "2 hits", ok: true },
  ];

  it("expands agentSteps into tool calls, tool results and final text in tool mode", () => {
    const out = storeMessagesToProvider(
      [
        { type: "user", content: "create a.md" },
        { type: "ai-response", content: "Done!", agentSteps: stepsFixture },
      ],
      undefined,
      true
    );
    expect(out).toEqual([
      { role: "user", content: "create a.md" },
      {
        role: "assistant",
        content: "",
        toolCalls: [
          { id: "c1", name: "vault_create", arguments: { path: "a.md" } },
          { id: "c2", name: "vault_search", arguments: { query: "x" } },
        ],
      },
      { role: "tool", toolCallId: "c1", content: "created" },
      { role: "tool", toolCallId: "c2", content: "2 hits" },
      { role: "assistant", content: "Done!" },
    ]);
  });

  it("flattens agentSteps into one text assistant message without tool calls in chat mode", () => {
    const out = storeMessagesToProvider([
      { type: "user", content: "create a.md" },
      { type: "ai-response", content: "Done!", agentSteps: stepsFixture },
    ]);
    expect(out.some((m) => m.role === "tool")).toBe(false);
    expect(out.some((m) => "toolCalls" in m)).toBe(false);
    expect(out[0]).toEqual({ role: "user", content: "create a.md" });
    expect(out).toHaveLength(2);
    expect(out[1].role).toBe("assistant");
    expect(out[1].content).toContain("Done!");
    expect(out[1].content).toContain("agent memory");
    expect(out[1].content).toContain("vault_create(a.md)");
    expect(out[1].content).toContain("vault_search(x)");
  });
});

describe("flattenAgentResponse", () => {
  it("includes the final text and one status line per action", () => {
    const r = flattenAgentResponse("Ready.", [
      { id: "1", name: "vault_read", arguments: { path: "n.md" }, result: "content", ok: true },
      { id: "2", name: "vault_delete", arguments: { path: "x.md" }, result: "boom", ok: false },
    ]);
    expect(r.startsWith("Ready.")).toBe(true);
    expect(r).toContain("1. vault_read(n.md) → ok — content");
    expect(r).toContain("2. vault_delete(x.md) → ERROR — boom");
  });

  it("returns only the memory block without final text", () => {
    const r = flattenAgentResponse("", [
      { id: "1", name: "vault_list", arguments: { folder: "f" }, result: "3 items", ok: true },
    ]);
    expect(r.startsWith("〔agent memory")).toBe(true);
    expect(r).toContain("vault_list(f) → ok — 3 items");
  });

  it("returns a memory block without action lines for empty steps", () => {
    const r = flattenAgentResponse("ok", []);
    expect(r.startsWith("ok\n\n")).toBe(true);
    expect(r).toContain("agent memory");
  });

  it("truncates long args and results inline without breaking lines", () => {
    const longArg = "p/".padEnd(200, "a");
    const longRes = "r".padEnd(500, "z");
    const r = flattenAgentResponse("ok", [
      { id: "1", name: "vault_read", arguments: { path: longArg }, result: longRes, ok: true },
    ]);
    expect(r).toContain("…");

    const actionLine = r.split("\n").find((l) => l.startsWith("1."))!;
    expect(actionLine.length).toBeLessThan(280);
  });
});
