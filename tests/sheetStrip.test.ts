import { describe, it, expect } from "vitest";
import { drawerInnerOf, SHEET_OPEN_CLASS, syncSheetStrip } from "../src/ui/sheetStrip";

function fakeInner(openCount: () => number) {
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
      return openCount() > 0 ? {} : null;
    },
  };
}

describe("syncSheetStrip", () => {
  it("turns on with an open sheet and off with none", () => {
    let n = 1;
    const inner = fakeInner(() => n);
    syncSheetStrip(inner as never);
    expect(inner.classes.has(SHEET_OPEN_CLASS)).toBe(true);
    n = 0;
    syncSheetStrip(inner as never);
    expect(inner.classes.has(SHEET_OPEN_CLASS)).toBe(false);
  });

  it("keeps the strip when one of two open sheets closes", () => {
    let n = 2;
    const inner = fakeInner(() => n);
    syncSheetStrip(inner as never);
    n = 1;
    syncSheetStrip(inner as never);
    expect(inner.classes.has(SHEET_OPEN_CLASS)).toBe(true);
  });

  it("does nothing outside the mobile drawer", () => {
    expect(() => syncSheetStrip(null)).not.toThrow();
    expect(() => syncSheetStrip(undefined)).not.toThrow();
    expect(drawerInnerOf(null)).toBeNull();
    const noDrawer = { closest: () => null };
    expect(drawerInnerOf(noDrawer as never)).toBeNull();
  });

  it("finds the drawer box through an ancestor", () => {
    const inner = {};
    const el = {
      closest: (sel: string) => (sel === ".workspace-drawer-inner" ? inner : null),
    };
    expect(drawerInnerOf(el as never)).toBe(inner);
  });
});
