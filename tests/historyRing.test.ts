import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// O anel da conversa aberta e a folga da lista que rola na home. Quem rola
// recorta o que passa da própria caixa; a linha chapada encosta nela.

const CSS = readFileSync(resolve(__dirname, "../styles/main.css"), "utf8");
const SEM_COMENTARIO = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

/** Os corpos (sem comentários) de TODAS as regras cujo seletor é exatamente `seletor`. */
function blocos(seletor: string): string[] {
  const escapado = seletor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const re = new RegExp(`(?:^|[}\\s])${escapado}\\s*\\{([^}]*)\\}`, "g");
  return [...SEM_COMENTARIO.matchAll(re)].map((m) => m[1]);
}

describe("o anel do brasão", () => {
  // Até a 0.9.19 era `0 0 0 2px` por fora: o lado esquerdo sumia, cortado
  // pela lista da home.
  for (const estado of ["is-current", "is-waiting"]) {
    it(`${estado}: desenhado por dentro, 1px`, () => {
      const [corpo] = blocos(`.corvus-root .corvus-history-row.is-flat.${estado} .corvus-card-mark`);
      expect(corpo).toMatch(/box-shadow:\s*inset 0 0 0 1px /);
    });
  }
});

describe("a lista da home rola com folga", () => {
  it("padding e margem negativa do MESMO tamanho — o conteúdo não sai do lugar", () => {
    const [corpo] = blocos(".corvus-root .corvus-dash .corvus-history");
    expect(corpo).toMatch(/overflow-y:\s*auto/);
    const pad = corpo.match(/(?:^|;|\s)padding:\s*([^;]+);/)?.[1].trim();
    const margem = corpo.match(/(?:^|;|\s)margin:\s*([^;]+);/)?.[1].trim();
    expect(pad, "a lista perdeu a folga").toBeTruthy();
    expect(margem).toBe(`calc(-1 * ${pad})`);
  });

  it("a folga cobre o halo de quem está respondendo", () => {
    // O halo abre 3px (`corvus-respira`); a folga é um token de 8px.
    const [corpo] = blocos(".corvus-root .corvus-dash .corvus-history");
    expect(corpo).toMatch(/padding:\s*var\(--corvus-2\)/);
    expect(SEM_COMENTARIO).toMatch(/--corvus-2:\s*8px/);
    expect(SEM_COMENTARIO).toMatch(/box-shadow:\s*0 0 0 3px\s/);
  });
});
