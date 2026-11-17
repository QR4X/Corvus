import { describe, it, expect } from "vitest";
import {
  OLLAMA_DEFAULTS_UNTIL_0923,
  OLLAMA_LOCAL,
  reviewOllamaDefault,
  usesOllama,
} from "../src/core/ollamaDefault";
import { missingCredentialError } from "../src/core/helpers";
import { EN_US } from "../src/i18n/en-us";
import { ollamaProvider } from "../src/providers/ollama";
import { DEFAULT_SETTINGS } from "../src/settings";

const MODELO = { model: "llama3.2", active: ["llama3.2", "qwen2.5", "deepseek-r1", "mistral"] };

describe("de fábrica", () => {
  it("Ollama starts with no endpoint, model or model list", () => {
    expect(DEFAULT_SETTINGS.ollamaEndpoint).toBe("");
    expect(DEFAULT_SETTINGS.ollamaModel).toBe("");
    expect(DEFAULT_SETTINGS.activeModels.ollama).toEqual([]);
  });
});

describe("a revisão única de quem já tinha instalado", () => {
  it("o localhost herdado, sem uso nenhum, volta pro vazio", () => {
    expect(reviewOllamaDefault({ ollamaEndpoint: OLLAMA_LOCAL }, MODELO)).toBe("");
    expect(
      reviewOllamaDefault(
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
      expect(reviewOllamaDefault({ ollamaEndpoint: OLLAMA_LOCAL, ...u }, MODELO), JSON.stringify(u)).toBeNull();
    }
  });

  it("um teste de conexão que FALHOU não é uso", () => {
    expect(usesOllama({ providerStatus: { ollama: { ok: false } } }, MODELO)).toBe(false);
  });

  it("endereço que não é o de fábrica é escolha da pessoa — não mexe", () => {
    expect(reviewOllamaDefault({ ollamaEndpoint: "http://192.168.0.10:11434" }, MODELO)).toBeNull();
    expect(reviewOllamaDefault({ ollamaEndpoint: "" }, MODELO)).toBeNull();
    expect(reviewOllamaDefault({}, MODELO)).toBeNull();
  });

  it("roda uma vez só: depois de revisto, um localhost digitado fica", () => {
    expect(
      reviewOllamaDefault({ ollamaEndpoint: OLLAMA_LOCAL, ollamaDefaultReviewed: true }, MODELO)
    ).toBeNull();
  });
});

describe("sem credencial, a bolha diz o que falta", () => {
  const t = EN_US;

  it("Ollama sem endereço pede o ENDEREÇO, não uma key", () => {
    const msg = missingCredentialError("ollama", "", t, "Ollama");
    expect(msg).toContain("server address");
    expect(msg).toContain("localhost:11434");
    expect(msg).not.toContain("API key");
  });

  it("os outros continuam pedindo a key", () => {
    expect(missingCredentialError("openrouter", "  ", t, "OpenRouter")).toContain("API key");
  });

  it("with credential present, returns null", () => {
    expect(missingCredentialError("ollama", OLLAMA_LOCAL, t, "Ollama")).toBeNull();
    expect(missingCredentialError("openai", "sk-x", t, "OpenAI")).toBeNull();
  });
});

describe("o provider não cai no localhost por conta própria", () => {
  it("buscar modelos sem endereço falha com o recado, sem ir à rede", async () => {
    await expect(ollamaProvider.listModels!("")).rejects.toThrow(/server address/);
  });
});
