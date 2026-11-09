import { describe, it, expect } from "vitest";
import { peDoWizard } from "../src/ui/wizard";
import { PASSOS_SKILL } from "../src/ui/SkillSheet";
import { PASSOS_PROJETO } from "../src/ui/ProjectSheet";
import { SKILL_DRAFT_VAZIO } from "../src/skills/skillFile";

const TOTAL = PASSOS_SKILL.length;
const ULTIMO = TOTAL - 1;

const pe = (atual: number, problema: string | null = null, total = TOTAL) =>
  peDoWizard({ atual, total, problema });

describe("os botões da fila", () => {
  it("a seta de cima RECUA um passo, e só sai quando não há passo atrás", () => {

    expect(pe(0).voltar).toBe("sair");
    expect(pe(1).voltar).toBe("passo");
    expect(pe(ULTIMO).voltar).toBe("passo");
  });

  it("o do meio avança, o último conclui", () => {
    expect(pe(0).primario).toBe("next");
    expect(pe(ULTIMO - 1).primario).toBe("next");
    expect(pe(ULTIMO).primario).toBe("submit");
    expect(pe(ULTIMO).ultimo).toBe(true);
  });

  it("uma fila de UM passo é um formulário comum: conclui e não volta", () => {
    const p = pe(0, null, 1);
    expect(p.primario).toBe("submit");
    expect(p.voltar).toBe("sair");
  });

  it("um índice além do fim não inventa um passo que não existe", () => {

    expect(pe(TOTAL + 4).primario).toBe("submit");
  });
});

describe("a linha de status", () => {
  it("o que FALTA só aparece onde há o que salvar", () => {

    expect(pe(0, "Give it a name.").status).toBe(null);
    expect(pe(ULTIMO, "Give it a name.").status).toBe("problema");
  });

  it("pronto no meio do caminho vira ATALHO de concluir", () => {

    expect(pe(0).status).toBe("atalho");
    expect(pe(ULTIMO - 1).status).toBe("atalho");
  });

  it("no último passo, pronto, a linha some — não há o que dizer", () => {
    expect(pe(ULTIMO).status).toBe(null);
  });

  it("problema e atalho nunca aparecem juntos", () => {

    for (let i = 0; i <= TOTAL; i++)
      for (const prob of [null, "falta algo"]) {
        const s = peDoWizard({ atual: i, total: TOTAL, problema: prob }).status;
        expect(s === "problema" && prob === null).toBe(false);
        expect(s === "atalho" && prob !== null).toBe(false);
      }
  });

  it("o botão de concluir só se oferece quando dá", () => {

    expect(pe(ULTIMO, "falta").pronto).toBe(false);
    expect(pe(ULTIMO).pronto).toBe(true);
  });
});

describe("os passos cobrem o skill", () => {
  it("uma pergunta por tela: um passo por campo, nem mais nem menos", () => {

    const ids = PASSOS_SKILL.map((p) => p.id as string).sort();
    expect(ids).toEqual([...Object.keys(SKILL_DRAFT_VAZIO)].sort());
  });

  it("nenhum passo repetido, e o prompt vem primeiro", () => {
    const ids = PASSOS_SKILL.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);

    expect(ids[0]).toBe("body");
  });

  it("todo passo tem um rótulo curto — ele vai no TÍTULO da folha", () => {
    for (const p of PASSOS_SKILL) {
      expect(p.label.trim()).not.toBe("");
      expect(p.label.length).toBeLessThanOrEqual(14);
    }
  });
});

describe("o wizard de PROJETO", () => {

  it("uma pergunta por tela: nome, notas, instruções, cor e ícone", () => {
    expect(PASSOS_PROJETO.map((p) => p.id)).toEqual([
      "name",
      "notes",
      "instructions",
      "color",
      "icon",
    ]);
  });

  it("o nome vem primeiro — é nele que o ✨ monta o projeto inteiro", () => {

    expect(PASSOS_PROJETO[0].id).toBe("name");
  });

  it("as notas vêm ANTES das instruções", () => {

    const ids = PASSOS_PROJETO.map((p) => p.id as string);
    expect(ids.indexOf("notes")).toBeLessThan(ids.indexOf("instructions"));
  });

  it("todo passo tem um rótulo curto — ele vai no TÍTULO da folha", () => {
    for (const p of PASSOS_PROJETO) {
      expect(p.label.trim()).not.toBe("");
      expect(p.label.length).toBeLessThanOrEqual(14);
    }
  });
});
