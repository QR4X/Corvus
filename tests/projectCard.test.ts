import { describe, it, expect } from "vitest";
import {
  formatTokens,
  summarizeProject,
  projectInputTokens,
} from "../src/ui/projectSummary";
import {
  instructionsSection,
  attachedNotesSection,
} from "../src/agent/conversation";
import { estimateTokens } from "../src/core/tokens";
import type { Project } from "../src/projects";

const AGORA = new Date("2026-09-29T12:00:00Z").getTime();
const dias = (n: number) => new Date(AGORA - n * 86_400_000).toISOString();

const projeto = (p: Partial<Project> = {}): Project => ({
  id: "p1",
  name: "Tese",
  icon: "book",
  color: "default",
  sources: [],
  chatIds: [],
  createdAt: dias(5),
  ...p,
});

describe("está vivo?", () => {
  it("com conversas: quando foi a ÚLTIMA", () => {
    const r = summarizeProject(
      projeto({ chatIds: ["a", "b"] }),
      [
        { id: "a", title: "Antiga", date: dias(9) },
        { id: "b", title: "Recente", date: dias(2) },
      ],
      AGORA
    );
    expect(r.when).toBe("2d ago");
  });

  it("sem conversa nenhuma: quando ele nasceu", () => {
    expect(summarizeProject(projeto(), [], AGORA).when).toBe("5d ago");
  });

  it("agora mesmo não vira '0m ago'", () => {
    const r = summarizeProject(
      projeto({ chatIds: ["a"] }),
      [{ id: "a", title: "x", date: new Date(AGORA - 5_000).toISOString() }],
      AGORA
    );
    expect(r.when).toBe("just now");
  });

  it("mais de um mês: a data, sem 'ago' pendurado depois dela", () => {
    const r = summarizeProject(projeto({ createdAt: dias(60) }), [], AGORA);
    expect(r.when).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("do que se trata?", () => {
  it("a primeira linha das instruções — a frase que a pessoa escreveu", () => {
    const r = summarizeProject(
      projeto({ instructions: "\n  Responda em português.\nCite a nota." }),
      [],
      AGORA
    );
    expect(r.about).toBe("Responda em português.");
  });

  it("sem instruções: o título da conversa mais recente", () => {
    const r = summarizeProject(
      projeto({ chatIds: ["a", "b"] }),
      [
        { id: "a", title: "Antiga", date: dias(9) },
        { id: "b", title: "Kuhn e paradigmas", date: dias(1) },
      ],
      AGORA
    );
    expect(r.about).toBe("Latest: Kuhn e paradigmas");
  });

  it("sem os dois: nada — o cartão mostra a dica, não inventa assunto", () => {
    expect(summarizeProject(projeto(), [], AGORA).about).toBeNull();
  });
});

describe("quanto já tem?", () => {
  it("conta só as conversas que EXISTEM", () => {

    const r = summarizeProject(
      projeto({ chatIds: ["a", "apagada", "b"] }),
      [
        { id: "a", title: "A", date: dias(1) },
        { id: "b", title: "B", date: dias(2) },
        { id: "de-outro", title: "C", date: dias(0) },
      ],
      AGORA
    );
    expect(r.chatCount).toBe(2);
  });
});

describe("quanto custa abrir uma conversa aqui? (tokens de entrada)", () => {
  const nota = (path: string, content: string) => ({ path, content });

  it("é o texto que o projeto SOMA ao prompt — instruções e notas inteiras", () => {

    const notas = [nota("Tese/Kuhn.md", "Paradigma.".repeat(35))];
    const instr = "Responda em português.";
    const texto =
      instructionsSection(instr) + attachedNotesSection(notas);
    expect(projectInputTokens(instr, notas)).toBe(estimateTokens(texto));
  });

  it("projeto sem notas e sem instruções não custa nada", () => {
    expect(projectInputTokens(undefined, [])).toBe(0);
    expect(projectInputTokens("   ", [])).toBe(0);
  });

  it("nota maior, projeto mais caro — o conteúdo inteiro vai", () => {
    const pequena = projectInputTokens("", [nota("a.md", "x".repeat(350))]);
    const grande = projectInputTokens("", [nota("a.md", "x".repeat(3500))]);
    expect(grande).toBeGreaterThan(pequena * 5);
  });

  it("o bloco de notas é o MESMO de antes da extração", () => {

    expect(
      attachedNotesSection([nota("A.md", "um"), nota("B.md", "dois")])
    ).toBe(
      "\n\n[Notes attached by user]\n\n### A.md\n\num\n\n---\n\n### B.md\n\ndois"
    );
    expect(attachedNotesSection([])).toBe("");
    expect(instructionsSection("  Seja breve.  ")).toBe("\n\nSeja breve.");
  });
});

describe("formatarTokens — curto, e com ~ porque é estimativa", () => {
  it("zero sem til", () => expect(formatTokens(0)).toBe("0 tokens"));
  it("centenas", () => expect(formatTokens(340)).toBe("~340 tokens"));
  it("milhares com uma casa", () => {
    expect(formatTokens(1234)).toBe("~1.2k tokens");
    expect(formatTokens(2000)).toBe("~2k tokens");
  });
  it("dezenas de milhares, redondo", () =>
    expect(formatTokens(12_400)).toBe("~12k tokens"));
});
