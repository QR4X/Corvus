import { describe, it, expect } from "vitest";
import {
  buildChatSystemPrompt,
  buildAgentSystemPrompt,
} from "../src/agent/conversation";

describe("project instructions in chat", () => {
  it("come after the head without dropping the base", () => {
    expect(
      buildChatSystemPrompt({ base: "BASE", instructions: "Use bullet points." })
    ).toBe("BASE\n\nUse bullet points.");
  });

  it("appear after the persona, which replaces the base", () => {
    expect(
      buildChatSystemPrompt({
        persona: "PIRATE",
        base: "BASE",
        instructions: "Use bullet points.",
      })
    ).toBe("PIRATE\n\nUse bullet points.");
  });

  it("change nothing when empty or blank", () => {
    expect(buildChatSystemPrompt({ base: "BASE", instructions: "   " })).toBe(
      "BASE"
    );
    expect(buildChatSystemPrompt({ base: "BASE" })).toBe("BASE");
  });

  it("follow the full order: head, project, style, vault, notes", () => {
    const r = buildChatSystemPrompt({
      base: "BASE",
      instructions: "P",
      styleInstruction: "S",
      vaultSuffix: "\n\nV:\n",
      vaultBlock: "ctx",
      noteBlock: "\n\nN",
    });
    expect(r).toBe("BASE\n\nP\n\nS\n\nV:\nctx\n\nN");
  });
});

describe("project instructions in agent mode", () => {
  it("come after the agent prompt and before the notes", () => {
    const r = buildAgentSystemPrompt(
      undefined,
      "AGENT",
      { suffix: "\n\nNOTES:\n", block: "ctx" },
      "Never delete anything."
    );
    expect(r).toBe("AGENT\n\nNever delete anything.\n\nNOTES:\nctx");
  });

  it("keep the persona first", () => {
    const r = buildAgentSystemPrompt(undefined, "AGENT", undefined, "RULE");
    expect(r).toBe("AGENT\n\nRULE");
    expect(buildAgentSystemPrompt("P", "AGENT", undefined, "RULE")).toBe(
      "P\n\nAGENT\n\nRULE"
    );
  });

  it("leave the prompt unchanged without instructions", () => {
    expect(buildAgentSystemPrompt(undefined, "AGENT", undefined, "  ")).toBe(
      "AGENT"
    );
  });
});
