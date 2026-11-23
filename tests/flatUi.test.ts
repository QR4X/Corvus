import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CSS = readFileSync(resolve(__dirname, "../styles/main.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const CASTS = CSS.match(/box-shadow:\s*[^;]+/g) ?? [];

function flat(decl: string): boolean {
  const v = decl.replace(/^box-shadow:\s*/, "").replace(/\s+/g, " ").trim();
  if (v === "none" || v === "transparent") return true;
  if (v.startsWith("inset ")) return true;
  if (v.startsWith("0 0 0")) return true;
  return /^var\(--corvus-e[0-9]\)$/.test(v);
}

describe("flat ui", () => {
  it("uses no drop shadows: every box-shadow is flat", () => {
    const offenders = CASTS.filter((d) => !flat(d)).map((d) => d.replace(/\s+/g, " ").trim());
    expect(offenders).toEqual([]);
  });

  it("keeps the elevation tokens flat in both themes", () => {
    const e1 = CSS.match(/--corvus-e1:\s*[^;]+/g) ?? [];
    const e2 = CSS.match(/--corvus-e2:\s*[^;]+/g) ?? [];
    expect(e1.length).toBeGreaterThan(0);
    expect(e2.length).toBeGreaterThan(0);
    for (const v of [...e1, ...e2]) expect(v).toMatch(/:\s*none;?$/);
  });
});
