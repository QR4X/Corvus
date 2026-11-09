import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Platform, __avisos } from "obsidian";
import type { App } from "obsidian";
import { FONTE_DO_HOVER, abrirLinkDaResposta } from "../src/ui/linksDaResposta";
import { VIEW_TYPE_CORVUS } from "../src/ui/CorvusView";

// As citações [[Nota]] de uma resposta abrem a nota: o que existe abre (com a
// seção, se tiver), o que a IA inventou vira aviso em vez de nota vazia, e no
// celular a gaveta da conversa sai da frente.

interface Gaveta {
  fechada: boolean;
  collapse(): void;
}
const gaveta = (): Gaveta => ({
  fechada: false,
  collapse() {
    this.fechada = true;
  },
});

function montar(notas: string[], onde: "direita" | "esquerda" | "centro") {
  const rightSplit = gaveta();
  const leftSplit = gaveta();
  const centro = {};
  const abertos: Array<[string, string, unknown]> = [];
  const dentro = { id: "resposta" };
  const folha = {
    view: { containerEl: { contains: (n: unknown) => n === dentro } },
    getRoot: () => (onde === "direita" ? rightSplit : onde === "esquerda" ? leftSplit : centro),
  };
  const app = {
    metadataCache: {
      getFirstLinkpathDest: (caminho: string, origem: string) =>
        origem === "" && notas.includes(caminho) ? { path: caminho + ".md" } : null,
    },
    workspace: {
      rightSplit,
      leftSplit,
      openLinkText: async (texto: string, origem: string, aba: unknown) => {
        abertos.push([texto, origem, aba]);
      },
      getLeavesOfType: (tipo: string) => (tipo === FONTE_DO_HOVER ? [folha] : []),
    },
  } as unknown as App;
  return { app, abertos, rightSplit, leftSplit, dentro: dentro as unknown as Element };
}

describe("os links da resposta", () => {
  beforeEach(() => {
    __avisos.length = 0;
  });
  afterEach(() => {
    Platform.isMobile = false;
  });

  it("a fonte do hover é o tipo da view", () => {
    expect(FONTE_DO_HOVER).toBe(VIEW_TYPE_CORVUS);
  });

  it("abre a nota citada, com a seção, e repassa o pedido de aba nova", () => {
    const m = montar(["2026-09-24 Northwind kickoff"], "direita");
    expect(abrirLinkDaResposta(m.app, "2026-09-24 Northwind kickoff", false, m.dentro)).toBe(true);
    expect(abrirLinkDaResposta(m.app, "2026-09-24 Northwind kickoff#Decisões", "tab", m.dentro)).toBe(true);
    expect(m.abertos).toEqual([
      ["2026-09-24 Northwind kickoff", "", false],
      ["2026-09-24 Northwind kickoff#Decisões", "", "tab"],
    ]);
    expect(__avisos).toEqual([]);
  });

  it("citação que não leva a nota nenhuma avisa e não cria nota", () => {
    const m = montar([], "direita");
    expect(abrirLinkDaResposta(m.app, "Nota inventada#Seção", false, m.dentro)).toBe(false);
    expect(m.abertos).toEqual([]);
    expect(__avisos).toEqual(["Not found: Nota inventada"]);
  });

  it("no desktop a barra lateral fica aberta", () => {
    const m = montar(["Nota"], "direita");
    abrirLinkDaResposta(m.app, "Nota", false, m.dentro);
    expect(m.rightSplit.fechada).toBe(false);
  });

  it("no celular fecha a gaveta onde a conversa está", () => {
    Platform.isMobile = true;
    const d = montar(["Nota"], "direita");
    abrirLinkDaResposta(d.app, "Nota", false, d.dentro);
    expect([d.rightSplit.fechada, d.leftSplit.fechada]).toEqual([true, false]);

    const e = montar(["Nota"], "esquerda");
    abrirLinkDaResposta(e.app, "Nota", false, e.dentro);
    expect([e.rightSplit.fechada, e.leftSplit.fechada]).toEqual([false, true]);
  });

  it("no celular, com a conversa na área principal, nenhuma gaveta mexe", () => {
    Platform.isMobile = true;
    const m = montar(["Nota"], "centro");
    abrirLinkDaResposta(m.app, "Nota", false, m.dentro);
    expect([m.rightSplit.fechada, m.leftSplit.fechada]).toEqual([false, false]);
  });

  it("no celular, link sem destino não fecha a gaveta", () => {
    Platform.isMobile = true;
    const m = montar([], "direita");
    abrirLinkDaResposta(m.app, "Sumiu", false, m.dentro);
    expect(m.rightSplit.fechada).toBe(false);
  });
});
