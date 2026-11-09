import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FABRICA_ATE_0923,
  OLLAMA_LOCAL,
  revisarOllamaPadrao,
  usaOllama,
} from "../src/core/ollamaDefault";
import { semCredencial } from "../src/core/helpers";
import { getTranslations } from "../src/i18n";
import { ollamaProvider } from "../src/providers/ollama";

const MODELO = { modelo: "llama3.2", ativos: ["llama3.2", "qwen2.5", "deepseek-r1", "mistral"] };

describe("de fábrica", () => {
  it("o endereço do Ollama nasce vazio", () => {
    const main = readFileSync(resolve(__dirname, "../src/main.ts"), "utf8");
    const padrao = main.slice(main.indexOf("const DEFAULT_SETTINGS"));
    expect(padrao).toMatch(/\bollamaEndpoint:\s*"",/);
  });

  it("modelo e lista do Ollama nascem vazios (saem do que ele tem instalado)", () => {
    const main = readFileSync(resolve(__dirname, "../src/main.ts"), "utf8");
    const padrao = main.slice(main.indexOf("const DEFAULT_SETTINGS"));
    expect(padrao).toMatch(/\bollamaModel:\s*"",/);
    expect(padrao).toMatch(/\bollama:\s*\[\],/);
  });

  it("a revisão do endereço compara com a fábrica ANTIGA, a que está gravada", () => {
    expect(MODELO).toEqual(FABRICA_ATE_0923);
    const main = readFileSync(resolve(__dirname, "../src/main.ts"), "utf8");
    expect(main).toContain("revisarOllamaPadrao(saved, FABRICA_ATE_0923)");
  });
});

describe("a revisão única de quem já tinha instalado", () => {
  it("o localhost herdado, sem uso nenhum, volta pro vazio", () => {
    expect(revisarOllamaPadrao({ ollamaEndpoint: OLLAMA_LOCAL }, MODELO)).toBe("");
    expect(
      revisarOllamaPadrao(
        { ollamaEndpoint: OLLAMA_LOCAL, ollamaModel: "llama3.2", defaultProvider: "openai", activeModels: { ollama: ["llama3.2", "qwen2.5", "deepseek-r1", "mistral"] } },
        MODELO
      )
    ).toBe("");
  });

  it("quem usa o Ollama fica com o endereço", () => {
    const usos = [
      { defaultProvider: "ollama" },
      { providerStatus: { ollama: { ok: true } } },
      { ollamaModel: "qwen2.5:7b" },
      { favoriteModels: { ollama: ["llama3.1"] } },
      { activeModels: { ollama: ["llama3.1"] } },
      { activeModels: { ollama: ["llama3.2", "qwen2.5", "deepseek-r1", "mistral", "phi4"] } },
      { roleModels: { chat: { provider: "ollama", model: "llama3.1" } } },
      { modelProvider: { "llama3.1": "ollama" } },
    ];
    for (const u of usos) {
      expect(revisarOllamaPadrao({ ollamaEndpoint: OLLAMA_LOCAL, ...u }, MODELO), JSON.stringify(u)).toBeNull();
    }
  });

  it("um teste de conexão que FALHOU não é uso", () => {
    expect(usaOllama({ providerStatus: { ollama: { ok: false } } }, MODELO)).toBe(false);
  });

  it("endereço que não é o de fábrica é escolha da pessoa — não mexe", () => {
    expect(revisarOllamaPadrao({ ollamaEndpoint: "http://192.168.0.10:11434" }, MODELO)).toBeNull();
    expect(revisarOllamaPadrao({ ollamaEndpoint: "" }, MODELO)).toBeNull();
    expect(revisarOllamaPadrao({}, MODELO)).toBeNull();
  });

  it("roda uma vez só: depois de revisto, um localhost digitado fica", () => {
    expect(
      revisarOllamaPadrao({ ollamaEndpoint: OLLAMA_LOCAL, ollamaPadraoRevisto: true }, MODELO)
    ).toBeNull();
  });
});

describe("sem credencial, a bolha diz o que falta", () => {
  const t = getTranslations("en-us");

  it("Ollama sem endereço pede o ENDEREÇO, não uma key", () => {
    const msg = semCredencial("ollama", "", t, "Ollama");
    expect(msg).toContain("server address");
    expect(msg).toContain("localhost:11434");
    expect(msg).not.toContain("API key");
  });

  it("os outros continuam pedindo a key", () => {
    expect(semCredencial("openrouter", "  ", t, "OpenRouter")).toContain("API key");
  });

  it("with credential present, returns null", () => {
    expect(semCredencial("ollama", OLLAMA_LOCAL, t, "Ollama")).toBeNull();
    expect(semCredencial("openai", "sk-x", t, "OpenAI")).toBeNull();
  });
});

describe("o provider não cai no localhost por conta própria", () => {
  it("buscar modelos sem endereço falha com o recado, sem ir à rede", async () => {
    await expect(ollamaProvider.listModels!("")).rejects.toThrow(/server address/);
  });
});
