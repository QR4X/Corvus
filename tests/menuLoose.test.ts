import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CSS = readFileSync(resolve(__dirname, "../styles/main.css"), "utf8");
const SEM_COMENTARIO = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

function bloco(seletor: string): string {
  const escapado = seletor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = SEM_COMENTARIO.match(new RegExp(`(?:^|\\})\\s*${escapado}\\s*\\{([^}]*)\\}`, "m"));
  expect(m, `regra sumiu: ${seletor}`).toBeTruthy();
  return m![1];
}

const token = (corpo: string, nome: string) =>
  corpo.match(new RegExp(`${nome}:\\s*([^;]+);`))?.[1].trim();

describe("o balão não depende da raiz", () => {
  it("nenhuma regra do balão começa por .corvus-root", () => {
    expect(SEM_COMENTARIO).not.toMatch(/\.corvus-root\s+(button)?\.corvus-pop/);
  });

  it("a camada traz os tokens da raiz, com os MESMOS valores", () => {
    const raiz = bloco(".corvus-root");
    const camada = bloco(".corvus-pop-layer");
    for (const nome of ["--corvus-1", "--corvus-2", "--corvus-3", "--corvus-s1", "--corvus-hairline"]) {
      expect(token(camada, nome), nome).toBeTruthy();
      expect(token(camada, nome), nome).toBe(token(raiz, nome));
    }
  });

  it("solta (fora da raiz), a camada tem a tela como referência", () => {
    expect(bloco(".corvus-pop-layer.is-loose")).toMatch(/position:\s*fixed/);
  });

  it("o balão de escolha é a continuação do botão: rola, e sem largura própria", () => {
    const corpo = bloco(".corvus-pop-layer .corvus-pop.is-pick");
    expect(corpo).toMatch(/overflow-y:\s*auto/);

    expect(corpo).toMatch(/max-width:\s*none/);
    expect(corpo).toMatch(/background-color:\s*var\(--dropdown-background\)/);
  });

  it("aberto, botão e lista fecham um cartão só (o canto do encontro fica reto)", () => {
    expect(bloco(".corvus-pop-layer .corvus-pop.is-pick.is-down")).toMatch(/border-top-left-radius:\s*0/);
    expect(bloco(".corvus-pop-layer .corvus-pop.is-pick.is-up")).toMatch(/border-bottom-left-radius:\s*0/);
    expect(bloco(".corvus-settings-root button.corvus-pick.is-open-down")).toMatch(
      /border-radius:\s*var\(--corvus-r\) var\(--corvus-r\) 0 0/
    );
    expect(bloco(".corvus-settings-root button.corvus-pick.is-open-up")).toMatch(
      /border-radius:\s*0 0 var\(--corvus-r\) var\(--corvus-r\)/
    );
  });

  it("linha com ▶ (as vozes): o item fica com a linha menos a ponta", () => {
    expect(bloco(".corvus-pop-layer .corvus-pop-row")).toMatch(/display:\s*flex/);
    const item = bloco(".corvus-pop-layer .corvus-pop-row > button.corvus-pop-item");
    expect(item).toMatch(/flex:\s*1 1 auto/);
    expect(item).toMatch(/min-width:\s*0/);
    const extra = bloco(".corvus-pop-layer button.corvus-pop-extra");
    expect(extra).toMatch(/width:\s*40px/);
    expect(extra).toMatch(/flex:\s*0 0 auto/);
  });

  it("as linhas da lista têm as colunas do botão", () => {
    const linha = bloco(".corvus-pop-layer .corvus-pop.is-pick button.corvus-pop-item");
    const botao = bloco(".corvus-settings-root .setting-item-control button.corvus-pick");
    const pad = (c: string) => c.match(/padding:\s*([^;]+);/)?.[1].trim();
    expect(pad(linha)).toBe(pad(botao));
    expect(linha).toMatch(/gap:\s*var\(--size-4-2\)/);
    expect(botao).toMatch(/gap:\s*var\(--size-4-2\)/);
    expect(linha).toMatch(/min-height:\s*var\(--input-height\)/);
  });
});

describe("o menu.ts decide onde o balão mora pelo BOTÃO", () => {
  const MENU = readFileSync(resolve(__dirname, "../src/ui/menu.ts"), "utf8");

  it("procura a raiz a partir da âncora, não no documento inteiro", () => {

    expect(MENU).toMatch(/ancoraEl\.closest<HTMLElement>\("\.corvus-root"\)/);
  });

  it("o ▶ não fecha o balão nem escolhe a linha, e quem abriu sabe quando ele fecha", () => {

    expect(MENU).toMatch(/cls: "corvus-pop-extra"[\s\S]{0,400}e\.stopPropagation\(\);\s*run\(x\);/);

    expect(MENU).toMatch(/camada\.remove\(\);\s*opts\.aoFechar\?\.\(\);/);
  });

  it("fora da raiz, mora no modal (some junto com ele) ou no body", () => {
    expect(MENU).toMatch(/closest<HTMLElement>\("\.modal-container"\)/);
    expect(MENU).toContain('"corvus-pop-layer is-loose"');
  });
});
