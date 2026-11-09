import { describe, it, expect } from "vitest";
import { drawerInnerOf, SHEET_OPEN_CLASS, syncSheetStrip } from "../src/ui/sheetStrip";

// A faixa da barra de gestos sai de uma classe RECALCULADA do DOM (ver
// src/ui/sheetStrip.ts). O que importa provar: a classe segue o que está no
// DOM, não quem chamou por último — várias folhas, desmontagem, ordem
// qualquer.

/** Uma `.workspace-drawer-inner` de mentira: só o que o sheetStrip usa. */
function fakeInner(abertas: () => number) {
  const classes = new Set<string>();
  return {
    classes,
    classList: {
      toggle: (c: string, on: boolean) => {
        if (on) classes.add(c);
        else classes.delete(c);
        return on;
      },
    },
    querySelector: (sel: string) => {
      expect(sel).toBe(".corvus-root .corvus-sheet-layer.is-open");
      return abertas() > 0 ? {} : null;
    },
  };
}

describe("syncSheetStrip", () => {
  it("liga com uma folha aberta e desliga sem nenhuma", () => {
    let n = 1;
    const inner = fakeInner(() => n);
    syncSheetStrip(inner as never);
    expect(inner.classes.has(SHEET_OPEN_CLASS)).toBe(true);
    n = 0;
    syncSheetStrip(inner as never);
    expect(inner.classes.has(SHEET_OPEN_CLASS)).toBe(false);
  });

  it("fechar UMA de duas folhas abertas mantém a faixa", () => {
    // O motivo de recalcular em vez de ligar/desligar: a folha que fecha não
    // sabe se há outra aberta.
    let n = 2;
    const inner = fakeInner(() => n);
    syncSheetStrip(inner as never);
    n = 1;
    syncSheetStrip(inner as never);
    expect(inner.classes.has(SHEET_OPEN_CLASS)).toBe(true);
  });

  it("fora da gaveta do celular não faz nada", () => {
    expect(() => syncSheetStrip(null)).not.toThrow();
    expect(() => syncSheetStrip(undefined)).not.toThrow();
    expect(drawerInnerOf(null)).toBeNull();
    const semGaveta = { closest: () => null };
    expect(drawerInnerOf(semGaveta as never)).toBeNull();
  });

  it("acha a caixa da gaveta pelo ancestral", () => {
    const inner = {};
    const el = {
      closest: (sel: string) => (sel === ".workspace-drawer-inner" ? inner : null),
    };
    expect(drawerInnerOf(el as never)).toBe(inner);
  });
});
