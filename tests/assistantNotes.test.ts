import { describe, it, expect } from "vitest";
import { parseNotes, parseProject } from "../src/assistant/parse";
import { promptNotes } from "../src/assistant/prompt";

const VAULT = [
  "Tese/Kuhn - estrutura.md",
  "Tese/Lakatos.md",
  "DAILY/26-09-13.md",
  "Receitas/Bolo.md",
];

describe("lerNotas — só volta o que existe", () => {
  it("aceita os caminhos que estão na lista do vault", () => {
    expect(
      parseNotes({ notes: ["Tese/Lakatos.md", "Tese/Kuhn - estrutura.md"] }, VAULT)
    ).toEqual(["Tese/Lakatos.md", "Tese/Kuhn - estrutura.md"]);
  });

  it("descarta caminho inventado — modelo pequeno inventa nome plausível", () => {

    expect(
      parseNotes({ notes: ["Tese/Popper.md", "Tese/Lakatos.md"] }, VAULT)
    ).toEqual(["Tese/Lakatos.md"]);
  });

  it("não devolve as que já estão escolhidas", () => {

    expect(
      parseNotes(
        { notes: ["Tese/Lakatos.md", "Tese/Kuhn - estrutura.md"] },
        VAULT,
        ["Tese/Lakatos.md"]
      )
    ).toEqual(["Tese/Kuhn - estrutura.md"]);
  });

  it("sem repetidas, e no máximo dez", () => {
    const muitas = Array.from({ length: 15 }, (_, i) => `N/${i}.md`);
    expect(parseNotes({ notes: [...muitas, ...muitas] }, muitas)).toHaveLength(10);
    expect(
      parseNotes({ notes: ["Tese/Lakatos.md", "Tese/Lakatos.md"] }, VAULT)
    ).toEqual(["Tese/Lakatos.md"]);
  });

  it("resposta torta vira lista vazia, não erro", () => {
    expect(parseNotes(null, VAULT)).toEqual([]);
    expect(parseNotes({ notes: "Tese/Lakatos.md" }, VAULT)).toEqual([]);
    expect(parseNotes({ notes: [1, null, { p: 1 }] }, VAULT)).toEqual([]);
  });

  it("o ✨ do projeto inteiro filtra as notas pelo MESMO critério", () => {

    const p = parseProject(
      { name: "Tese", notes: ["Tese/Popper.md", "Tese/Lakatos.md", "Tese/Lakatos.md"] },
      ["folder"],
      ["default"],
      VAULT
    );
    expect(p?.notes).toEqual(["Tese/Lakatos.md"]);
  });
});

describe("promptNotas — o que vai pro modelo", () => {
  const base = {
    name: "Tese de mestrado",
    instructions: "",
    picked: [] as string[],
    paths: VAULT,
  };

  it("manda os caminhos, e pede de volta EXATAMENTE deles", () => {
    const p = promptNotes(base);
    for (const c of VAULT) expect(p).toContain(`- ${c}`);
    expect(p).toMatch(/exact paths/i);
    expect(p).toContain('{"notes"');
  });

  it("manda o nome do projeto, e as instruções quando existem", () => {
    expect(promptNotes(base)).toContain("Tese de mestrado");
    const comInstr = promptNotes({ ...base, instructions: "Foco em Kuhn." });
    expect(comInstr).toContain("Foco em Kuhn.");
    expect(promptNotes(base)).not.toMatch(/Its instructions/);
  });

  it("avisa o que já está escolhido, pra não voltar repetido", () => {
    const p = promptNotes({ ...base, picked: ["Tese/Lakatos.md"] });
    expect(p).toMatch(/Already attached/);
    expect(p).toContain("- Tese/Lakatos.md");
  });

  it("answers in English", () => {
    expect(promptNotes(base)).toContain("Write EVERY field in English");
  });
});
