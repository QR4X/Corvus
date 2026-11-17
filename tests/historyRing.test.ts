import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CSS = readFileSync(resolve(__dirname, "../styles/main.css"), "utf8");
const UNCOMMENTED = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

function blocks(selector: string): string[] {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const re = new RegExp(`(?:^|[}\\s])${escaped}\\s*\\{([^}]*)\\}`, "g");
  return [...UNCOMMENTED.matchAll(re)].map((m) => m[1]);
}

describe("the card mark ring", () => {
  for (const state of ["is-current", "is-waiting"]) {
    it(`${state}: drawn inset at 1px`, () => {
      const [body] = blocks(`.corvus-root .corvus-history-row.is-flat.${state} .corvus-card-mark`);
      expect(body).toMatch(/box-shadow:\s*inset 0 0 0 1px /);
    });
  }
});

describe("the home list scrolls with breathing room", () => {
  it("uses equal padding and negative margin so content stays in place", () => {
    const [body] = blocks(".corvus-root .corvus-dash .corvus-history");
    expect(body).toMatch(/overflow-y:\s*auto/);
    const pad = body.match(/(?:^|;|\s)padding:\s*([^;]+);/)?.[1].trim();
    const margin = body.match(/(?:^|;|\s)margin:\s*([^;]+);/)?.[1].trim();
    expect(pad, "the list lost its padding").toBeTruthy();
    expect(margin).toBe(`calc(-1 * ${pad})`);
  });

  it("leaves enough room for the halo of a responding chat", () => {
    const [body] = blocks(".corvus-root .corvus-dash .corvus-history");
    expect(body).toMatch(/padding:\s*var\(--corvus-2\)/);
    expect(UNCOMMENTED).toMatch(/--corvus-2:\s*8px/);
    expect(UNCOMMENTED).toMatch(/box-shadow:\s*0 0 0 3px\s/);
  });
});
