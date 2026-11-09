import { describe, it, expect } from "vitest";
import {
  CORVUS_HIDDEN,
  CHATS_FOLDER,
  HIDDEN_MOVES,
  isHiddenPath,
  legacyModeMoves,
  shouldMigrate,
} from "../src/core/vaultPaths";

describe("para onde o app leva o que migra", () => {
  it("conversas vão pra pasta VISÍVEL; o índice vai pra oculta", () => {
    const chats = HIDDEN_MOVES.filter((m) => m.campo === "chatsPath");
    const index = HIDDEN_MOVES.filter((m) => m.campo === "ragIndexPath");
    expect(chats.length).toBeGreaterThan(0);
    expect(index.length).toBeGreaterThan(0);
    for (const m of chats) {
      expect(m.novo).toBe(CHATS_FOLDER);
      expect(isHiddenPath(m.novo)).toBe(false);
    }
    for (const m of index) {
      expect(m.novo.startsWith(`${CORVUS_HIDDEN}/`)).toBe(true);
      expect(isHiddenPath(m.novo)).toBe(true);
    }
  });

  it("migra o legado corvus-ai E o default oculto .corvus/chats", () => {
    const legados = HIDDEN_MOVES.map((m) => m.legado);
    expect(legados).toContain("corvus-ai/chats");
    expect(legados).toContain(`${CORVUS_HIDDEN}/chats`);
    expect(legados).toContain("corvus-ai/index");

    expect(legados).not.toContain("corvus-ai/skills");
    expect(legados).not.toContain("corvus-ai/generation");
    expect(legados).not.toContain("corvus-ai/reports");
  });
});

describe("isHiddenPath", () => {
  it("qualquer trecho com ponto na frente esconde o caminho inteiro", () => {
    expect(isHiddenPath(".corvus/chats/agent/x.md")).toBe(true);
    expect(isHiddenPath("notas/.rascunho/x.md")).toBe(true);
    expect(isHiddenPath("corvus-ai/chats/x.md")).toBe(false);

    expect(isHiddenPath("notas/plano.v2/x.md")).toBe(false);
  });
});

describe("legacyModeMoves", () => {
  it("aponta modos na raiz do app para dentro de corvus/chats", () => {
    const moves = legacyModeMoves("corvus", "corvus/chats", ["chat", "vault-qa", "agent"]);
    expect(moves).toContainEqual({ de: "corvus/agent", para: "corvus/chats/agent" });
    expect(moves).toContainEqual({ de: "corvus/chat", para: "corvus/chats/chat" });
    expect(moves).toContainEqual({ de: "corvus/vault-qa", para: "corvus/chats/vault-qa" });
  });

  it("não cria par quando a raiz já é o próprio chatsFolder", () => {
    expect(legacyModeMoves("corvus/chats", "corvus/chats", ["chat"])).toEqual([]);
  });
});

describe("shouldMigrate", () => {
  const base = {
    caminhoAtual: "corvus-ai/chats",
    legado: "corvus-ai/chats",
    novo: ".corvus/chats",
    origemExiste: true,
    destinoExiste: false,
  };

  it("caminho padrão antigo, com arquivos lá e destino livre: move", () => {
    expect(shouldMigrate(base)).toBe(true);
  });

  it("caminho ESCOLHIDO pela pessoa não se mexe", () => {

    expect(
      shouldMigrate({ ...base, caminhoAtual: "Arquivo/minhas-conversas" })
    ).toBe(false);
  });

  it("instalação nova (já no caminho novo) não tenta nada", () => {
    expect(shouldMigrate({ ...base, caminhoAtual: ".corvus/chats" })).toBe(false);
  });

  it("origem inexistente: não há o que mover", () => {
    expect(shouldMigrate({ ...base, origemExiste: false })).toBe(false);
  });

  it("destino JÁ existe: não passa por cima", () => {

    expect(shouldMigrate({ ...base, destinoExiste: true })).toBe(false);
  });

  it("um 'não' basta, mesmo com todo o resto a favor", () => {
    expect(
      shouldMigrate({ ...base, origemExiste: false, destinoExiste: true })
    ).toBe(false);
  });
});
