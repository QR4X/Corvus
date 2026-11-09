import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CSS = readFileSync(resolve(__dirname, "../styles/main.css"), "utf8").replace(/\r\n/g, "\n");

function bloco(agulha: string): string {
  const i = CSS.indexOf(agulha);
  expect(i, `seletor sumiu do CSS: ${agulha}`).toBeGreaterThan(-1);
  const abre = CSS.indexOf("{", i);
  const fecha = CSS.indexOf("}", abre);
  return CSS.slice(abre + 1, fecha);
}

const SEM_COMENTARIO = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

function contas(): string[] {

  return SEM_COMENTARIO.split(";")
    .map((d) => d.replace(/\s+/g, " ").trim())
    .filter((d) => d.includes("var(--keyboard-height"))
    .map((d) => d.slice(d.lastIndexOf("{") + 1).trim());
}

describe("a única conta de teclado", () => {
  it("a gaveta desconta a medida da própria altura", () => {

    const b = bloco("body.is-mobile:not(#corvus-specificity) .workspace-drawer.corvus-keyboard-open {");
    expect(b).toContain("calc(100vh - var(--keyboard-height, 0px))");
    expect(b).not.toContain("100dvh");

    const iRegra = SEM_COMENTARIO.indexOf(
      "body.is-mobile:not(#corvus-specificity) .workspace-drawer.corvus-keyboard-open {"
    );
    const iSupports = SEM_COMENTARIO.indexOf(
      "@supports (height: 100dvh)",
      iRegra
    );
    expect(iSupports, "o @supports com o dvh sumiu").toBeGreaterThan(iRegra);
    const dentro = SEM_COMENTARIO.slice(iSupports, iSupports + 400);
    expect(dentro).toContain(
      "body.is-mobile:not(#corvus-specificity) .workspace-drawer.corvus-keyboard-open"
    );
    expect(dentro).toContain("calc(100dvh - var(--keyboard-height, 0px))");
  });

  it("a gaveta em TELA CHEIA desconta pelo mesmo par", () => {

    const b = bloco("body.is-mobile:not(#corvus-specificity) .workspace-drawer.corvus-fullscreen {");
    expect(b).toContain("calc(100vh - var(--keyboard-height, 0px))");
    const i = SEM_COMENTARIO.indexOf(
      "body.is-mobile:not(#corvus-specificity) .workspace-drawer.corvus-fullscreen {"
    );
    const dentro = SEM_COMENTARIO.slice(
      SEM_COMENTARIO.indexOf("@supports (height: 100dvh)", i),
      SEM_COMENTARIO.indexOf("@supports (height: 100dvh)", i) + 400
    );
    expect(dentro).toContain("calc(100dvh - var(--keyboard-height, 0px))");
  });

  it("a LARGURA da tela cheia vence a largura inline do tablet sem !important", () => {

    const b = bloco("body.is-mobile .workspace-drawer.corvus-fullscreen {");
    const sem = b.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(sem).toMatch(/(?:^|[\s;])width:\s*100vw;/);
    expect(sem).toMatch(/min-width:\s*100vw;/);
    expect(sem).not.toContain("!important");
  });

  it("as quatro alturas da gaveta carregam o reforço de especificidade", () => {

    const alturas = SEM_COMENTARIO.split("}").filter((r) =>

      /(?:^|[\s;{])height:\s*calc\(100d?vh - var\(--keyboard-height/.test(r)
    );
    expect(alturas).toHaveLength(4);
    for (const r of alturas) expect(r).toContain(":not(#corvus-specificity)");
  });

  it("as camadas da folha entram na CAIXA do composer, sem conta própria", () => {

    const b = bloco(
      ".workspace-drawer.corvus-keyboard-open .corvus-root .corvus-sheet-layer"
    );
    expect(b).toContain("position: absolute");
    expect(b).not.toContain("--keyboard-height");

    expect(b).toContain("height: auto");

    expect(b).toContain("display: flex");
    expect(b).toContain("flex-direction: column");
  });

  it("presa ao MESMO sinal que encolhe a gaveta, não só ao do body", () => {

    const idx = SEM_COMENTARIO.indexOf(".workspace-drawer.corvus-keyboard-open .corvus-root .corvus-sheet-layer");
    const regra = SEM_COMENTARIO.slice(idx, SEM_COMENTARIO.indexOf("{", idx));
    expect(regra).toContain(".workspace-drawer.corvus-keyboard-open .corvus-root .corvus-sheet-layer");
    expect(regra).toContain("body.is-mobile.corvus-keyboard-open .corvus-root .corvus-sheet-layer");
  });

  it("a folha é um item flex SEM altura calculada e sem transição de altura", () => {

    const b = bloco(
      ".workspace-drawer.corvus-keyboard-open .corvus-root .corvus-sheet-layer .corvus-sheet"
    );
    expect(b).toContain("flex: 1 1 auto");
    expect(b).toContain("min-height: 0");
    expect(b).toContain("max-height: none");
    expect(b).not.toMatch(/\d+%/);

    expect(b).toMatch(/transition:\s*transform[^;]*;/);
    expect(b).not.toMatch(/transition:[^;]*(min-height|max-height)/);
  });

  it("a lista de quem desconta o teclado é ESTA, e ela é curta", () => {

    const permitidas = new Set([

      "height: calc(100vh - var(--keyboard-height, 0px))",
      "height: calc(100dvh - var(--keyboard-height, 0px))",

      "max-height: calc(100vh - var(--keyboard-height, 50vh) - 32px)",
      "margin-bottom: calc( var(--keyboard-height, 0px) + max(var(--safe-area-inset-bottom, 0px), 12px) )",
    ]);
    const novas = contas().filter((d) => !permitidas.has(d));
    expect(novas, "conta de teclado sem dono conhecido").toEqual([]);
  });

  it("ninguém soma o teclado como respiro — foi o bug 0.1.246", () => {

    const respiros = contas().filter((l) => /^padding-bottom:/.test(l));
    expect(respiros).toEqual([]);
  });
});

describe("o painel da assistente segue o composer", () => {
  it("é `absolute` dentro da raiz, sem medir teclado nenhum", () => {

    const b = bloco(".corvus-root .corvus-assist-layer {");
    expect(b).toContain("position: absolute");
    expect(b).not.toContain("--keyboard-height");
  });
});

describe("o respiro embaixo do último botão é o que JÁ funciona no aparelho", () => {

  it("o rodapé da folha usa EXATAMENTE o respiro do painel da assistente", () => {

    const valor = (b: string) =>
      /padding-bottom:\s*([^;]+);/.exec(
        b.replace(/\/\*[\s\S]*?\*\//g, "")
      )?.[1].trim();
    const folha = valor(
      bloco("body.corvus-keyboard-open .corvus-root .corvus-sheet-actions,")
    );
    const painel = valor(bloco(".corvus-root .corvus-assist-layer {"));
    expect(folha).toBe("15px");
    expect(folha).toBe(painel);
  });

  it("o composer continua com o respiro dele", () => {

    const c = bloco("body.is-mobile .corvus-keyboard-open .corvus-composer,");
    expect(c).toContain("padding-bottom: var(--corvus-2)");
  });

  it("o painel da assistente usa os 15px do composer", () => {
    const b = bloco(".corvus-root .corvus-assist-layer {");
    expect(b).toContain("padding-bottom: 15px");
    expect(CSS).not.toContain("--corvus-ime-slack:");
  });

  it("o cartão da assistente desce por margem, não por `justify-content`", () => {

    const camada = bloco(".corvus-root .corvus-assist-layer {").replace(
      /\/\*[\s\S]*?\*\//g,
      ""
    );
    expect(camada).not.toMatch(/justify-content:\s*flex-end/);
    const cartao = bloco(".corvus-root .corvus-assist-layer .corvus-assist {");
    expect(cartao).toContain("margin-top: auto");
  });
});

describe("com o teclado aberto, o botão da folha pousa como o cartão da assistente", () => {

  const sem = (b: string) => b.replace(/\/\*[\s\S]*?\*\//g, "");
  const flutuante = () =>
    sem(bloco(".workspace-drawer.corvus-keyboard-open .corvus-root .corvus-float-foot,"));
  const painel = () => sem(bloco(".corvus-root .corvus-assist-layer {"));

  it("mesma caixa e mesma coluna que o painel", () => {
    for (const d of [
      "position: absolute",
      "inset: 0",
      "display: flex",
      "flex-direction: column",
    ]) {
      expect(flutuante(), d).toContain(d);
      expect(painel(), d).toContain(d);
    }
  });

  it("mesmo respiro embaixo que o painel", () => {
    const pb = (b: string) => /padding-bottom:\s*([^;]+);/.exec(b)?.[1].trim();
    expect(pb(flutuante())).toBe(pb(painel()));
  });

  it("desce por margem automática, como o cartão do painel", () => {
    expect(sem(bloco(".corvus-root .corvus-float-foot-card {"))).toContain(
      "margin-top: auto"
    );
  });

  it("não engole os toques na folha embaixo", () => {

    expect(flutuante()).toContain("pointer-events: none");
    expect(sem(bloco(".corvus-root .corvus-float-foot-card {"))).toContain(
      "pointer-events: auto"
    );
  });

  it("fica abaixo do painel da assistente e acima da folha", () => {
    const z = (b: string) => Number(/z-index:\s*(\d+)/.exec(b)?.[1]);
    expect(z(flutuante())).toBeGreaterThan(1000);
    expect(z(flutuante())).toBeLessThan(z(painel()));
  });

  it("fechado o teclado, ela nem aparece — e o pé de dentro da folha volta", () => {
    expect(sem(bloco(".corvus-root .corvus-float-foot {"))).toContain("display: none");

    const dentro = sem(
      bloco(".workspace-drawer.corvus-keyboard-open .corvus-root .corvus-sheet-actions,\nbody.is-mobile.corvus-keyboard-open .corvus-root .corvus-sheet-actions {")
    );
    expect(dentro).toContain("visibility: hidden");
  });
});
