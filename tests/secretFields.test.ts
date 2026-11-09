import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Toda chave de API das settings tem de ir pro keychain do sistema, nunca pro
// data.json — que mora dentro do vault, e o vault sincroniza (Sync, iCloud,
// git). O README promete isso. A chave da ElevenLabs ficou de fora da lista até
// a 0.9.13 e ia em texto puro; este teste existe pra isso não voltar.
//
// Lido do FONTE de propósito: SECRET_FIELDS é privado, e o que importa é a
// relação entre dois trechos do main.ts — os campos `*ApiKey` da interface e a
// lista — não o comportamento em runtime.
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
    // Guarda contra o teste passar por não achar nada.
    expect(camposDeChave()).toEqual(
      expect.arrayContaining(["openaiApiKey", "elevenApiKey"])
    );
  });

  it("todo campo *ApiKey está em SECRET_FIELDS", () => {
    const fora = camposDeChave().filter((c) => !listaDeSegredos().includes(c));
    expect(fora, "chave que iria em texto puro pro data.json").toEqual([]);
  });
});
