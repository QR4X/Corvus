import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CSS = readFileSync(resolve(__dirname, "../styles/main.css"), "utf8");
const SEM_COMENTARIO = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

function bloco(agulha: string): string {
  const i = SEM_COMENTARIO.indexOf(agulha);
  expect(i, `seletor sumiu do CSS: ${agulha}`).toBeGreaterThan(-1);
  const abre = SEM_COMENTARIO.indexOf("{", i);
  const fecha = SEM_COMENTARIO.indexOf("}", abre);
  return SEM_COMENTARIO.slice(abre + 1, fecha);
}

describe("a faixa da barra de gestos tem a cor da folha", () => {

  const faixa = () => bloco(".workspace-drawer-inner.corvus-sheet-open {");

  it("a folha e a faixa usam o MESMO token de cor", () => {

    expect(bloco(".corvus-root .corvus-sheet {")).toContain(
      "background-color: var(--corvus-sheet-bg)"
    );
    expect(faixa()).toContain("var(--corvus-sheet-bg)");
    expect(CSS).toMatch(/--corvus-sheet-bg:\s*color-mix\(/);
  });

  it("pinta SÓ a faixa de baixo — a de cima é da barra de status", () => {

    expect(faixa()).not.toMatch(/background-color\s*:/);
    expect(faixa()).toMatch(/background-image:\s*linear-gradient\(\s*to top/);

    expect(faixa()).toContain(
      "max(var(--safe-area-inset-bottom), var(--size-4-4))"
    );
  });

  it("só enquanto há folha aberta, e só na tela cheia", () => {

    expect(SEM_COMENTARIO).toContain(
      "body.is-mobile .workspace-drawer.corvus-fullscreen .workspace-drawer-inner.corvus-sheet-open {"
    );
    const js = readFileSync(resolve(__dirname, "../src/ui/sheetStrip.ts"), "utf8");

    expect(js).toContain('SHEET_OPEN_CLASS = "corvus-sheet-open"');
    expect(js).toContain('".corvus-root .corvus-sheet-layer.is-open"');
  });
});

describe("o CSS passa no linter da revisão do Obsidian", () => {

  it("nenhum `:has(`", () => {
    expect(SEM_COMENTARIO).not.toContain(":has(");
  });

  it("nenhum `!important`", () => {
    expect(SEM_COMENTARIO).not.toContain("!important");
  });
});

describe("o tamanho FIT: a folha encolhe quando o teclado fecha", () => {
  it("do tamanho do conteúdo, com o teto do grande", () => {
    const b = bloco(".corvus-root .corvus-sheet.is-fit {");

    expect(b).toContain("min-height: 0");
    expect(b).toContain("max-height: 94%");

    expect(bloco(".corvus-root .corvus-sheet.is-full {")).toContain("max-height: 94%");
  });
});

describe("os cartões de skill têm todos o mesmo tamanho", () => {

  it("a prévia do prompt tem altura FIXA, não um intervalo", () => {
    const b = bloco(".corvus-root .corvus-tile-paper {");
    expect(b).toMatch(/(^|\s)height:\s*\d+px/);
    expect(b).not.toMatch(/min-height|max-height/);
  });

  it("as colunas são metades exatas — o conteúdo não estica nenhuma", () => {

    expect(bloco(".corvus-root .corvus-tiles {")).toContain(
      "grid-template-columns: repeat(2, minmax(0, 1fr))"
    );
    expect(bloco(".corvus-root .corvus-tile-wrap {")).toContain("min-width: 0");
  });

  it("o cartão ocupa a célula inteira, e o nome corta em vez de quebrar", () => {
    expect(bloco(".corvus-root button.corvus-tile {")).toContain("height: 100%");
    const nome = bloco(".corvus-root .corvus-tile-head .corvus-tile-name {");
    expect(nome).toContain("white-space: nowrap");
    expect(nome).toContain("text-overflow: ellipsis");
  });
});

describe("contraste dentro das folhas — medido, e preso aqui", () => {

  it("informação em cima de um cartão é muted, nunca faint", () => {

    for (const sel of [
      ".corvus-root .corvus-proj-card-when {",
      ".corvus-root .corvus-proj-card-about.is-empty {",
      ".corvus-root .corvus-proj-card-stat .corvus-icon {",
      ".corvus-root button.corvus-proj-card-more {",
      ".corvus-root button.corvus-tile-more {",
      ".corvus-root .corvus-field-hint {",
    ]) {
      const b = bloco(sel);
      expect(b, sel).toContain("var(--text-muted)");
      expect(b, sel).not.toContain("var(--text-faint)");
    }
  });

  it("no tema claro, o cartão é o papel do tema — mais CLARO que a folha", () => {
    const claro = bloco("body.theme-light .corvus-root .corvus-sheet {");
    expect(claro).toContain("--corvus-s1: var(--background-primary)");
  });

  it("os degraus da folha saem só do tema — nenhuma cor escrita à mão", () => {

    const i = SEM_COMENTARIO.indexOf(
      "--corvus-s1: color-mix(in srgb, var(--text-normal) 12%"
    );
    expect(i, "o degrau do escuro dentro da folha sumiu").toBeGreaterThan(-1);
    const escuro = SEM_COMENTARIO.slice(
      SEM_COMENTARIO.lastIndexOf("{", i),
      SEM_COMENTARIO.indexOf("}", i)
    );
    const claro = bloco("body.theme-light .corvus-root .corvus-sheet {");
    for (const b of [escuro, claro]) {
      expect(b).toContain("--corvus-s1:");
      expect(b).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    }
  });

  it("campos, grupos, prévia e busca usam a MESMA superfície dos cartões", () => {
    const b = bloco(".corvus-root .corvus-sheet .corvus-sheet-group,");
    expect(b).toContain("background-color: var(--corvus-s1)");
    for (const sel of [
      ".corvus-root .corvus-sheet .corvus-form-preview",
      ".corvus-root .corvus-sheet .corvus-field-input",
      ".corvus-root .corvus-sheet .corvus-textarea",
      ".corvus-root .corvus-sheet .corvus-search-field",
    ])
      expect(CSS).toContain(sel);
  });

  it("o ícone de um projeto se mistura com o texto do TEMA pra ler na placa", () => {

    expect(bloco(".corvus-root .corvus-thing-mark svg {")).toMatch(
      /color-mix\(in srgb, currentColor \d+%, var\(--text-normal\)\)/
    );
  });

  it("o véu parte do véu do tema, só mais fundo", () => {
    const b = bloco(".corvus-root .corvus-scrim {");
    expect(b).toContain("var(--background-modifier-cover");
    expect(b).toContain("color-mix(");
  });
});
