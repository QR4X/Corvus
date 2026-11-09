import { describe, it, expect } from "vitest";
import { drawerInnerOf, SHEET_OPEN_CLASS, syncSheetStrip } from "../src/ui/sheetStrip";

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
