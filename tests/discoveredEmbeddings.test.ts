import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { somarDescobertos } from "../src/rag/discovered";

describe("embeddings descobertos", () => {
  it("o Fetch de modelos traz os de embedding junto", () => {
    const tab = readFileSync(resolve(__dirname, "../src/ui/SettingsTab.ts"), "utf8");
    expect(tab).toMatch(/this\.plugin\.scanEmbeddings\(providerId\)/);
  });

  it("somar descobertos não repete e mantém os antigos na frente", () => {
    expect(somarDescobertos(["a", "b"], ["b", "c"])).toEqual(["a", "b", "c"]);
    expect(somarDescobertos(undefined, ["x"])).toEqual(["x"]);
  });
});
