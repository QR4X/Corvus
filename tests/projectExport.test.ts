import { describe, it, expect } from "vitest";
import {
  exportProjectMarkdown,
  noteLink,
} from "../src/core/projectExport";
import type { Project } from "../src/projects";
import type { ChatSummary } from "../src/core/chatPersistence";

const proj = (over: Partial<Project> = {}): Project => ({
  id: "p1",
  name: "Thesis",
  icon: "graduation-cap",
  color: "#4361ee",
  sources: ["Refs/Kuhn.md", "Diário/2026-09.md"],
  instructions: "Sempre citar a fonte.",
  chatIds: ["c1", "c2"],
  createdAt: "2026-09-01T10:00:00.000Z",
  ...over,
});

const chat = (over: Partial<ChatSummary> = {}): ChatSummary => ({
  id: "c1",
  title: "Capítulo 2",
  date: "2026-09-20T10:00:00.000Z",
  mode: "chat",
  provider: "openai",
  model: "gpt-5",
  effort: "med",
  tokensIn: 1,
  tokensOut: 2,
  messageCount: 2,
  toolCount: 0,
  filePath: ".corvus/chats/c1.md",
  ...over,
});

const quando = new Date("2026-09-27T12:00:00.000Z");

describe("noteLink", () => {
  it("vira wikilink sem o .md", () => {

    expect(noteLink("Refs/Kuhn.md")).toBe("[[Refs/Kuhn]]");
  });

  it("guarda o caminho inteiro, não só o nome", () => {

    expect(noteLink("a/b/Index.md")).toBe("[[a/b/Index]]");
  });
});

describe("exportProjectMarkdown", () => {
  it("abre com frontmatter que diz o que é e de onde veio", () => {
    const md = exportProjectMarkdown(proj(), [chat()], quando);
    expect(md.startsWith("---\n")).toBe(true);
    expect(md).toContain("kind: project");
    expect(md).toContain("source: Corvus");
    expect(md).toContain('created: "2026-09-01T10:00:00.000Z"');
    expect(md).toContain("notes: 2");
  });

  it("leva as instruções por extenso", () => {

    expect(exportProjectMarkdown(proj(), [], quando)).toContain(
      "## Custom instructions\n\nSempre citar a fonte."
    );
  });

  it("as fontes saem como link, e é isso que põe o projeto no grafo", () => {
    const md = exportProjectMarkdown(proj(), [], quando);
    expect(md).toContain("- [[Refs/Kuhn]]");
    expect(md).toContain("- [[Diário/2026-09]]");
  });

  it("lista as conversas do projeto, da mais nova pra mais velha", () => {
    const md = exportProjectMarkdown(
      proj(),
      [
        chat({ id: "c1", title: "Velha", date: "2026-09-10T10:00:00.000Z" }),
        chat({ id: "c2", title: "Nova", date: "2026-09-25T10:00:00.000Z" }),
      ],
      quando
    );
    expect(md.indexOf("Nova")).toBeLessThan(md.indexOf("Velha"));
    expect(md).toContain("- Nova — 2026-09-25 · gpt-5");
  });

  it("conversa de outro projeto não entra", () => {
    const md = exportProjectMarkdown(
      proj({ chatIds: ["c1"] }),
      [chat({ id: "c1", title: "Minha" }), chat({ id: "zz", title: "Alheia" })],
      quando
    );
    expect(md).toContain("Minha");
    expect(md).not.toContain("Alheia");
  });

  it("seção vazia não aparece", () => {

    const md = exportProjectMarkdown(
      proj({ sources: [], instructions: "", chatIds: [] }),
      [],
      quando
    );
    expect(md).not.toContain("## Notes");
    expect(md).not.toContain("## Custom instructions");
    expect(md).not.toContain("## Chats");
    expect(md).toContain("# Thesis");
  });
});
