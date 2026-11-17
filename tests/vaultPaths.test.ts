import { describe, it, expect } from "vitest";

const isHidden = (path: string) => path.split("/").some((part) => part.startsWith("."));
import {
  CORVUS_HIDDEN,
  CHATS_FOLDER,
  HIDDEN_MOVES,
  legacyModeMoves,
  shouldMigrate,
} from "../src/core/vaultPaths";

describe("para onde o app leva o que migra", () => {
  it("conversas vão pra pasta VISÍVEL; o índice vai pra oculta", () => {
    const chats = HIDDEN_MOVES.filter((m) => m.field === "chatsPath");
    const index = HIDDEN_MOVES.filter((m) => m.field === "ragIndexPath");
    expect(chats.length).toBeGreaterThan(0);
    expect(index.length).toBeGreaterThan(0);
    for (const m of chats) {
      expect(m.target).toBe(CHATS_FOLDER);
      expect(isHidden(m.target)).toBe(false);
    }
    for (const m of index) {
      expect(m.target.startsWith(`${CORVUS_HIDDEN}/`)).toBe(true);
      expect(isHidden(m.target)).toBe(true);
    }
  });

  it("migra o legado corvus-ai E o default oculto .corvus/chats", () => {
    const legados = HIDDEN_MOVES.map((m) => m.legacy);
    expect(legados).toContain("corvus-ai/chats");
    expect(legados).toContain(`${CORVUS_HIDDEN}/chats`);
    expect(legados).toContain("corvus-ai/index");

    expect(legados).not.toContain("corvus-ai/skills");
    expect(legados).not.toContain("corvus-ai/generation");
    expect(legados).not.toContain("corvus-ai/reports");
  });
});

describe("legacyModeMoves", () => {
  it("aponta modos na raiz do app para dentro de corvus/chats", () => {
    const moves = legacyModeMoves("corvus", "corvus/chats", ["chat", "vault-qa", "agent"]);
    expect(moves).toContainEqual({ from: "corvus/agent", to: "corvus/chats/agent" });
    expect(moves).toContainEqual({ from: "corvus/chat", to: "corvus/chats/chat" });
    expect(moves).toContainEqual({ from: "corvus/vault-qa", to: "corvus/chats/vault-qa" });
  });

  it("não cria par quando a raiz já é o próprio chatsFolder", () => {
    expect(legacyModeMoves("corvus/chats", "corvus/chats", ["chat"])).toEqual([]);
  });
});

describe("shouldMigrate", () => {
  const base = {
    currentPath: "corvus-ai/chats",
    legacy: "corvus-ai/chats",
    target: ".corvus/chats",
    sourceExists: true,
    targetExists: false,
  };

  it("caminho padrão antigo, com arquivos lá e destino livre: move", () => {
    expect(shouldMigrate(base)).toBe(true);
  });

  it("caminho ESCOLHIDO pela pessoa não se mexe", () => {

    expect(
      shouldMigrate({ ...base, currentPath: "Arquivo/minhas-conversas" })
    ).toBe(false);
  });

  it("instalação nova (já no caminho novo) não tenta nada", () => {
    expect(shouldMigrate({ ...base, currentPath: ".corvus/chats" })).toBe(false);
  });

  it("origem inexistente: não há o que mover", () => {
    expect(shouldMigrate({ ...base, sourceExists: false })).toBe(false);
  });

  it("destino JÁ existe: não passa por cima", () => {

    expect(shouldMigrate({ ...base, targetExists: true })).toBe(false);
  });

  it("um 'não' basta, mesmo com todo o resto a favor", () => {
    expect(
      shouldMigrate({ ...base, sourceExists: false, targetExists: true })
    ).toBe(false);
  });
});
