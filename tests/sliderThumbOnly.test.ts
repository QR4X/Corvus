import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CSS = readFileSync(resolve(__dirname, "../styles/main.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("sliders move only by the thumb", () => {
  it("the track ignores touches while the thumb receives them", () => {
    expect(CSS).toMatch(/input\[type="range"\]\.corvus-slider\s*\{\s*pointer-events:\s*none;\s*\}/);
    expect(CSS).toMatch(
      /input\[type="range"\]\.corvus-slider::-webkit-slider-thumb\s*\{\s*pointer-events:\s*auto;\s*\}/
    );
  });
});
