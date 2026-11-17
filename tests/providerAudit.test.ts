import { describe, it, expect, afterEach } from "vitest";
import { Platform } from "obsidian";
import { getModelCapabilities } from "../src/providers/modelCapabilities";
import { hydrateModelInfoCache } from "../src/providers/modelInfoStore";
import { isRelevantOpenRouterModel } from "../src/providers/openrouter";
import { isRelevantNimModel, nodeBodyToWebStream } from "../src/providers/nim";
import { isRelevantOpenAIModel } from "../src/providers/openai";
import { resolveMaxTokens } from "../src/providers/paramPolicy";
import { parseOpenAIChatMessage } from "../src/providers/_shared";

afterEach(() => hydrateModelInfoCache({}));

describe("OpenRouter multi-vendor capabilities", () => {
  it("gives tools to unknown OpenRouter vendors", () => {
    for (const m of [
      "x-ai/grok-4",
      "cohere/command-a",
      "amazon/nova-pro-v1",
      "moonshotai/kimi-k2",
      "z-ai/glm-4.6",
      "some-new-lab/brand-new-model",
    ]) {
      expect(getModelCapabilities("openrouter", m).tools, m).toBe(true);
    }
  });

  it("gives google/gemini-3 tools and vision on OpenRouter", () => {
    const caps = getModelCapabilities("openrouter", "google/gemini-3-pro");
    expect(caps.tools).toBe(true);
    expect(caps.vision).toBe(true);
  });

  it("keeps tools off for curated perplexity/sonar", () => {
    expect(getModelCapabilities("openrouter", "perplexity/sonar-pro").tools).toBe(false);
  });

  it("marks :free models free without losing upstream capabilities", () => {
    const caps = getModelCapabilities(
      "openrouter",
      "meta-llama/llama-3.2-vision:free"
    );
    expect(caps.free).toBe(true);
    expect(caps.vision).toBe(true);
    expect(caps.tools).toBe(true);
  });
});

describe("NIM streaming per platform", () => {
  it("gives unknown publishers tools and real streaming on desktop", () => {
    Platform.isMobile = false;
    for (const m of ["openai/gpt-oss-120b", "ibm/granite-4.0-h-small"]) {
      const caps = getModelCapabilities("nim", m);
      expect(caps.tools, m).toBe(true);
      expect(caps.streaming, m).toBe(true);
    }
  });

  it("keeps streaming off on mobile", () => {
    Platform.isMobile = true;
    try {
      expect(getModelCapabilities("nim", "openai/gpt-oss-120b").streaming).toBe(false);
      expect(getModelCapabilities("nim", "meta/llama-3.3-70b-instruct").streaming).toBe(false);
    } finally {
      Platform.isMobile = false;
    }
  });

  it("never streams NIM image generation models", () => {
    Platform.isMobile = false;
    const caps = getModelCapabilities("nim", "stabilityai/stable-diffusion-3-medium");
    expect(caps.imageGen).toBe(true);
    expect(caps.streaming).toBe(false);
  });
});

describe("NIM Node to Web stream conversion", () => {
  it("delivers chunks and closes on end", async () => {
    type Handler = (...args: unknown[]) => void;
    const handlers: Record<string, Handler[]> = {};
    const fakeRes = {
      statusCode: 200,
      on(ev: string, cb: Handler) {
        (handlers[ev] ??= []).push(cb);
      },
    };
    const stream = nodeBodyToWebStream(fakeRes as any);
    const reader = stream.getReader();
    const enc = new TextEncoder();
    handlers["data"]?.forEach((cb) => cb(enc.encode("data: hello\n")));
    handlers["data"]?.forEach((cb) => cb(enc.encode("data: [DONE]\n")));
    handlers["end"]?.forEach((cb) => cb());
    const dec = new TextDecoder();
    let out = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      out += dec.decode(value);
    }
    expect(out).toBe("data: hello\ndata: [DONE]\n");
  });
});

describe("live catalog capability overlay", () => {
  it("lets the OpenRouter catalog turn tools on and off", () => {
    hydrateModelInfoCache({
      "openrouter::vendor-x/no-tools-model": { supportsTools: false },
      "openrouter::perplexity/sonar-deep": { supportsTools: true },
    });
    expect(
      getModelCapabilities("openrouter", "vendor-x/no-tools-model").tools
    ).toBe(false);
    expect(
      getModelCapabilities("openrouter", "perplexity/sonar-deep").tools
    ).toBe(true);
  });

  it("only upgrades curated capabilities for direct providers", () => {
    hydrateModelInfoCache({
      "openai::gpt-4o": { supportsTools: false },
      "ollama::mistral": { supportsTools: true },
    });
    expect(getModelCapabilities("openai", "gpt-4o").tools).toBe(true);
    expect(getModelCapabilities("ollama", "mistral").tools).toBe(true);
  });

  it("maps image modality to vision and free tier to free", () => {
    hydrateModelInfoCache({
      "openrouter::new-lab/multi": { modalities: ["text", "image"], tier: "free" },
    });
    const caps = getModelCapabilities("openrouter", "new-lab/multi");
    expect(caps.vision).toBe(true);
    expect(caps.free).toBe(true);
  });

  it("never changes streaming through the overlay", () => {
    Platform.isMobile = true;
    try {
      hydrateModelInfoCache({
        "nim::meta/llama-3.3-70b-instruct": { supportsTools: true },
      });
      expect(
        getModelCapabilities("nim", "meta/llama-3.3-70b-instruct").streaming
      ).toBe(false);
    } finally {
      Platform.isMobile = false;
    }
  });
});

describe("listModels filters", () => {
  it("OpenRouter keeps :free, auto names and openrouter/auto but drops other pseudo models", () => {
    expect(isRelevantOpenRouterModel("meta-llama/llama-3.3-70b:free")).toBe(true);
    expect(isRelevantOpenRouterModel("vendor/automatic-writer")).toBe(true);
    expect(isRelevantOpenRouterModel("openrouter/auto")).toBe(true);
    expect(isRelevantOpenRouterModel("openrouter/other-router")).toBe(false);
    expect(isRelevantOpenRouterModel("openai/text-embedding-3-small")).toBe(false);
  });

  it("NIM accepts any publisher/model but drops embed, rerank and ASR", () => {
    expect(isRelevantNimModel("openai/gpt-oss-120b")).toBe(true);
    expect(isRelevantNimModel("ibm/granite-4.0-h-small")).toBe(true);
    expect(isRelevantNimModel("stabilityai/stable-diffusion-3-medium")).toBe(true);
    expect(isRelevantNimModel("nvidia/llama-3.2-nv-embedqa-1b-v2")).toBe(false);
    expect(isRelevantNimModel("nvidia/rerank-qa-mistral-4b")).toBe(false);
    expect(isRelevantNimModel("nvidia/parakeet-ctc-0.6b")).toBe(false);
    expect(isRelevantNimModel("not-a-model")).toBe(false);
  });

  it("OpenAI keeps chat, o-series, image and voice models", () => {
    for (const m of [
      "gpt-4.1",
      "gpt-4.1-mini",
      "gpt-4-turbo",
      "chatgpt-4o-latest",
      "o5",
      "o5-mini",
      "o1-preview",
      "gpt-3.5-turbo",
      "gpt-5.4",
    ]) {
      expect(isRelevantOpenAIModel(m), m).toBe(true);
    }
    for (const m of [
      "gpt-4o-realtime-preview",
      "gpt-4o-audio-preview",
      "gpt-4o-search-preview",
      "gpt-4-vision-preview",
      "gpt-3.5-turbo-instruct",
      "text-embedding-3-small",
      "whisper-1",
    ]) {
      expect(isRelevantOpenAIModel(m), m).toBe(false);
    }

    expect(isRelevantOpenAIModel("dall-e-3")).toBe(true);
    expect(isRelevantOpenAIModel("gpt-image-1")).toBe(true);
    expect(isRelevantOpenAIModel("tts-1-hd")).toBe(true);
    expect(isRelevantOpenAIModel("gpt-4o-mini-tts")).toBe(true);
  });
});

describe("paramPolicy output caps", () => {
  it("caps unknown NIM models at 4096", () => {
    expect(resolveMaxTokens("nim", "ibm/granite-4.0-h-small", 16000)).toBe(4096);
  });
  it("caps DeepSeek at 8192 on any host", () => {
    expect(resolveMaxTokens("nim", "deepseek-ai/deepseek-v4-pro", 16000)).toBe(8192);
    expect(resolveMaxTokens("openrouter", "deepseek/deepseek-chat", 16000)).toBe(8192);
  });
  it("keeps large-family caps for Claude, GPT-5 and Gemini", () => {
    expect(resolveMaxTokens("anthropic", "claude-opus-4-8", 200000)).toBe(128000);
    expect(resolveMaxTokens("openai", "gpt-5.4", 200000)).toBe(128000);
    expect(resolveMaxTokens("gemini", "gemini-2.5-pro", 200000)).toBe(65536);
  });
});

describe("reasoning in non-streamed responses", () => {
  it("extracts reasoning_content", () => {
    const r = parseOpenAIChatMessage({
      content: "answer",
      reasoning_content: "thinking...",
    });
    expect(r.content).toBe("answer");
    expect(r.reasoning).toBe("thinking...");
  });
  it("accepts the alternative reasoning field", () => {
    expect(parseOpenAIChatMessage({ content: "x", reasoning: "y" }).reasoning).toBe("y");
  });
  it("returns undefined without reasoning", () => {
    expect(parseOpenAIChatMessage({ content: "x" }).reasoning).toBeUndefined();
  });
});
