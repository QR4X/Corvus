import { describe, it, expect, afterEach } from "vitest";
import {
  getModelCapabilities,
} from "../src/providers/modelCapabilities";
import { hydrateModelInfoCache } from "../src/providers/modelInfoStore";

describe("getModelCapabilities prefix order", () => {
  it("gpt-4o-mini matches before gpt-4o", () => {
    const caps = getModelCapabilities("openai", "gpt-4o-mini-2024-07-18");
    expect(caps).toMatchObject({ vision: true, tools: true, streaming: true });
  });

  it("o1-mini without tools or vision matches before o1", () => {
    expect(getModelCapabilities("openai", "o1-mini")).toMatchObject({
      vision: false,
      tools: false,
    });
    expect(getModelCapabilities("openai", "o1")).toMatchObject({
      vision: true,
      tools: false,
    });
  });

  it("tts matches as audioGen, not as chat", () => {
    const caps = getModelCapabilities("openai", "gpt-4o-mini-tts");
    expect(caps.audioGen).toBe(true);
    expect(caps.tools).toBe(false);
  });

  it("dall-e-3 is image generation", () => {
    expect(getModelCapabilities("openai", "dall-e-3").imageGen).toBe(true);
  });

  it("claude-fable-5 has vision, tools and streaming", () => {
    expect(getModelCapabilities("anthropic", "claude-fable-5")).toMatchObject({
      vision: true,
      tools: true,
      streaming: true,
    });
  });

  it("llama-3.2-vision gets vision before the text-only llama-3.2 base", () => {
    expect(
      getModelCapabilities("openrouter", "meta-llama/llama-3.2-vision-instruct")
        .vision
    ).toBe(true);
    expect(
      getModelCapabilities("openrouter", "meta-llama/llama-3.2-3b-instruct")
        .vision
    ).toBe(false);
  });

  it("openrouter/auto has vision, tools and streaming", () => {
    const caps = getModelCapabilities("openrouter", "openrouter/auto");
    expect(caps).toMatchObject({
      vision: true,
      tools: true,
      streaming: true,
    });
  });
});

describe("getModelCapabilities OpenRouter :free overlay", () => {
  it("the :free suffix marks the model free without losing upstream capabilities", () => {
    const caps = getModelCapabilities("openrouter", "mistralai/mistral-7b:free");
    expect(caps.free).toBe(true);
    expect(caps.tools).toBe(true);
  });

  it(":free without a prefix match still marks the default as free", () => {
    const caps = getModelCapabilities("openrouter", "unknown-lab/x:free");
    expect(caps.free).toBe(true);
    expect(caps.streaming).toBe(true);
  });
});

describe("getModelCapabilities safe fallbacks", () => {
  it("an unknown provider gets the conservative default with only streaming", () => {
    expect(getModelCapabilities("provider-fake", "x")).toEqual({
      vision: false,
      tools: false,
      streaming: true,
      pdf: false,
    });
  });

  it("an empty model gets the default", () => {
    expect(getModelCapabilities("openai", "")).toMatchObject({
      vision: false,
      tools: false,
      streaming: true,
    });
  });

  it("an unknown model on a known provider gets the default", () => {
    expect(getModelCapabilities("openai", "future-model-9000")).toMatchObject(
      { vision: false, tools: false, streaming: true }
    );
  });
});

describe("getModelCapabilities live catalog overlay", () => {
  afterEach(() => hydrateModelInfoCache({}));

  it("a model outside the tables gets vision from live data", () => {
    hydrateModelInfoCache({
      "openrouter::lab/new-model": {
        modalities: ["text", "image"],
        supportsTools: true,
      },
    });
    expect(getModelCapabilities("openrouter", "lab/new-model")).toMatchObject({
      vision: true,
      tools: true,
    });
  });

  it("image output becomes imageGen, which puts the model on the Image tab", () => {
    hydrateModelInfoCache({ "openrouter::lab/photo-1": { outputModalities: ["image"] } });
    expect(getModelCapabilities("openrouter", "lab/photo-1").imageGen).toBe(true);
  });

  it("outside OpenRouter the catalog only turns capabilities on, never off", () => {
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
