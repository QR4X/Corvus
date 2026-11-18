import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CSS = readFileSync(resolve(__dirname, "../styles/main.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("message text is selectable", () => {
  it("enables selection and the iOS callout on message text and markdown", () => {
    const block = CSS.slice(CSS.indexOf(".corvus-root .corvus-msg-text,"));
    expect(block).toContain("-webkit-user-select: text");
    expect(block).toContain("user-select: text");
    expect(block).toContain("-webkit-touch-callout: default");
  });

  it("keeps controls inside messages unselectable", () => {
    const block = CSS.slice(
      CSS.indexOf(".corvus-root .corvus-msg-text button,")
    );
    expect(block).toContain("-webkit-user-select: none");
    expect(block).toContain("user-select: none");
    expect(block).toContain("-webkit-touch-callout: none");
  });
});
