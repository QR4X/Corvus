import { describe, it, expect, beforeEach } from "vitest";
import {
  comecarRodada,
  lerRun,
  limparRun,
  assinar,
  _resetRuns,
} from "../src/assistant/store";
import { lerOpcoes } from "../src/assistant/parse";

const espera = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => _resetRuns());

describe("a rodada sobrevive a quem pediu", () => {
  it("segue até o fim mesmo sem ninguém olhando", async () => {

    let resolver!: (r: { draft: unknown }) => void;
    comecarRodada(
      "skill",
      [{ quem: "pessoa", texto: "um resumo semanal" }],
      () => new Promise((r) => (resolver = r))
    );
    expect(lerRun("skill").fase).toBe("rodando");
    resolver({ draft: { name: "Weekly review" } });
    await espera();
    expect(lerRun("skill").fase).toBe("pronto");
    expect(lerRun("skill").resultado).toEqual({ name: "Weekly review" });
  });

  it("o resultado ESPERA ser consumido", async () => {

    comecarRodada("project", [], async () => ({ draft: { name: "Tese" } }));
    await espera();
    expect(lerRun("project").resultado).toEqual({ name: "Tese" });
    limparRun("project");
    expect(lerRun("project").fase).toBe("parada");
  });

  it("avisa quem estiver assinando", async () => {
    const vistos: string[] = [];
    const sair = assinar("skill", () => vistos.push(lerRun("skill").fase));
    comecarRodada("skill", [], async () => ({ draft: 1 }));
    await espera();
    sair();
    expect(vistos).toEqual(["rodando", "pronto"]);
  });

  it("um throw solto não deixa a rodada travada em 'rodando'", async () => {

    comecarRodada("skill", [], async () => {
      throw new Error("caiu a rede");
    });
    await espera();
    expect(lerRun("skill").fase).toBe("erro");
    expect(lerRun("skill").erro).toContain("caiu a rede");
  });

  it("uma rodada nova substitui a anterior do mesmo tipo", async () => {

    comecarRodada("skill", [], async () => ({ draft: "velho" }));
    await espera();
    comecarRodada("skill", [], async () => ({ draft: "novo" }));
    await espera();
    expect(lerRun("skill").resultado).toBe("novo");
  });

  it("tipos diferentes não se atropelam", async () => {
    comecarRodada("skill", [], async () => ({ draft: "s" }));
    comecarRodada("description", [], async () => ({ draft: "d" }));
    await espera();
    expect(lerRun("skill").resultado).toBe("s");
    expect(lerRun("description").resultado).toBe("d");
  });
});

describe("o interrogatório", () => {
  it("a pergunta entra na conversa", async () => {

    comecarRodada(
      "skill",
      [{ quem: "pessoa", texto: "um resumo" }],
      async () => ({ pergunta: "Pra quê?", opcoes: ["Estudo", "Trabalho"] })
    );
    await espera();
    const r = lerRun("skill");
    expect(r.fase).toBe("perguntando");
    expect(r.opcoes).toEqual(["Estudo", "Trabalho"]);
    expect(r.turnos.at(-1)).toEqual({ quem: "assistente", texto: "Pra quê?" });
  });
});

describe("lerOpcoes", () => {
  it("passa as pastilhas", () => {
    expect(lerOpcoes({ options: ["Estudo", "Trabalho"] })).toEqual([
      "Estudo",
      "Trabalho",
    ]);
  });

  it("corta em TRÊS — a quarta pastilha é nossa", () => {

    const r = lerOpcoes({ options: ["a", "b", "c", "d", "e"] });
    expect(r).toEqual(["a", "b", "c"]);
  });

  it("pastilha com frase dentro é cortada", () => {

    expect(lerOpcoes({ options: ["x".repeat(80)] })[0]).toHaveLength(30);
  });

  it("ignora o que não é texto, o vazio e o repetido", () => {
    expect(lerOpcoes({ options: [1, "ok", "  ", "ok", null] })).toEqual(["ok"]);
  });

  it("sem opções, lista vazia — a pergunta pode ser aberta", () => {
    expect(lerOpcoes({ ask: "e aí?" })).toEqual([]);
    expect(lerOpcoes(null)).toEqual([]);
  });
});
