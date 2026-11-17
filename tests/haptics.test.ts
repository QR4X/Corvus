import { describe, it, expect } from "vitest";
import { isTap } from "../src/ui/haptics";

describe("isTap", () => {
  it("a still, quick finger is a tap", () => {
    expect(isTap(0, 0, 90)).toBe(true);
    expect(isTap(3, -4, 250)).toBe(true);
  });

  it("moving far enough makes it a scroll", () => {
    expect(isTap(0, 20, 200)).toBe(false);
    expect(isTap(-30, 2, 200)).toBe(false);
  });

  it("the slack applies to both axes, so a sideways scroll does not vibrate either", () => {
    expect(isTap(9, 0, 100)).toBe(false);
    expect(isTap(8, 8, 100)).toBe(true);
  });

  it("holding too long is not a tap", () => {
    expect(isTap(0, 0, 1200)).toBe(false);
  });
});
