import { describe, it, expect } from "vitest";
import {
  exportChatMarkdown,
  exportFileName,
  limparMarcas,
} from "../src/core/chatExport";
import type { ChatData } from "../src/core/chatPersistence";

const chat = (over: Partial<ChatData> = {}): ChatData => ({
  id: "abc",
  title: "Weekly review",
  date: "2026-09-20T10:00:00.000Z",
  mode: "chat",
  provider: "openai",
  model: "gpt-5",
  effort: "med",
  tokensIn: 10,
  tokensOut: 20,
  messages: [
    { type: "user", content: "oi" },
    { type: "ai-response", content: "olá" },
  ],
  ...over,
});

describe("limparMarcas", () => {
  it("tira o comentário de metadados e mantém o texto", () => {
    const r = limparMarcas("<!-- corvus: ts=123 reaction=like -->\nbom dia");
    expect(r).toBe("bom dia");
  });

  it("tira o paredão de base64 dos passos do agente", () => {

    const r = limparMarcas("fiz isso\n\n<!-- corvus-steps: QUJDREVGRw== -->");
    expect(r).toBe("fiz isso");
    expect(r).not.toMatch(/corvus-steps/);
  });

  it("não come o markdown de verdade", () => {
    const md = "# Título\n\n- um\n- dois\n\n`code`";
    expect(limparMarcas(md)).toBe(md);
  });
});

describe("exportFileName", () => {
  const dia = new Date("2026-09-20T10:00:00.000Z");

  it("leva o título e a data", () => {
    expect(exportFileName("Weekly review", dia)).toBe(
      "Weekly review (2026-09-20).md"
    );
  });

  it("troca o que o Obsidian não aceita em nome de arquivo", () => {
    expect(exportFileName("Resumo: a/b", dia)).toBe("Resumo- a-b (2026-09-20).md");
  });

  it("título vazio ainda dá um arquivo", () => {
    expect(exportFileName("   ", dia)).toBe("chat (2026-09-20).md");
  });
});

describe("exportChatMarkdown", () => {
  const quando = new Date("2026-09-27T12:00:00.000Z");

  it("abre com frontmatter que diz de onde veio", () => {

    const md = exportChatMarkdown(chat(), quando);
    expect(md.startsWith("---\n")).toBe(true);
    expect(md).toContain('model: "gpt-5"');
    expect(md).toContain("source: Corvus");
    expect(md).toContain('exported: "2026-09-27T12:00:00.000Z"');
  });

  it("o corpo é a conversa em seções legíveis", () => {
    const md = exportChatMarkdown(chat(), quando);
    expect(md).toContain("# Weekly review");
    expect(md).toContain("## You\n\noi");
    expect(md).toContain("## Assistant\n\nolá");
  });

  it("as marcas internas não vão junto", () => {
    const md = exportChatMarkdown(
      chat({
        messages: [
          {
            type: "ai-response",
            content: "<!-- corvus: ts=1 -->\nfeito\n\n<!-- corvus-steps: eyJ4IjoxfQ== -->",
          },
        ],
      }),
      quando
    );
    expect(md).toContain("feito");
    expect(md).not.toMatch(/corvus-steps|corvus: ts=/);
  });
});
