import { describe, it, expect } from "vitest";
import { composerMaxHeight, readKeyboardHeight } from "../src/ui/composerSize";

describe("composerMaxHeight", () => {
  it("uses 40% of the screen without a keyboard", () => {
    expect(composerMaxHeight(812)).toBe(324);
  });

  it("uses 40% of the space left by the keyboard, not of the whole screen", () => {
    expect(composerMaxHeight(812, 320)).toBe(196);
    expect(composerMaxHeight(812, 320)).toBeLessThan(Math.round(812 * 0.4));
  });

  it("never exceeds 40% of the visible area", () => {
    const visible = 812 - 320;
    expect(composerMaxHeight(812, 320) / visible).toBeLessThanOrEqual(0.4);
  });

  it("lets a visualViewport smaller than the keyboard estimate win", () => {
    expect(composerMaxHeight(812, 0, 400)).toBe(160);
  });

  it("uses the smaller of the two signals", () => {
    expect(composerMaxHeight(812, 320, 600)).toBe(196);
    expect(composerMaxHeight(812, 100, 400)).toBe(160);
  });

  it("does not collapse the field when the keyboard is taller than the screen", () => {
    expect(composerMaxHeight(500, 900)).toBe(200);
  });

  it("falls back to the floor before the window has a layout", () => {
    expect(composerMaxHeight(0)).toBe(72);
    expect(composerMaxHeight(0, 0, 0)).toBe(72);
  });

  it("keeps the field usable on a tiny screen", () => {
    expect(composerMaxHeight(160, 0)).toBe(72);
  });
});

describe("readKeyboardHeight", () => {
  const docWithVar = (value: string): Document =>
    ({ documentElement: { style: { getPropertyValue: () => value } } }) as unknown as Document;

  it("reads the px value published by Obsidian", () => {
    expect(readKeyboardHeight(docWithVar("320px"))).toBe(320);
  });

  it("treats a closed keyboard (empty or 0) as zero", () => {
    expect(readKeyboardHeight(docWithVar(""))).toBe(0);
    expect(readKeyboardHeight(docWithVar("0px"))).toBe(0);
  });

  it("does not turn garbage into NaN", () => {
    expect(readKeyboardHeight(docWithVar("auto"))).toBe(0);
  });
});
