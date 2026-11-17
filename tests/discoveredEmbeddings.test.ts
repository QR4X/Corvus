import { describe, it, expect } from "vitest";
import { mergeDiscovered } from "../src/rag/discovered";

describe("discovered embedding models", () => {
  it("merges without duplicates and keeps existing models first", () => {
    expect(mergeDiscovered(["a", "b"], ["b", "c"])).toEqual(["a", "b", "c"]);
    expect(mergeDiscovered(undefined, ["x"])).toEqual(["x"]);
  });
});
