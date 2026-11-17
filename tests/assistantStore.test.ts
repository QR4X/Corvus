import { describe, it, expect, beforeEach } from "vitest";
import {
  startRun,
  getRun,
  clearRun,
  subscribe,
  _resetRuns,
} from "../src/assistant/store";
import { parseOptions } from "../src/assistant/parse";

const espera = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => _resetRuns());

describe("a rodada sobrevive a quem pediu", () => {
  it("segue até o fim mesmo sem ninguém olhando", async () => {

    let resolver!: (r: { draft: unknown }) => void;
    startRun(
      "skill",
      [{ role: "user", text: "um resumo semanal" }],
      () => new Promise((r) => (resolver = r))
    );
    expect(getRun("skill").phase).toBe("running");
    resolver({ draft: { name: "Weekly review" } });
    await espera();
    expect(getRun("skill").phase).toBe("done");
    expect(getRun("skill").result).toEqual({ name: "Weekly review" });
  });

  it("o resultado ESPERA ser consumido", async () => {

    startRun("project", [], async () => ({ draft: { name: "Tese" } }));
    await espera();
    expect(getRun("project").result).toEqual({ name: "Tese" });
    clearRun("project");
    expect(getRun("project").phase).toBe("idle");
  });

  it("avisa quem estiver assinando", async () => {
    const vistos: string[] = [];
    const sair = subscribe("skill", () => vistos.push(getRun("skill").phase));
    startRun("skill", [], async () => ({ draft: 1 }));
    await espera();
    sair();
    expect(vistos).toEqual(["running", "done"]);
  });

  it("um throw solto não deixa a rodada travada em 'running'", async () => {

    startRun("skill", [], async () => {
      throw new Error("caiu a rede");
    });
    await espera();
    expect(getRun("skill").phase).toBe("error");
    expect(getRun("skill").error).toContain("caiu a rede");
  });

  it("uma rodada nova substitui a anterior do mesmo tipo", async () => {

    startRun("skill", [], async () => ({ draft: "velho" }));
    await espera();
    startRun("skill", [], async () => ({ draft: "novo" }));
    await espera();
    expect(getRun("skill").result).toBe("novo");
  });

  it("tipos diferentes não se atropelam", async () => {
    startRun("skill", [], async () => ({ draft: "s" }));
    startRun("description", [], async () => ({ draft: "d" }));
    await espera();
    expect(getRun("skill").result).toBe("s");
    expect(getRun("description").result).toBe("d");
  });
});

describe("o interrogatório", () => {
  it("a pergunta entra na conversa", async () => {

    startRun(
      "skill",
      [{ role: "user", text: "um resumo" }],
      async () => ({ question: "Pra quê?", options: ["Estudo", "Trabalho"] })
    );
    await espera();
    const r = getRun("skill");
    expect(r.phase).toBe("asking");
    expect(r.options).toEqual(["Estudo", "Trabalho"]);
    expect(r.turns.at(-1)).toEqual({ role: "assistant", text: "Pra quê?" });
  });
});

describe("lerOpcoes", () => {
  it("passa as pastilhas", () => {
    expect(parseOptions({ options: ["Estudo", "Trabalho"] })).toEqual([
      "Estudo",
      "Trabalho",
    ]);
  });

  it("corta em TRÊS — a quarta pastilha é nossa", () => {

    const r = parseOptions({ options: ["a", "b", "c", "d", "e"] });
    expect(r).toEqual(["a", "b", "c"]);
  });

  it("pastilha com frase dentro é cortada", () => {

    expect(parseOptions({ options: ["x".repeat(80)] })[0]).toHaveLength(30);
  });

  it("ignora o que não é texto, o vazio e o repetido", () => {
    expect(parseOptions({ options: [1, "ok", "  ", "ok", null] })).toEqual(["ok"]);
  });

  it("sem opções, lista vazia — a pergunta pode ser aberta", () => {
    expect(parseOptions({ ask: "e aí?" })).toEqual([]);
    expect(parseOptions(null)).toEqual([]);
  });
});
