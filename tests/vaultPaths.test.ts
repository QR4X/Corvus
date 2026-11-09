import { describe, it, expect } from "vitest";
import {
  CORVUS_HIDDEN,
  CHATS_FOLDER,
  HIDDEN_MOVES,
  isHiddenPath,
  shouldMigrate,
} from "../src/core/vaultPaths";

/**
 * A regra de quando MEXER nos arquivos de alguém.
 *
 * Mover arquivo de conversa é a operação mais perigosa deste app: é a única
 * coisa que ele guarda que não se refaz. Por isso a decisão é uma função pura,
 * testada, e cada "não" dela vale mais que o "sim".
 *
 * Desde que o default das conversas virou pasta VISÍVEL (pra file-sync copiar
 * entre aparelhos), as migrações vão em DUAS direções: chats pro visível, e o
 * índice do RAG (cache, se refaz) pra oculta.
 */

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
    // Skills, mídia gerada e relatórios ficam VISÍVEIS de propósito: skill é
    // nota que a pessoa edita, e mídia escondida não dá pra embutir numa nota
    // (o Obsidian não resolve link pra fora do índice).
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
    // Ponto NO MEIO do nome não esconde nada — só no começo.
    expect(isHiddenPath("notas/plano.v2/x.md")).toBe(false);
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
    // Quem apontou as conversas pra outro lugar tomou uma decisão. Migrar por
    // cima dela é desfazer o que ela pediu.
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
    // Ou a migração já rodou, ou há coisa lá. Escrever por cima podia
    // sobrescrever conversa — e conversa não se refaz.
    expect(shouldMigrate({ ...base, destinoExiste: true })).toBe(false);
  });

  it("um 'não' basta, mesmo com todo o resto a favor", () => {
    expect(
      shouldMigrate({ ...base, origemExiste: false, destinoExiste: true })
    ).toBe(false);
  });
});
