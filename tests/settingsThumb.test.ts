import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { putThumb, seedThumb, thumbOf } from "../src/ui/settings/thumb";

// O thumb dos segmented das settings. O filtro do catálogo é remontado a
// cada toque, e o thumb da linha nova nascia no padrão do CSS (o primeiro
// item, largura zero): "vai pro primeiro e depois pro que eu escolhi".

/** Uma linha falsa que anota a ORDEM das coisas: a transição precisa estar
 *  desligada quando a posição é escrita e lida, e só depois voltar. */
function linha(ativo: { left: number; width: number } | null, vars: Record<string, string> = {}) {
  const log: string[] = [];
  const estilo = new Map(Object.entries(vars));
  const classes = new Set<string>();
  const row = {
    style: {
      getPropertyValue: (k: string) => estilo.get(k) ?? "",
      setProperty: (k: string, v: string) => {
        estilo.set(k, v);
        log.push(`${k}=${v}${classes.has("is-placing") ? " (sem transição)" : ""}`);
      },
    },
    addClass: (c: string) => {
      classes.add(c);
      log.push(`+${c}`);
    },
    removeClass: (c: string) => {
      classes.delete(c);
      log.push(`-${c}`);
    },
    get offsetWidth() {
      log.push("mede");
      return 300;
    },
    querySelector: () =>
      ativo && { offsetLeft: ativo.left, offsetWidth: ativo.width },
  };
  return { row: row as unknown as HTMLElement, log, estilo };
}

describe("a primeira posição é instantânea", () => {
  it("linha nova: transição desligada, posição escrita, medida lida, transição de volta", () => {
    const { row, log } = linha({ left: 85, width: 77 });
    putThumb(row);
    expect(log).toEqual([
      "+is-placing",
      "--corvus-seg-x=85px (sem transição)",
      "--corvus-seg-w=77px (sem transição)",
      "mede",
      "-is-placing",
    ]);
  });

  it("linha que já tinha thumb: só escreve — e o CSS desliza", () => {
    const { row, log } = linha({ left: 85, width: 77 }, { "--corvus-seg-x": "161px", "--corvus-seg-w": "85px" });
    putThumb(row);
    expect(log).toEqual(["--corvus-seg-x=85px", "--corvus-seg-w=77px"]);
  });

  it("escondida (outra aba) mede zero e fica sem posição", () => {
    const { row, log, estilo } = linha({ left: 0, width: 0 });
    putThumb(row);
    expect(log).toEqual([]);
    expect(estilo.size).toBe(0);
  });

  it("sem item ativo, não faz nada", () => {
    const { row, log } = linha(null);
    putThumb(row);
    expect(log).toEqual([]);
  });
});

describe("a linha remontada nasce onde a velha estava", () => {
  it("o thumb da velha passa pra nova, e aí desliza até o novo ativo", () => {
    const velha = linha(null, { "--corvus-seg-x": "161px", "--corvus-seg-w": "85px" });
    const nova = linha({ left: 85, width: 77 });
    seedThumb(nova.row, thumbOf(velha.row));
    nova.log.length = 0;
    putThumb(nova.row);
    // Não é "primeira": não desliga a transição — sai de 161 e vai pra 85.
    expect(nova.log).toEqual(["--corvus-seg-x=85px", "--corvus-seg-w=77px"]);
  });

  it("sem thumb na velha (ou sem velha), a nova é primeira posição", () => {
    const nova = linha({ left: 3, width: 67 });
    seedThumb(nova.row, null);
    seedThumb(nova.row, { x: "", w: "" });
    expect(nova.estilo.size).toBe(0);
  });
});

describe("o CSS tem o desligador", () => {
  const CSS = readFileSync(resolve(__dirname, "../styles/main.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  it("`.corvus-seg.is-placing::before` sem transição", () => {
    expect(CSS).toMatch(/\.corvus-settings-root \.corvus-seg\.is-placing::before\s*\{\s*transition:\s*none;\s*\}/);
  });

  it("a barra de abas zera a margem da direita que o app.css dá ao 1º filho", () => {
    // `.setting-item > *:first-child { margin-inline-end: 16px }` — a barra
    // parava 16px antes do trilho de providers logo abaixo.
    const corpo = CSS.match(/\.corvus-settings-root \.corvus-settings-nav\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(corpo).toMatch(/margin:\s*0 0 var\(--size-4-3\);/);
  });
});
