import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CSS = readFileSync(resolve(__dirname, "../styles/main.css"), "utf8");
const NO_COMMENTS = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

function blocks(selector: string): string[] {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const re = new RegExp(`(?:^|[}\\s])${escaped}\\s*\\{([^}]*)\\}`, "g");
  return [...NO_COMMENTS.matchAll(re)].map((m) => m[1]);
}

describe("the composer model picker has contrast", () => {
  it("`.corvus-pill` and `.corvus-pills` each have a single rule", () => {
    expect(blocks(".corvus-root .corvus-pill")).toHaveLength(1);
    expect(blocks(".corvus-root .corvus-pills")).toHaveLength(1);
  });

  it("the model pill uses the normal text color", () => {
    expect(blocks(".corvus-root .corvus-pill")[0]).toContain("var(--text-normal)");
  });
});

describe("the composer shadow follows the rounded border", () => {
  const open = () =>
    blocks(
      '.corvus-root .corvus-swap:not([data-mode="voice"]) > .corvus-swap-row:first-child, ' +
        '.corvus-root .corvus-swap[data-mode="voice"] > .corvus-swap-row:last-child',
    );

  it("the open row clips with room for the shadow", () => {
    const body = open()[0] ?? "";
    expect(body).toMatch(/overflow:\s*clip/);
    expect(body).toMatch(/overflow-clip-margin:\s*\d+px/);
  });

  it("the closed row still clips flush", () => {
    expect(blocks(".corvus-root .corvus-swap-row")[0]).toMatch(/overflow:\s*hidden/);
  });
});

describe("the composer card style belongs only to the composer", () => {
  it("`.corvus-root .corvus-input` has a single base rule, the card one", () => {
    const rules = blocks(".corvus-root .corvus-input");
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatch(/padding:\s*14px 14px 12px/);
    expect(rules[0]).toContain("var(--corvus-r-lg)");
  });

  it("no rule groups the card with a form field", () => {
    expect(NO_COMMENTS).not.toMatch(/\.corvus-input,\s*\.corvus-root \.corvus-textarea/);
  });
});

describe("the card shadow fades before the panel edge", () => {
  function phi(x: number): number {
    const z = Math.abs(x) / Math.SQRT2;
    const t = 1 / (1 + 0.3275911 * z);
    const erf =
      1 -
      t *
        (0.254829592 +
          t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) *
        Math.exp(-z * z);
    return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
  }

  it("less than 1% black remains 15px below the card", () => {
    const composer = blocks(".corvus-root .corvus-composer")[0];

    const bottom = Number(composer.match(/padding:[^;]*\s(\d+)px;/)?.[1]);
    expect(bottom).toBe(15);

    const shadow = blocks(".corvus-root .corvus-input")[0].match(/box-shadow:([^;]+);/)?.[1] ?? "";
    const layers = shadow.split(/,(?![^(]*\))/).map((c) => c.trim()).filter(Boolean);
    expect(layers.length).toBeGreaterThan(0);
    let rest = 0;
    for (const c of layers) {
      const [, dy, blur, spread = "0"] = c.match(/^-?[\d.]+(?:px)?\s+(-?[\d.]+)(?:px)?\s+([\d.]+)(?:px)?(?:\s+(-?[\d.]+)px)?/) ?? [];
      const alpha = Number(c.match(/rgba\([^)]*,\s*([\d.]+)\)/)?.[1] ?? 0);
      const sigma = Number(blur) / 2;
      const distance = bottom - Number(dy) - Number(spread);
      rest += alpha * (sigma > 0 ? 1 - phi(distance / sigma) : distance > 0 ? 0 : 1);
    }
    expect(rest).toBeLessThan(0.01);
  });
});
