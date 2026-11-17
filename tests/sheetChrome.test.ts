import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SHEET_OPEN_CLASS } from "../src/ui/sheetStrip";

const CSS = readFileSync(resolve(__dirname, "../styles/main.css"), "utf8");
const CSS_NO_COMMENTS = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

function block(needle: string): string {
  const i = CSS_NO_COMMENTS.indexOf(needle);
  expect(i, `selector missing from CSS: ${needle}`).toBeGreaterThan(-1);
  const open = CSS_NO_COMMENTS.indexOf("{", i);
  const close = CSS_NO_COMMENTS.indexOf("}", open);
  return CSS_NO_COMMENTS.slice(open + 1, close);
}

describe("the gesture bar strip matches the sheet color", () => {
  const strip = () => block(`.workspace-drawer-inner.${SHEET_OPEN_CLASS} {`);

  it("uses the same color token for the sheet and the strip", () => {
    expect(block(".corvus-root .corvus-sheet {")).toContain(
      "background-color: var(--corvus-sheet-bg)"
    );
    expect(strip()).toContain("var(--corvus-sheet-bg)");
    expect(CSS).toMatch(/--corvus-sheet-bg:\s*color-mix\(/);
  });

  it("paints only the bottom strip and leaves the top to the status bar", () => {
    expect(strip()).not.toMatch(/background-color\s*:/);
    expect(strip()).toMatch(/background-image:\s*linear-gradient\(\s*to top/);
    expect(strip()).toContain(
      "max(var(--safe-area-inset-bottom), var(--size-4-4))"
    );
  });

  it("styles the strip only for the class the sheet toggles, in fullscreen", () => {
    expect(CSS_NO_COMMENTS).toContain(
      `body.is-mobile .workspace-drawer.corvus-fullscreen .workspace-drawer-inner.${SHEET_OPEN_CLASS} {`
    );
  });
});

describe("the CSS passes the Obsidian review linter", () => {
  it("uses no :has(", () => {
    expect(CSS_NO_COMMENTS).not.toContain(":has(");
  });

  it("uses no !important", () => {
    expect(CSS_NO_COMMENTS).not.toContain("!important");
  });
});

describe("the fit size shrinks the sheet when the keyboard closes", () => {
  it("sizes to content with the same cap as the full size", () => {
    const b = block(".corvus-root .corvus-sheet.is-fit {");
    expect(b).toContain("min-height: 0");
    expect(b).toContain("max-height: 94%");
    expect(block(".corvus-root .corvus-sheet.is-full {")).toContain("max-height: 94%");
  });
});

describe("skill cards all have the same size", () => {
  it("gives the prompt preview a fixed height instead of a range", () => {
    const b = block(".corvus-root .corvus-tile-paper {");
    expect(b).toMatch(/(^|\s)height:\s*\d+px/);
    expect(b).not.toMatch(/min-height|max-height/);
  });

  it("uses exact half columns that content cannot stretch", () => {
    expect(block(".corvus-root .corvus-tiles {")).toContain(
      "grid-template-columns: repeat(2, minmax(0, 1fr))"
    );
    expect(block(".corvus-root .corvus-tile-wrap {")).toContain("min-width: 0");
  });

  it("fills the whole cell and truncates the name instead of wrapping", () => {
    expect(block(".corvus-root button.corvus-tile {")).toContain("height: 100%");
    const name = block(".corvus-root .corvus-tile-head .corvus-tile-name {");
    expect(name).toContain("white-space: nowrap");
    expect(name).toContain("text-overflow: ellipsis");
  });
});

describe("contrast inside sheets", () => {
  it("uses muted, never faint, text for information on a card", () => {
    for (const sel of [
      ".corvus-root .corvus-proj-card-when {",
      ".corvus-root .corvus-proj-card-about.is-empty {",
      ".corvus-root .corvus-proj-card-stat .corvus-icon {",
      ".corvus-root button.corvus-proj-card-more {",
      ".corvus-root button.corvus-tile-more {",
      ".corvus-root .corvus-field-hint {",
    ]) {
      const b = block(sel);
      expect(b, sel).toContain("var(--text-muted)");
      expect(b, sel).not.toContain("var(--text-faint)");
    }
  });

  it("uses the theme paper for cards in light theme so they are lighter than the sheet", () => {
    const light = block("body.theme-light .corvus-root .corvus-sheet {");
    expect(light).toContain("--corvus-s1: var(--background-primary)");
  });

  it("derives sheet surface steps only from the theme with no hardcoded colors", () => {
    const i = CSS_NO_COMMENTS.indexOf(
      "--corvus-s1: color-mix(in srgb, var(--text-normal) 12%"
    );
    expect(i, "the dark surface step inside the sheet is missing").toBeGreaterThan(-1);
    const dark = CSS_NO_COMMENTS.slice(
      CSS_NO_COMMENTS.lastIndexOf("{", i),
      CSS_NO_COMMENTS.indexOf("}", i)
    );
    const light = block("body.theme-light .corvus-root .corvus-sheet {");
    for (const b of [dark, light]) {
      expect(b).toContain("--corvus-s1:");
      expect(b).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    }
  });

  it("uses the card surface for fields, groups, preview and search", () => {
    const b = block(".corvus-root .corvus-sheet .corvus-sheet-group,");
    expect(b).toContain("background-color: var(--corvus-s1)");
    for (const sel of [
      ".corvus-root .corvus-sheet .corvus-form-preview",
      ".corvus-root .corvus-sheet .corvus-field-input",
      ".corvus-root .corvus-sheet .corvus-textarea",
      ".corvus-root .corvus-sheet .corvus-search-field",
    ])
      expect(CSS).toContain(sel);
  });

  it("mixes the project icon with the theme text color so it reads on the badge", () => {
    expect(block(".corvus-root .corvus-thing-mark svg {")).toMatch(
      /color-mix\(in srgb, currentColor \d+%, var\(--text-normal\)\)/
    );
  });

  it("derives the scrim from the theme cover color", () => {
    const b = block(".corvus-root .corvus-scrim {");
    expect(b).toContain("var(--background-modifier-cover");
    expect(b).toContain("color-mix(");
  });
});
