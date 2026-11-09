import { describe, it, expect, afterEach } from "vitest";
import {
  getModelCapabilities,
  isGenerationModel,
} from "../src/providers/modelCapabilities";
import { hydrateModelInfoCache } from "../src/providers/modelInfoStore";

describe("getModelCapabilities — ordem de prefixo (o que quebra calado)", () => {
  it("gpt-4o-mini casa antes de gpt-4o", () => {
    const caps = getModelCapabilities("openai", "gpt-4o-mini-2024-07-18");
    expect(caps).toMatchObject({ vision: true, tools: true, streaming: true });
  });

  it("o1-mini (sem tools/vision) casa antes de o1", () => {
    expect(getModelCapabilities("openai", "o1-mini")).toMatchObject({
      vision: false,
      tools: false,
    });
    expect(getModelCapabilities("openai", "o1")).toMatchObject({
      vision: true,
      tools: false,
    });
  });

  it("tts casa como audioGen, não como chat", () => {
    const caps = getModelCapabilities("openai", "gpt-4o-mini-tts");
    expect(caps.audioGen).toBe(true);
    expect(caps.tools).toBe(false);
  });

  it("dall-e-3 é image gen", () => {
    expect(getModelCapabilities("openai", "dall-e-3").imageGen).toBe(true);
  });

  it("claude-fable-5 (modelo novo) tem vision + tools + streaming", () => {
    expect(getModelCapabilities("anthropic", "claude-fable-5")).toMatchObject({
      vision: true,
      tools: true,
      streaming: true,
    });
  });

  it("llama-3.2-vision casa vision antes do llama-3.2 base texto-only", () => {
    expect(
      getModelCapabilities("openrouter", "meta-llama/llama-3.2-vision-instruct")
        .vision
    ).toBe(true);
    expect(
      getModelCapabilities("openrouter", "meta-llama/llama-3.2-3b-instruct")
        .vision
    ).toBe(false);
  });

  it("openrouter/auto tem vision + tools + streaming", () => {
    const caps = getModelCapabilities("openrouter", "openrouter/auto");
    expect(caps).toMatchObject({
      vision: true,
      tools: true,
      streaming: true,
    });
  });
});

describe("getModelCapabilities — overlay :free do OpenRouter", () => {
  it("sufixo :free mark free=true sem perder as caps do upstream", () => {
    const caps = getModelCapabilities("openrouter", "mistralai/mistral-7b:free");
    expect(caps.free).toBe(true);
    expect(caps.tools).toBe(true); 
  });

  it(":free sem match de prefixo ainda mark free no default", () => {
    const caps = getModelCapabilities("openrouter", "lab-desconhecido/x:free");
    expect(caps.free).toBe(true);
    expect(caps.streaming).toBe(true);
  });
});

describe("getModelCapabilities — fallbacks seguros", () => {
  it("provider desconhecido → default conservador (só streaming)", () => {

    expect(getModelCapabilities("provider-fake", "x")).toEqual({
      vision: false,
      tools: false,
      streaming: true,
      pdf: false,
    });
  });

  it("modelo vazio → default", () => {
    expect(getModelCapabilities("openai", "")).toMatchObject({
      vision: false,
      tools: false,
      streaming: true,
    });
  });

  it("modelo desconhecido num provider conhecido → default", () => {
    expect(getModelCapabilities("openai", "modelo-do-futuro-9000")).toMatchObject(
      { vision: false, tools: false, streaming: true }
    );
  });
});

describe("isGenerationModel", () => {
  it("true pra qualquer flag de geração", () => {
    expect(isGenerationModel(getModelCapabilities("openai", "dall-e-3"))).toBe(
      true
    );
    expect(isGenerationModel(getModelCapabilities("openai", "tts-1"))).toBe(true);
  });
  it("false pra modelo de chat", () => {
    expect(isGenerationModel(getModelCapabilities("openai", "gpt-4o"))).toBe(
      false
    );
  });
});

describe("getModelCapabilities — overlay do catálogo vivo", () => {
  afterEach(() => hydrateModelInfoCache({}));

  it("um modelo fora das tabelas ganha visão pelo dado REAL", () => {
    hydrateModelInfoCache({
      "openrouter::lab/modelo-novo": {
        modalities: ["text", "image"],
        supportsTools: true,
      },
    });
    expect(getModelCapabilities("openrouter", "lab/modelo-novo")).toMatchObject({
      vision: true,
      tools: true,
    });
  });

  it("output de imagem vira imageGen (é o que põe o modelo na aba Image)", () => {
    hydrateModelInfoCache({ "openrouter::lab/foto-1": { outputModalities: ["image"] } });
    expect(getModelCapabilities("openrouter", "lab/foto-1").imageGen).toBe(true);
  });

  it("fora do OpenRouter o catálogo só LIGA — nunca desliga a tabela curada", () => {
    hydrateModelInfoCache({
      "nim::meta/llama-3.3-70b-instruct": {
        supportsTools: false,
        modalities: ["text"],
      },
    });

    expect(getModelCapabilities("nim", "meta/llama-3.3-70b-instruct").tools).toBe(
      true
    );
  });
});
