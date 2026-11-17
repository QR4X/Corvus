import { describe, it, expect, afterEach } from "vitest";
import { __setRequestUrl } from "obsidian";
import { setKnownFree, getPricing } from "../src/usage/pricing";
import { enrichModelsFromCatalog, getEnrichedInfo } from "../src/providers/modelInfoStore";
import { getModelCard } from "../src/providers/modelDescriptions";
import { openaiFreeTierForModel } from "../src/usage/freeTokens";
import { isTrulyFree } from "../src/usage/freeTag";

describe("usage panel: zero cost only for truly free models", () => {
  it("treats NIM without the Free Endpoint mark as unknown cost, not $0", () => {
    const p = getPricing("nim", "meta/llama-3.1-70b-instruct");
    expect(p.tier).toBe("unknown");
    expect(p.inputPerMillion).toBeNull();
  });

  it("treats NIM models marked free by the fetch as free, including NVIDIA underscore ids", () => {
    setKnownFree("nim", ["deepseek-ai/deepseek-v4.1-flash", "nvidia/llama-3_1-nemotron-safety-guard-8b-v3"]);
    expect(getPricing("nim", "deepseek-ai/deepseek-v4.1-flash")).toMatchObject({ tier: "free", inputPerMillion: 0 });
    expect(getPricing("nim", "nvidia/llama-3.1-nemotron-safety-guard-8b-v3").tier).toBe("free");
    expect(getPricing("nim", "meta/llama-3.1-70b-instruct").tier).toBe("unknown");
  });

  it("treats OpenRouter models found free by price as free and leaves the rest to the table", () => {
    setKnownFree("openrouter", ["inclusionai/ling-3.1-flash"]);
    expect(getPricing("openrouter", "inclusionai/ling-3.1-flash").tier).toBe("free");
    expect(getPricing("openrouter", "google/lyria-3-clip-preview").tier).toBe("unknown");
  });
});

describe("catalog cache does not guess Lyria as free", () => {
  afterEach(() => __setRequestUrl(null));

  it("marks zero per-token price with per-clip billing as unknown, not free", async () => {
    __setRequestUrl(async () => ({
      status: 200,
      json: {
        data: [
          {
            id: "google/lyria-3-clip-preview",
            description: "30 second duration clips are priced at $0.04 per clip.",
            architecture: { output_modalities: ["text", "audio"] },
            pricing: { prompt: "0", completion: "0" },
          },
          {
            id: "google/gemma-4-31b-it:free",
            description: "Gemma 4 31B Instruct.",
            architecture: { output_modalities: ["text"] },
            pricing: { prompt: "0", completion: "0" },
          },
        ],
      },
      text: "",
      headers: {},
    }));
    await enrichModelsFromCatalog("openrouter", ["google/lyria-3-clip-preview", "google/gemma-4-31b-it:free"]);
    expect(getEnrichedInfo("openrouter", "google/lyria-3-clip-preview")?.tier).toBe("unknown");
    expect(getEnrichedInfo("openrouter", "google/gemma-4-31b-it:free")?.tier).toBe("free");
  });
});

describe("model descriptions that promised free use", () => {
  it("describes Nano Banana as paid with no free tier", () => {
    const c = getModelCard("gemini", "gemini-2.5-flash-image");
    expect(c.description).not.toMatch(/free tier \d/i);
    expect(c.description).toMatch(/no free tier/i);
    expect(c.goodFor ?? "").not.toMatch(/free/i);
  });

  it("does not promise a free tier for NIM SD3", () => {
    expect(getModelCard("nim", "stabilityai/stable-diffusion-3-medium").description).not.toMatch(/free/i);
  });
});

describe("OpenAI data sharing free quota buckets", () => {
  it("puts GPT-5.x mini and nano models in the small 2.5M bucket", () => {
    expect(openaiFreeTierForModel("gpt-5.1-mini")).toBe("mini");
    expect(openaiFreeTierForModel("gpt-5.2-nano")).toBe("mini");
    expect(openaiFreeTierForModel("gpt-5-mini")).toBe("mini");
    expect(openaiFreeTierForModel("gpt-5.5")).toBe("big");
    expect(openaiFreeTierForModel("gpt-image-1")).toBeNull();
  });
});

describe("the :free variant is free even outside the fetched list", () => {
  it("treats the Nemotron VL :free embedding as free regardless of the chat list", () => {
    expect(isTrulyFree("nvidia/llama-nemotron-embed-vl-1b-v2:free", ["other/model"], false)).toBe(true);
  });
});
