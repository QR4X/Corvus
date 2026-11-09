import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MAIN = readFileSync(resolve(__dirname, "../src/main.ts"), "utf8");

function camposDeChave(): string[] {
  const i = MAIN.indexOf("export interface CorvusSettings");
  const fim = MAIN.indexOf("\n}", i);
  const corpo = MAIN.slice(i, fim);
  return [...corpo.matchAll(/^\s*(\w+ApiKey)\??\s*:/gm)].map((m) => m[1]);
}

function listaDeSegredos(): string[] {
  const i = MAIN.indexOf("SECRET_FIELDS = [");
  const fim = MAIN.indexOf("] as const", i);
  return [...MAIN.slice(i, fim).matchAll(/"(\w+)"/g)].map((m) => m[1]);
}

describe("chaves de API vão pro keychain", () => {
  it("a interface tem as chaves que a gente conhece", () => {

    expect(camposDeChave()).toEqual(
      expect.arrayContaining(["openaiApiKey", "elevenApiKey"])
    );
  });

  it("todo campo *ApiKey está em SECRET_FIELDS", () => {
    const fora = camposDeChave().filter((c) => !listaDeSegredos().includes(c));
    expect(fora, "chave que iria em texto puro pro data.json").toEqual([]);
  });
});
