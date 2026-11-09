import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// A MOLDURA da folha no celular: a faixa da barra de gestos embaixo dela e o
// tamanho que ela assume quando o teclado fecha.

const CSS = readFileSync(resolve(__dirname, "../styles/main.css"), "utf8");
const SEM_COMENTARIO = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

/** O corpo (sem comentários) da primeira regra cujo seletor contém `agulha`. */
function bloco(agulha: string): string {
  const i = SEM_COMENTARIO.indexOf(agulha);
  expect(i, `seletor sumiu do CSS: ${agulha}`).toBeGreaterThan(-1);
  const abre = SEM_COMENTARIO.indexOf("{", i);
  const fecha = SEM_COMENTARIO.indexOf("}", abre);
  return SEM_COMENTARIO.slice(abre + 1, fecha);
}

describe("a faixa da barra de gestos tem a cor da folha", () => {
  // Com o teclado fechado, a folha termina em cima da reserva de baixo da
  // gaveta do Obsidian (`.workspace-drawer-inner`), pintada com a cor da
  // gaveta — um degrau mais escura que a folha. Aparecia como uma barra grudada
  // no fim dela.
  const faixa = () => bloco(".workspace-drawer-inner.corvus-sheet-open {");

  it("a folha e a faixa usam o MESMO token de cor", () => {
    // Duas contas pra mesma cor é como se descobre, meses depois, que uma
    // delas foi ajustada e a outra não.
    expect(bloco(".corvus-root .corvus-sheet {")).toContain(
      "background-color: var(--corvus-sheet-bg)"
    );
    expect(faixa()).toContain("var(--corvus-sheet-bg)");
    expect(CSS).toMatch(/--corvus-sheet-bg:\s*color-mix\(/);
  });

  it("pinta SÓ a faixa de baixo — a de cima é da barra de status", () => {
    // A mesma caixa reserva também a área da barra de status, em cima. Um
    // `background-color` pintaria as duas; o gradiente de corte seco pinta só
    // a altura da reserva de baixo.
    expect(faixa()).not.toMatch(/background-color\s*:/);
    expect(faixa()).toMatch(/background-image:\s*linear-gradient\(\s*to top/);
    // A altura do corte é a MESMA conta que o Obsidian usa pra reservar.
    expect(faixa()).toContain(
      "max(var(--safe-area-inset-bottom), var(--size-4-4))"
    );
  });

  it("só enquanto há folha aberta, e só na tela cheia", () => {
    // 0.9.16: a ponte entre a folha (nossa) e a caixa (do Obsidian) é uma
    // classe que o sheetStrip.ts recalcula do DOM — era um `:has`. Fora da
    // tela cheia o seletor de abas e o cabeçalho da gaveta ficam entre a folha
    // e a reserva, e a faixa pintada ficava solta.
    expect(SEM_COMENTARIO).toContain(
      "body.is-mobile .workspace-drawer.corvus-fullscreen .workspace-drawer-inner.corvus-sheet-open {"
    );
    const js = readFileSync(resolve(__dirname, "../src/ui/sheetStrip.ts"), "utf8");
    // A classe que o JS põe é a que o CSS espera, e o JS pergunta pela MESMA
    // camada aberta que o `:has` perguntava.
    expect(js).toContain('SHEET_OPEN_CLASS = "corvus-sheet-open"');
    expect(js).toContain('".corvus-root .corvus-sheet-layer.is-open"');
  });
});

describe("o CSS passa no linter da revisão do Obsidian", () => {
  // A revisão (stylelint-config-obsidianmd) conta cada `!important` e cada
  // `:has` como issue, e a nota pública é função dessa contagem. Zerados na
  // 0.9.16 — o motivo de cada troca está no cabeçalho de styles/main.css.
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
    // `0` e não `auto`: do grande pra este a folha ENCOLHE, e de auto o
    // navegador não anima.
    expect(b).toContain("min-height: 0");
    expect(b).toContain("max-height: 94%");
    // O teto é o mesmo do grande — um formulário longo pode chegar lá.
    expect(bloco(".corvus-root .corvus-sheet.is-full {")).toContain("max-height: 94%");
  });
});

describe("os cartões de skill têm todos o mesmo tamanho", () => {
  // Qualquer que seja o prompt ou o nome. Uma galeria se lê pelo ritmo, e o
  // ritmo é o tamanho igual: cartões de alturas diferentes numa grade abrem
  // degraus, e a fileira seguinte começa torta.
  it("a prévia do prompt tem altura FIXA, não um intervalo", () => {
    const b = bloco(".corvus-root .corvus-tile-paper {");
    expect(b).toMatch(/(^|\s)height:\s*\d+px/);
    expect(b).not.toMatch(/min-height|max-height/);
  });

  it("as colunas são metades exatas — o conteúdo não estica nenhuma", () => {
    // `1fr` é `minmax(auto, 1fr)`: o nome, que é nowrap, esticava a coluna e o
    // cartão saía pela borda da tela.
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
  // Medido no preview antes: data, dica, ⋯ e ícones do rodapé do cartão entre
  // 1,7:1 e 2,6:1; o ícone do projeto na própria plaquinha a 1,34:1; o
  // cartão sobre a folha a 1,2:1 — e, no tema claro, mais ESCURO que ela.

  it("informação em cima de um cartão é muted, nunca faint", () => {
    // `--text-faint` só é legível no fundo da página (a regra dos degraus, lá
    // nos tokens). Em cima de uma superfície levantada ele fica abaixo de 3:1.
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
    // É o que deixa isto funcionar em qualquer tema do Obsidian: tudo é
    // mistura das variáveis dele. O bloco do escuro é achado pela declaração
    // (há mais de uma regra `.corvus-root .corvus-sheet`).
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
    // Mais claro no escuro, mais escuro no claro — sozinho, sem regra por tema.
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
