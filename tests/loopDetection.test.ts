import { describe, it, expect } from "vitest";
import {
  makeCallSignature,
  isLooping,
  trimSignatures,
} from "../src/agent/loopDetection";

describe("makeCallSignature", () => {
  it("same tool and args give the same signature", () => {
    const a = makeCallSignature("vault_read", { path: "a.md" });
    const b = makeCallSignature("vault_read", { path: "a.md" });
    expect(a).toBe(b);
  });
  it("different args give different signatures", () => {
    expect(makeCallSignature("vault_read", { path: "a.md" })).not.toBe(
      makeCallSignature("vault_read", { path: "b.md" })
    );
  });
});

describe("isLooping", () => {
  const sig = (n: string) => makeCallSignature("t", { x: n });
  it("the last N identical calls are a loop", () => {
    expect(isLooping([sig("a"), sig("a"), sig("a")], 3)).toBe(true);
  });
  it("a different last call breaks the loop", () => {
    expect(isLooping([sig("a"), sig("a"), sig("b")], 3)).toBe(false);
  });
  it("a history shorter than the window is not a loop yet", () => {
    expect(isLooping([sig("a"), sig("a")], 3)).toBe(false);
  });
  it("a zero window disables detection", () => {
    expect(isLooping([sig("a"), sig("a"), sig("a")], 0)).toBe(false);
  });
  it("only the last N calls matter, older different calls are ignored", () => {
    expect(isLooping([sig("x"), sig("y"), sig("a"), sig("a")], 2)).toBe(true);
  });
});

describe("trimSignatures", () => {
  it("keeps only the last N entries", () => {
    const arr = ["1", "2", "3", "4", "5"];
    trimSignatures(arr, 3);
    expect(arr).toEqual(["3", "4", "5"]);
  });
  it("leaves the list alone when it already fits", () => {
    const arr = ["1", "2"];
    trimSignatures(arr, 5);
    expect(arr).toEqual(["1", "2"]);
  });
});
