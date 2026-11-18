import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CSS = readFileSync(resolve(__dirname, "../styles/main.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("mobile touch targets", () => {
  it("grows the tap target to 44px on mobile", () => {
    expect(CSS).toMatch(/body\.is-mobile\s+\.corvus-root\s*\{\s*--corvus-tap:\s*44px;\s*\}/);
  });
});
