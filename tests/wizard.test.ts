import { describe, it, expect } from "vitest";
import { wizardFoot } from "../src/ui/wizard";
import { SKILL_STEPS } from "../src/ui/SkillSheet";
import { PROJECT_STEPS } from "../src/ui/ProjectSheet";
import { EMPTY_SKILL_DRAFT } from "../src/skills/skillFile";

const TOTAL = SKILL_STEPS.length;
const ULTIMO = TOTAL - 1;

const pe = (atual: number, problema: string | null = null, total = TOTAL) =>
  wizardFoot({ current: atual, total, problem: problema });

describe("os botões da fila", () => {
  it("a seta de cima RECUA um passo, e só sai quando não há passo atrás", () => {

    expect(pe(0).back).toBe("exit");
    expect(pe(1).back).toBe("step");
    expect(pe(ULTIMO).back).toBe("step");
  });

  it("o do meio avança, o último conclui", () => {
    expect(pe(0).primary).toBe("next");
    expect(pe(ULTIMO - 1).primary).toBe("next");
    expect(pe(ULTIMO).primary).toBe("submit");
    expect(pe(ULTIMO).isLast).toBe(true);
  });

  it("uma fila de UM passo é um formulário comum: conclui e não volta", () => {
    const p = pe(0, null, 1);
    expect(p.primary).toBe("submit");
    expect(p.back).toBe("exit");
  });

  it("um índice além do fim não inventa um passo que não existe", () => {

    expect(pe(TOTAL + 4).primary).toBe("submit");
  });
});

describe("a linha de status", () => {
  it("o que FALTA só aparece onde há o que salvar", () => {

    expect(pe(0, "Give it a name.").status).toBe(null);
    expect(pe(ULTIMO, "Give it a name.").status).toBe("problem");
  });

  it("pronto no meio do caminho vira ATALHO de concluir", () => {

    expect(pe(0).status).toBe("shortcut");
    expect(pe(ULTIMO - 1).status).toBe("shortcut");
  });

  it("no último passo, pronto, a linha some — não há o que dizer", () => {
    expect(pe(ULTIMO).status).toBe(null);
  });

  it("problema e atalho nunca aparecem juntos", () => {

    for (let i = 0; i <= TOTAL; i++)
      for (const prob of [null, "falta algo"]) {
        const s = wizardFoot({ current: i, total: TOTAL, problem: prob }).status;
        expect(s === "problem" && prob === null).toBe(false);
        expect(s === "shortcut" && prob !== null).toBe(false);
      }
  });

  it("o botão de concluir só se oferece quando dá", () => {

    expect(pe(ULTIMO, "falta").ready).toBe(false);
    expect(pe(ULTIMO).ready).toBe(true);
  });
});

describe("os passos cobrem o skill", () => {
  it("uma pergunta por tela: um passo por campo, nem mais nem menos", () => {

    const ids = SKILL_STEPS.map((p) => p.id as string).sort();
    expect(ids).toEqual([...Object.keys(EMPTY_SKILL_DRAFT)].sort());
  });

  it("nenhum passo repetido, e o prompt vem primeiro", () => {
    const ids = SKILL_STEPS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);

    expect(ids[0]).toBe("body");
  });

  it("todo passo tem um rótulo curto — ele vai no TÍTULO da folha", () => {
    for (const p of SKILL_STEPS) {
      expect(p.label.trim()).not.toBe("");
      expect(p.label.length).toBeLessThanOrEqual(14);
    }
  });
});

describe("o wizard de PROJETO", () => {

  it("uma pergunta por tela: nome, notas, instruções, cor e ícone", () => {
    expect(PROJECT_STEPS.map((p) => p.id)).toEqual([
      "name",
      "notes",
      "instructions",
      "color",
      "icon",
    ]);
  });

  it("o nome vem primeiro — é nele que o ✨ monta o projeto inteiro", () => {

    expect(PROJECT_STEPS[0].id).toBe("name");
  });

  it("as notas vêm ANTES das instruções", () => {

    const ids = PROJECT_STEPS.map((p) => p.id as string);
    expect(ids.indexOf("notes")).toBeLessThan(ids.indexOf("instructions"));
  });

  it("todo passo tem um rótulo curto — ele vai no TÍTULO da folha", () => {
    for (const p of PROJECT_STEPS) {
      expect(p.label.trim()).not.toBe("");
      expect(p.label.length).toBeLessThanOrEqual(14);
    }
  });
});
