import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mergeDiscovered } from "../src/rag/discovered";

describe("embeddings descobertos", () => {
  it("o Fetch de modelos traz os de embedding junto", () => {
    const tab = readFileSync(resolve(__dirname, "../src/ui/SettingsTab.ts"), "utf8");
    expect(tab).toMatch(/this\.plugin\.models\.scanEmbeddings\(providerId\)/);
  });

  it("somar descobertos não repete e mantém os antigos na frente", () => {
    expect(mergeDiscovered(["a", "b"], ["b", "c"])).toEqual(["a", "b", "c"]);
    expect(mergeDiscovered(undefined, ["x"])).toEqual(["x"]);
  });
});
