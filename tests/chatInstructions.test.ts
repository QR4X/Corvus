import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { setChatInstructions, loadChat } from "../src/core/chatPersistence";
import type { App } from "obsidian";
import type { ChatSummary } from "../src/core/chatPersistence";
import type CorvusPlugin from "../src/main";
import { loadInstructions } from "../src/ui/ChatInstructionsSheet";

const ler = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

function vault(conteudo: string) {
  const arquivos = new Map<string, string>([[".corvus/chats/chat/c1.md", conteudo]]);
  const app = {
    vault: {
      adapter: {
        read: async (p: string) => arquivos.get(p) ?? "",
        write: async (p: string, d: string) => void arquivos.set(p, d),
        exists: async (p: string) => arquivos.has(p),
      },
    },
  } as unknown as App;
  return { app, arquivo: () => arquivos.get(".corvus/chats/chat/c1.md")! };
}

const CHAT = [
  "---",
  'id: "c1"',
  'title: "Oi"',
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
  "# Oi",
  "",
].join("\n");

describe("instruções por conversa", () => {
  it("grava, lê de volta (com quebra de linha e $& intactos) e apaga", async () => {
    const { app, arquivo } = vault(CHAT);
    const texto = "Responda em tópicos.\nCite a nota. Custa $& e $1.";
    await setChatInstructions(app, ".corvus/chats", "chat", "c1", texto);
    expect((await loadChat(app, ".corvus/chats", "chat", "c1")).instructions).toBe(texto);
    expect(arquivo()).toContain("# Oi");

    await setChatInstructions(app, ".corvus/chats", "chat", "c1", "Outra.");
    expect(arquivo().match(/^instructions:/gm)).toHaveLength(1);

    await setChatInstructions(app, ".corvus/chats", "chat", "c1", "   ");
    expect(arquivo()).not.toMatch(/^instructions:/m);
    expect((await loadChat(app, ".corvus/chats", "chat", "c1")).instructions).toBeUndefined();
  });

  it("o ⋯ da conversa abre a folha, que mora no App", () => {
    expect(ler("src/ui/ChatList.tsx")).toMatch(/label: tr\("Instructions…"\)[\s\S]{0,160}panel\.instructionsFor\(c\)/);
    expect(ler("src/ui/App.tsx")).toContain("<ChatInstructionsSheet");
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
