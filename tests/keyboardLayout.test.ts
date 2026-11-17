import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CSS = readFileSync(resolve(__dirname, "../styles/main.css"), "utf8").replace(/\r\n/g, "\n");

function block(needle: string): string {
  const i = CSS.indexOf(needle);
  expect(i, `selector missing from CSS: ${needle}`).toBeGreaterThan(-1);
  const open = CSS.indexOf("{", i);
  const close = CSS.indexOf("}", open);
  return CSS.slice(open + 1, close);
}

const NO_COMMENTS = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

function keyboardMath(): string[] {
  return NO_COMMENTS.split(";")
    .map((d) => d.replace(/\s+/g, " ").trim())
    .filter((d) => d.includes("var(--keyboard-height"))
    .map((d) => d.slice(d.lastIndexOf("{") + 1).trim());
}

describe("the single keyboard calculation", () => {
  it("the drawer subtracts the keyboard from its own height", () => {
    const b = block("body.is-mobile:not(#corvus-specificity) .workspace-drawer.corvus-keyboard-open {");
    expect(b).toContain("calc(100vh - var(--keyboard-height, 0px))");
    expect(b).not.toContain("100dvh");

    const ruleIndex = NO_COMMENTS.indexOf(
      "body.is-mobile:not(#corvus-specificity) .workspace-drawer.corvus-keyboard-open {"
    );
    const supportsIndex = NO_COMMENTS.indexOf(
      "@supports (height: 100dvh)",
      ruleIndex
    );
    expect(supportsIndex, "the dvh @supports block is missing").toBeGreaterThan(ruleIndex);
    const inside = NO_COMMENTS.slice(supportsIndex, supportsIndex + 400);
    expect(inside).toContain(
      "body.is-mobile:not(#corvus-specificity) .workspace-drawer.corvus-keyboard-open"
    );
    expect(inside).toContain("calc(100dvh - var(--keyboard-height, 0px))");
  });

  it("the fullscreen drawer subtracts it with the same pair", () => {
    const b = block("body.is-mobile:not(#corvus-specificity) .workspace-drawer.corvus-fullscreen {");
    expect(b).toContain("calc(100vh - var(--keyboard-height, 0px))");
    const i = NO_COMMENTS.indexOf(
      "body.is-mobile:not(#corvus-specificity) .workspace-drawer.corvus-fullscreen {"
    );
    const inside = NO_COMMENTS.slice(
      NO_COMMENTS.indexOf("@supports (height: 100dvh)", i),
      NO_COMMENTS.indexOf("@supports (height: 100dvh)", i) + 400
    );
    expect(inside).toContain("calc(100dvh - var(--keyboard-height, 0px))");
  });

  it("the fullscreen width beats the tablet inline width without !important", () => {
    const b = block("body.is-mobile .workspace-drawer.corvus-fullscreen {");
    const clean = b.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(clean).toMatch(/(?:^|[\s;])width:\s*100vw;/);
    expect(clean).toMatch(/min-width:\s*100vw;/);
    expect(clean).not.toContain("!important");
  });

  it("the four drawer heights carry the specificity boost", () => {
    const heights = NO_COMMENTS.split("}").filter((r) =>
      /(?:^|[\s;{])height:\s*calc\(100d?vh - var\(--keyboard-height/.test(r)
    );
    expect(heights).toHaveLength(4);
    for (const r of heights) expect(r).toContain(":not(#corvus-specificity)");
  });

  it("sheet layers fit the composer box without their own calculation", () => {
    const b = block(
      ".workspace-drawer.corvus-keyboard-open .corvus-root .corvus-sheet-layer"
    );
    expect(b).toContain("position: absolute");
    expect(b).not.toContain("--keyboard-height");
    expect(b).toContain("height: auto");
    expect(b).toContain("display: flex");
    expect(b).toContain("flex-direction: column");
  });

  it("the sheet layer follows the same signal that shrinks the drawer, not only the body one", () => {
    const idx = NO_COMMENTS.indexOf(".workspace-drawer.corvus-keyboard-open .corvus-root .corvus-sheet-layer");
    const rule = NO_COMMENTS.slice(idx, NO_COMMENTS.indexOf("{", idx));
    expect(rule).toContain(".workspace-drawer.corvus-keyboard-open .corvus-root .corvus-sheet-layer");
    expect(rule).toContain("body.is-mobile.corvus-keyboard-open .corvus-root .corvus-sheet-layer");
  });

  it("the sheet is a flex item without computed height or height transition", () => {
    const b = block(
      ".workspace-drawer.corvus-keyboard-open .corvus-root .corvus-sheet-layer .corvus-sheet"
    );
    expect(b).toContain("flex: 1 1 auto");
    expect(b).toContain("min-height: 0");
    expect(b).toContain("max-height: none");
    expect(b).not.toMatch(/\d+%/);
    expect(b).toMatch(/transition:\s*transform[^;]*;/);
    expect(b).not.toMatch(/transition:[^;]*(min-height|max-height)/);
  });

  it("only this short list of declarations subtracts the keyboard", () => {
    const allowed = new Set([
      "height: calc(100vh - var(--keyboard-height, 0px))",
      "height: calc(100dvh - var(--keyboard-height, 0px))",
      "max-height: calc(100vh - var(--keyboard-height, 50vh) - 32px)",
      "margin-bottom: calc( var(--keyboard-height, 0px) + max(var(--safe-area-inset-bottom, 0px), 12px) )",
    ]);
    const extra = keyboardMath().filter((d) => !allowed.has(d));
    expect(extra, "keyboard calculation without a known owner").toEqual([]);
  });

  it("nothing adds the keyboard as bottom padding (regression from 0.1.246)", () => {
    const paddings = keyboardMath().filter((l) => /^padding-bottom:/.test(l));
    expect(paddings).toEqual([]);
  });
});

describe("the assistant panel follows the composer", () => {
  it("is absolute inside the root and never measures the keyboard", () => {
    const b = block(".corvus-root .corvus-assist-layer {");
    expect(b).toContain("position: absolute");
    expect(b).not.toContain("--keyboard-height");
  });
});

describe("the bottom padding below the last button matches what works on device", () => {
  it("the sheet footer uses exactly the assistant panel padding", () => {
    const value = (b: string) =>
      /padding-bottom:\s*([^;]+);/.exec(
        b.replace(/\/\*[\s\S]*?\*\//g, "")
      )?.[1].trim();
    const sheet = value(
      block("body.corvus-keyboard-open .corvus-root .corvus-sheet-actions,")
    );
    const panel = value(block(".corvus-root .corvus-assist-layer {"));
    expect(sheet).toBe("15px");
    expect(sheet).toBe(panel);
  });

  it("the composer keeps its own padding", () => {
    const c = block("body.is-mobile .corvus-keyboard-open .corvus-composer,");
    expect(c).toContain("padding-bottom: var(--corvus-2)");
  });

  it("the assistant panel uses the composer 15px padding", () => {
    const b = block(".corvus-root .corvus-assist-layer {");
    expect(b).toContain("padding-bottom: 15px");
    expect(CSS).not.toContain("--corvus-ime-slack:");
  });

  it("the assistant card drops via margin, not justify-content", () => {
    const layer = block(".corvus-root .corvus-assist-layer {").replace(
      /\/\*[\s\S]*?\*\//g,
      ""
    );
    expect(layer).not.toMatch(/justify-content:\s*flex-end/);
    const card = block(".corvus-root .corvus-assist-layer .corvus-assist {");
    expect(card).toContain("margin-top: auto");
  });
});

describe("with the keyboard open, the sheet button lands like the assistant card", () => {
  const clean = (b: string) => b.replace(/\/\*[\s\S]*?\*\//g, "");
  const floating = () =>
    clean(block(".workspace-drawer.corvus-keyboard-open .corvus-root .corvus-float-foot,"));
  const panel = () => clean(block(".corvus-root .corvus-assist-layer {"));

  it("uses the same box and column as the panel", () => {
    for (const d of [
      "position: absolute",
      "inset: 0",
      "display: flex",
      "flex-direction: column",
    ]) {
      expect(floating(), d).toContain(d);
      expect(panel(), d).toContain(d);
    }
  });

  it("uses the same bottom padding as the panel", () => {
    const pb = (b: string) => /padding-bottom:\s*([^;]+);/.exec(b)?.[1].trim();
    expect(pb(floating())).toBe(pb(panel()));
  });

  it("drops via auto margin like the panel card", () => {
    expect(clean(block(".corvus-root .corvus-float-foot-card {"))).toContain(
      "margin-top: auto"
    );
  });

  it("does not swallow taps on the sheet below", () => {
    expect(floating()).toContain("pointer-events: none");
    expect(clean(block(".corvus-root .corvus-float-foot-card {"))).toContain(
      "pointer-events: auto"
    );
  });

  it("sits below the assistant panel and above the sheet", () => {
    const z = (b: string) => Number(/z-index:\s*(\d+)/.exec(b)?.[1]);
    expect(z(floating())).toBeGreaterThan(1000);
    expect(z(floating())).toBeLessThan(z(panel()));
  });

  it("with the keyboard closed it is hidden and the in-sheet footer returns", () => {
    expect(clean(block(".corvus-root .corvus-float-foot {"))).toContain("display: none");
    const inside = clean(
      block(".workspace-drawer.corvus-keyboard-open .corvus-root .corvus-sheet-actions,\nbody.is-mobile.corvus-keyboard-open .corvus-root .corvus-sheet-actions {")
    );
    expect(inside).toContain("visibility: hidden");
  });
});
