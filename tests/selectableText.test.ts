import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CSS = readFileSync(resolve(__dirname, "../styles/main.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

function bloco(seletor: string): string {
  const i = CSS.lastIndexOf(seletor);
  expect(i).toBeGreaterThan(-1);
  const abre = CSS.indexOf("{", i);
  return CSS.slice(abre + 1, CSS.indexOf("}", abre));
}

describe("message text is selectable", () => {
  it("enables selection and the iOS callout on message text and children", () => {
    const b = bloco(".corvus-root .corvus-msg-text *");
    expect(b).toContain("-webkit-user-select: text");
    expect(b).toContain("user-select: text");
    expect(b).toContain("-webkit-touch-callout: default");
  });

  it("enables selection on rendered assistant markdown", () => {
    const b = bloco(".corvus-root .corvus-markdown *");
    expect(b).toContain("-webkit-user-select: text");
    expect(b).toContain("user-select: text");
  });

  it("keeps controls inside messages unselectable", () => {
    const b = bloco(".corvus-root .corvus-markdown button *");
    expect(b).toContain("-webkit-user-select: none");
    expect(b).toContain("user-select: none");
  });
});
