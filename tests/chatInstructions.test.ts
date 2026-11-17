import { describe, it, expect } from "vitest";
import { setChatInstructions, loadChat } from "../src/core/chatPersistence";
import type { App } from "obsidian";
import type { ChatSummary } from "../src/core/chatPersistence";
import type CorvusPlugin from "../src/main";
import { loadInstructions } from "../src/ui/ChatInstructionsSheet";

function vault(content: string) {
  const files = new Map<string, string>([[".corvus/chats/chat/c1.md", content]]);
  const app = {
    vault: {
      adapter: {
        read: async (p: string) => files.get(p) ?? "",
        write: async (p: string, d: string) => void files.set(p, d),
        exists: async (p: string) => files.has(p),
      },
    },
  } as unknown as App;
  return { app, file: () => files.get(".corvus/chats/chat/c1.md")! };
}

const CHAT = [
  "---",
  'id: "c1"',
  'title: "Hi"',
  'date: "2026-10-02T00:00:00.000Z"',
  'mode: "chat"',
  'provider: "openai"',
  'model: "gpt-5"',
  'effort: "med"',
  "tokens_in: 1",
  "tokens_out: 2",
  "message_count: 0",
  "tags:",
  "  - corvus-chat",
  "---",
  "# Hi",
  "",
].join("\n");

describe("per-chat instructions", () => {
  it("saves, reads back with newlines and $& intact, and clears", async () => {
    const { app, file } = vault(CHAT);
    const text = "Answer in bullet points.\nCite the note. Costs $& and $1.";
    await setChatInstructions(app, ".corvus/chats", "chat", "c1", text);
    expect((await loadChat(app, ".corvus/chats", "chat", "c1")).instructions).toBe(text);
    expect(file()).toContain("# Hi");

    await setChatInstructions(app, ".corvus/chats", "chat", "c1", "Another.");
    expect(file().match(/^instructions:/gm)).toHaveLength(1);

    await setChatInstructions(app, ".corvus/chats", "chat", "c1", "   ");
    expect(file()).not.toMatch(/^instructions:/m);
    expect((await loadChat(app, ".corvus/chats", "chat", "c1")).instructions).toBeUndefined();
  });
});

describe("loadInstructions", () => {
  const summary = { id: "c1", mode: "chat" } as ChatSummary;
  const plugin = (read: (p: string) => Promise<string>) =>
    ({ app: { vault: { adapter: { read } } }, settings: { chatsPath: ".corvus/chats" } }) as unknown as CorvusPlugin;

  it("returns the stored instructions", async () => {
    const { app } = vault(CHAT);
    await setChatInstructions(app, ".corvus/chats", "chat", "c1", "Cite the note.");
    const read = (p: string) => app.vault.adapter.read(p);
    expect(await loadInstructions(plugin(read), summary)).toBe("Cite the note.");
  });

  it("reports an unreadable chat as null instead of empty, so saving can't wipe it", async () => {
    const failing = plugin(async () => {
      throw new Error("EIO");
    });
    expect(await loadInstructions(failing, summary)).toBeNull();
  });
});
