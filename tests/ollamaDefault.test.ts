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

const FACTORY = OLLAMA_DEFAULTS_UNTIL_0923;

describe("one-time review of existing installs", () => {
  it("clears an inherited unused localhost endpoint", () => {
    expect(reviewOllamaDefault({ ollamaEndpoint: OLLAMA_LOCAL }, FACTORY)).toBe("");
    expect(
      reviewOllamaDefault(
        { ollamaEndpoint: OLLAMA_LOCAL, ollamaModel: "llama3.2", defaultProvider: "openai", activeModels: { ollama: ["llama3.2", "qwen2.5", "deepseek-r1", "mistral"] } },
        FACTORY
      )
    ).toBe("");
  });

  it("keeps the endpoint for people who use Ollama", () => {
    const uses = [
      { defaultProvider: "ollama" },
      { providerStatus: { ollama: { ok: true } } },
      { ollamaModel: "qwen2.5:7b" },
      { favoriteModels: { ollama: ["llama3.1"] } },
      { activeModels: { ollama: ["llama3.1"] } },
      { activeModels: { ollama: ["llama3.2", "qwen2.5", "deepseek-r1", "mistral", "phi4"] } },
      { roleModels: { chat: { provider: "ollama", model: "llama3.1" } } },
      { modelProvider: { "llama3.1": "ollama" } },
    ];
    for (const u of uses) {
      expect(reviewOllamaDefault({ ollamaEndpoint: OLLAMA_LOCAL, ...u }, FACTORY), JSON.stringify(u)).toBeNull();
    }
  });

  it("does not count a failed connection test as use", () => {
    expect(usesOllama({ providerStatus: { ollama: { ok: false } } }, FACTORY)).toBe(false);
  });

  it("leaves endpoints other than the factory one alone", () => {
    expect(reviewOllamaDefault({ ollamaEndpoint: "http://192.168.0.10:11434" }, FACTORY)).toBeNull();
    expect(reviewOllamaDefault({ ollamaEndpoint: "" }, FACTORY)).toBeNull();
    expect(reviewOllamaDefault({}, FACTORY)).toBeNull();
  });

  it("runs only once, so a localhost typed after the review stays", () => {
    expect(
      reviewOllamaDefault({ ollamaEndpoint: OLLAMA_LOCAL, ollamaDefaultReviewed: true }, FACTORY)
    ).toBeNull();
  });
});

describe("missingCredentialError", () => {
  const t = EN_US;

  it("asks Ollama for a server address, not an API key", () => {
    const msg = missingCredentialError("ollama", "", t, "Ollama");
    expect(msg).toContain("server address");
    expect(msg).toContain("localhost:11434");
    expect(msg).not.toContain("API key");
  });

  it("asks other providers for an API key", () => {
    expect(missingCredentialError("openrouter", "  ", t, "OpenRouter")).toContain("API key");
  });

  it("returns null when the credential is present", () => {
    expect(missingCredentialError("ollama", OLLAMA_LOCAL, t, "Ollama")).toBeNull();
    expect(missingCredentialError("openai", "sk-x", t, "OpenAI")).toBeNull();
  });
});

describe("Ollama provider without an endpoint", () => {
  it("fails to list models with the address hint instead of falling back to localhost", async () => {
    await expect(ollamaProvider.listModels!("")).rejects.toThrow(/server address/);
  });
});
