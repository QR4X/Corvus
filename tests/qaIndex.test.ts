import { describe, it, expect } from "vitest";
import { QUANT_ITENS, pendenciaDoIndice } from "../src/ui/settings/searchIndex";
import { QUANT_PROFILES } from "../src/rag/quant";
import { applyControl, DEFAULT_INDEX_PATH, isControlKey } from "../src/ui/settings/values";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CorvusSettings } from "../src/main";

describe("o índice do Q&A: precisão e pedaços", () => {
  it("os quatro perfis do motor, nenhum a mais", () => {
    expect(QUANT_ITENS.map((i) => i.value).sort()).toEqual(Object.keys(QUANT_PROFILES).sort());
    for (const i of QUANT_ITENS) expect(i.icon, i.value).toBeTruthy();
  });

  it("as duas viraram controles que values.ts sabe gravar", () => {
    expect(isControlKey("ragQuantProfile")).toBe(true);
    expect(isControlKey("ragStreamShards")).toBe(true);
  });

  it("a linha do índice avisa o que só vale na próxima atualização", () => {
    const idx = { profile: "balanced", streamed: false };
    expect(pendenciaDoIndice(idx, { ragQuantProfile: "balanced", ragStreamShards: false })).toBeNull();
    expect(pendenciaDoIndice(idx, { ragQuantProfile: "light" })).toBe(
      "Update the index to apply the new precision."
    );
    expect(pendenciaDoIndice(idx, { ragStreamShards: true })).toBe(
      "Update the index to apply search in pieces."
    );
    expect(
      pendenciaDoIndice({ profile: "light", streamed: true }, { ragQuantProfile: "balanced" })
    ).toBe("Update the index to apply the new precision and a single index file.");

    expect(pendenciaDoIndice(null, { ragQuantProfile: "light" })).toBeNull();
  });

  it("trocar o modelo de embedding também só vale com o índice refeito", () => {
    const idx = { profile: "balanced", streamed: false, model: "text-embedding-3-small" };
    expect(pendenciaDoIndice(idx, { ragEmbeddingModel: "text-embedding-3-small" })).toBeNull();
    expect(pendenciaDoIndice(idx, { ragEmbeddingModel: "gemini-embedding-001" })).toBe(
      "Update the index to apply the new embedding model."
    );
  });
});

describe("a pasta do índice", () => {
  const s = () => ({ ragIndexPath: "x" }) as unknown as CorvusSettings;

  it("vira campo na aba Vault, junto das outras pastas", () => {
    expect(isControlKey("ragIndexPath")).toBe(true);
    const tree = readFileSync(resolve(__dirname, "../src/ui/settings/tree.ts"), "utf8");

    expect(tree).toMatch(/text\(\s*tr\("Index folder"\),[\s\S]{0,400}"ragIndexPath"/);
  });

  it("barra na ponta sai; vazio volta pro padrão", () => {
    const a = s();
    applyControl(a, "ragIndexPath", " /meu/indice/ ");
    expect(a.ragIndexPath).toBe("meu/indice");
    applyControl(a, "ragIndexPath", "   ");
    expect(a.ragIndexPath).toBe(DEFAULT_INDEX_PATH);
    expect(DEFAULT_INDEX_PATH).toBe(".corvus/index");
  });
});
