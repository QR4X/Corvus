import { describe, it, expect } from "vitest";
import {
  PASTE_LIMIT,
  pasteIsBig,
  humanSize,
  pastedNote,
} from "../src/ui/pasteAttachment";

describe("pasteIsBig", () => {
  it("keeps a normal paragraph as text", () => {
    expect(pasteIsBig("a".repeat(300))).toBe(false);
  });

  it("keeps text exactly at the limit as text", () => {
    expect(pasteIsBig("a".repeat(PASTE_LIMIT))).toBe(false);
  });

  it("turns text one character over the limit into an attachment", () => {
    expect(pasteIsBig("a".repeat(PASTE_LIMIT + 1))).toBe(true);
  });

  it("never turns an empty paste into an attachment", () => {
    expect(pasteIsBig("")).toBe(false);
  });
});

describe("humanSize", () => {
  it("shows the plain number below a thousand", () => {
    expect(humanSize(840)).toBe("840");
  });
  it("shows thousands with one decimal", () => {
    expect(humanSize(5200)).toBe("5.2k");
  });
  it("shows tens of thousands without decimals", () => {
    expect(humanSize(42000)).toBe("42k");
  });
});

describe("pastedNote", () => {
  it("keeps the full text and labels it with its size", () => {
    const text = "x".repeat(5200);
    const att = pastedNote(text);
    expect(att.type).toBe("note");
    expect(att.content).toBe(text);
    expect(att.path).toBe("Pasted text (5.2k)");
  });
});
