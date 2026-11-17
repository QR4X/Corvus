import { describe, it, expect } from "vitest";
import { asText } from "../src/core/text";

describe("asText", () => {
  it("returns strings unchanged, including empty ones", () => {
    expect(asText("hi")).toBe("hi");
    expect(asText("")).toBe("");
  });

  it("does not replace an empty string with the fallback", () => {
    expect(asText("", "fallback")).toBe("");
  });

  it("converts numbers, booleans and bigints", () => {
    expect(asText(0)).toBe("0");
    expect(asText(-1.5)).toBe("-1.5");
    expect(asText(false)).toBe("false");
    expect(asText(10n)).toBe("10");
  });

  it("falls back for non-finite numbers", () => {
    expect(asText(NaN)).toBe("");
    expect(asText(Infinity, "—")).toBe("—");
  });

  it("falls back for null and undefined", () => {
    expect(asText(null)).toBe("");
    expect(asText(undefined)).toBe("");
    expect(asText(null, "Untitled")).toBe("Untitled");
  });

  it("never renders objects or arrays as [object Object]", () => {
    expect(asText({ a: 1 })).toBe("");
    expect(asText([1, 2])).toBe("");
    expect(asText({}, "default")).toBe("default");
  });

  it("falls back for functions and symbols", () => {
    expect(asText(() => "x")).toBe("");
    expect(asText(Symbol("s"))).toBe("");
  });
});
