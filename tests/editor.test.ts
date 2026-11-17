import { describe, expect, it } from "vitest";
import { joinContinuation, cleanReply, actionMessages, LanguageModal } from "../src/editor/inline";
import { clearRequests, listenForRequests, sendToPanel, type EditorRequest } from "../src/editor/bridge";
import { registerEditorCommands, SUMMARIZE_REQUEST } from "../src/editor/commands";
import type CorvusPlugin from "../src/main";

describe("text actions", () => {
  it("asks each action for only the text back and names the language for translations", () => {
    for (const action of ["rewrite", "fix", "translate", "continue"] as const) {
      const [system, user] = actionMessages(action, "hello", { language: "Japanese" });
      expect(system.role).toBe("system");
      expect(system.content).toMatch(/ONLY the resulting text/);
      expect(user).toEqual({ role: "user", content: "hello" });
    }
    expect(actionMessages("translate", "x", { language: "Japanese" })[0].content).toMatch(/into Japanese/);
    expect(actionMessages("rewrite", "x")[0].content).toMatch(/Keep its meaning, tone and language/);
  });

  it("strips a code fence and quotes wrapping the whole reply", () => {
    expect(cleanReply("```markdown\nNew text.\n```")).toBe("New text.");
    expect(cleanReply('"New text."')).toBe("New text.");
    expect(cleanReply("“New text.”")).toBe("New text.");
    expect(cleanReply('"one" and "two"')).toBe('"one" and "two"');
    expect(cleanReply("  normal \r\n")).toBe("normal");
  });

  it("adds a space when joining only if neither side has whitespace", () => {
    expect(joinContinuation("Once upon a time", "a cat.")).toBe(" a cat.");
    expect(joinContinuation("End.\n", "Another paragraph.")).toBe("Another paragraph.");
    expect(joinContinuation("End.", "\n\nAnother.")).toBe("\n\nAnother.");
  });

  it("offers a typed language missing from the list as the first option", () => {
    const m = new LanguageModal({} as never, () => {});
    expect(m.modalEl.hasClass("corvus-language-modal")).toBe(true);
    expect(m.getSuggestions("port")).toEqual(["port", "Portuguese (Brazil)", "Portuguese (Portugal)"]);
    expect(m.getSuggestions("Spanish")).toEqual(["Spanish"]);
    expect(m.getSuggestions("").length).toBeGreaterThan(10);
  });
});

describe("the editor to panel bridge", () => {
  it("queues requests until the panel mounts and then delivers them", () => {
    clearRequests();
    const received: EditorRequest[] = [];
    sendToPanel({ kind: "note", path: "a.md" });
    sendToPanel({ kind: "selection", path: "b.md", text: "x" });
    const stop = listenForRequests((p) => received.push(p));
    expect(received.map((p) => p.kind)).toEqual(["note", "selection"]);

    sendToPanel({ kind: "note", path: "c.md", send: SUMMARIZE_REQUEST });
    expect(received).toHaveLength(3);
    stop();
    sendToPanel({ kind: "note", path: "d.md" });
    expect(received).toHaveLength(3);
    clearRequests();
  });
});

describe("commands", () => {
  it("registers the seven commands and both menus", () => {
    const commands: Array<{ id: string; name: string }> = [];
    const events: string[] = [];
    const plugin = {
      app: { workspace: { getActiveFile: () => null, on: (name: string) => (events.push(name), {}) } },
      addCommand: (c: { id: string; name: string }) => commands.push(c),
      registerEvent: () => {},
      activateView: async () => {},
    } as unknown as CorvusPlugin;
    registerEditorCommands(plugin);
    expect(commands.map((c) => c.id)).toEqual([
      "ask-about-note",
      "summarize-note",
      "send-selection-to-chat",
      "rewrite-selection",
      "fix-selection",
      "translate-selection",
      "continue-writing",
    ]);
    expect(commands.every((c) => !/corvus/i.test(c.name))).toBe(true);
    expect(events).toEqual(["editor-menu", "file-menu"]);
  });
});
