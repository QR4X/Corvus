import { describe, it, expect } from "vitest";
import { compareVendors, modelVendor } from "../src/providers/vendors";
import { buildModelCatalog, byVendor, looseByVendor } from "../src/ui/modelCatalog";
import { freeFromNvidiaCatalog } from "../src/providers/nim";
import { keyFreeQuota } from "../src/providers/openrouter";
import { isFreeOnOpenRouter } from "../src/providers/openrouterFree";
import { freeTag, geminiHasFreeTier, isTrulyFree } from "../src/usage/freeTag";

describe("modelVendor", () => {
  it("merges different prefixes for the same vendor", () => {
    expect(modelVendor("meta-llama/llama-3.3-70b-instruct")).toEqual({ key: "meta", name: "Meta" });
    expect(modelVendor("meta/llama-3.1-70b-instruct")).toEqual({ key: "meta", name: "Meta" });
    expect(modelVendor("deepseek-ai/deepseek-v4.1-flash").name).toBe("DeepSeek");
    expect(modelVendor("deepseek/deepseek-chat").key).toBe("deepseek");
    expect(modelVendor("x-ai/grok-4").name).toBe("xAI");
    expect(modelVendor("mistralai/mistral-large").name).toBe("Mistral");
  });

  it("names an unknown vendor from its prefix and uses Other without a prefix", () => {
    expect(modelVendor("some-new-lab/model-x").name).toBe("Some New Lab");
    expect(modelVendor("gpt-5")).toEqual({ key: "", name: "Other" });
  });

  it("sorts major vendors first, the rest by name and Other last", () => {
    const names = ["poolside/x", "anthropic/x", "zzz/x", "openai/x", "abc/x", "no-prefix"]
      .map(modelVendor)
      .sort(compareVendors)
      .map((f) => f.name);
    expect(names).toEqual(["OpenAI", "Anthropic", "Abc", "Poolside", "Zzz", "Other"]);
  });
});

describe("catalog by vendor", () => {
  const models = [
    "anthropic/claude-opus-4.8",
    "anthropic/claude-sonnet-4.6",
    "openai/gpt-5",
    "openai/gpt-4o",
    "meta-llama/llama-3.3-70b-instruct",
    "perplexity/sonar",
  ];

  it("groups each vendor's families in vendor order", () => {
    const groups = byVendor(buildModelCatalog("openrouter", models));
    expect(groups.map((g) => g.vendor.name)).toEqual(["OpenAI", "Anthropic", "Meta", "Perplexity"]);
    const anthropic = groups.find((g) => g.vendor.key === "anthropic")!;
    expect(anthropic.total).toBe(2);

    const all = groups.flatMap((g) => g.sections.flatMap((s) => s.family.models)).sort();
    expect(all).toEqual([...models].sort());
  });

  it("groups the loose Free filter list by vendor too", () => {
    const g = looseByVendor(["meta/llama-3.2-11b-vision-instruct", "deepseek-ai/deepseek-v4.1-flash", "meta/llama-guard-4-12b"]);
    expect(g.map((x) => [x.vendor.name, x.models.length])).toEqual([["Meta", 2], ["DeepSeek", 1]]);
  });
});

describe("freeFromNvidiaCatalog", () => {
  const resource = (name: string, publisher: string, free: boolean) => ({
    resourceType: "ENDPOINT",
    name,
    labels: [
      {
        key: "general",
        values: free ? ["chat", "Free Endpoint"] : ["chat", "Partner Endpoint"],
        unresolvedValues: free ? ["playgroundtype_chat", "nim_type_preview"] : ["playgroundtype_chat"],
      },
      { key: "publisher", values: [publisher], unresolvedValues: [publisher] },
    ],
  });
  const page = {
    resultTotal: 3,
    results: [
      { groupValue: "_scored", resources: [resource("deepseek-v4.1-flash", "deepseek-ai", true)] },
      {
        groupValue: "ENDPOINT",
        resources: [
          resource("deepseek-v4.1-flash", "deepseek-ai", true),
          resource("riva-translate-4b-instruct-v1_1", "nvidia", true),
          resource("llama-3.1-70b-instruct", "meta", false),
        ],
      },
    ],
  };

  it("builds publisher/name ids for Free Endpoints, turning NVIDIA's _ into the API's .", () => {
    const { ids, total } = freeFromNvidiaCatalog(page);
    expect(ids.sort()).toEqual(["deepseek-ai/deepseek-v4.1-flash", "nvidia/riva-translate-4b-instruct-v1.1"]);
    expect(total).toBe(3);
  });

  it("returns nothing for a broken catalog", () => {
    expect(freeFromNvidiaCatalog(undefined).ids).toEqual([]);
    expect(freeFromNvidiaCatalog({ results: "x" }).ids).toEqual([]);
  });
});

describe("keyFreeQuota", () => {
  it("uses free_model_daily_requests when present", () => {
    expect(keyFreeQuota({ data: { free_model_daily_requests: { used: 13, limit: 50, remaining: 37 } } })).toEqual({
      limit: 50,
      remaining: 37,
    });
  });

  it("otherwise uses is_free_tier: 50 without purchased credit, 1,000 with it", () => {
    expect(keyFreeQuota({ data: { is_free_tier: true } })).toEqual({ limit: 50 });
    expect(keyFreeQuota({ data: { is_free_tier: false } })).toEqual({ limit: 1000 });
    expect(keyFreeQuota({ data: {} })).toBeNull();
    expect(keyFreeQuota(null)).toBeNull();
  });
});

describe("isTrulyFree and freeTag", () => {
  it("lets the fetched list decide without :free and trusts a declared :free", () => {
    const freeList = ["vendor/promo-model", "meta-llama/llama-3.3-70b-instruct:free"];
    expect(isTrulyFree("vendor/promo-model", freeList, false)).toBe(true);
    expect(isTrulyFree("vendor/paid-model", freeList, true)).toBe(false);
    expect(isTrulyFree("other/thing:free", freeList, false)).toBe(true);
  });

  it("uses the guess when no list was fetched", () => {
    expect(isTrulyFree("x/y:free", undefined, true)).toBe(true);
    expect(isTrulyFree("x/y", [], false)).toBe(false);
  });

  it("treats NIM's _ and . as the same model", () => {
    expect(isTrulyFree("nvidia/llama-3.1-nemotron-safety-guard-8b-v3", ["nvidia/llama-3_1-nemotron-safety-guard-8b-v3"], false)).toBe(true);
  });

  it("shows the OpenRouter key quota in the label", () => {
    const base = { free: true, dataSharing: false, tier: 1 };
    expect(freeTag("openrouter", "a/b:free", { ...base, quota: { limit: 50, remaining: 37 } })?.label).toBe("free · 50/day");
    expect(freeTag("openrouter", "a/b:free", { ...base, quota: { limit: 1000 } })?.label).toBe("free · 1,000/day");
    expect(freeTag("openrouter", "a/b:free", base)?.label).toBe("free");
    expect(freeTag("openrouter", "a/b:free", { ...base, quota: { limit: 50, remaining: 37 } })?.detail).toContain("37 were left");
  });

  it("shows the NIM per-minute limit and nothing for paid models", () => {
    expect(freeTag("nim", "meta/x", { free: true, dataSharing: false, tier: 1 })?.label).toBe("free · 40/min");
    expect(freeTag("nim", "meta/x", { free: false, dataSharing: false, tier: 1 })).toBeNull();
  });
});

describe("Google models that are really free", () => {
  const lyria = {
    id: "google/lyria-3-clip-preview",
    pricing: { prompt: "0", completion: "0" },
    architecture: { output_modalities: ["text", "audio"] },
    description: "30 second duration clips are priced at $0.04 per clip. Lyria 3 is Google's family of music generation models…",
  };
  const gemmaFree = {
    id: "google/gemma-4-31b-it:free",
    pricing: { prompt: "0", completion: "0" },
    architecture: { output_modalities: ["text"] },
    description: "Gemma 4 31B Instruct is Google DeepMind's 30.7B dense multimodal model…",
  };
  const ling = {
    id: "inclusionai/ling-3.1-flash",
    pricing: { prompt: "0", completion: "0" },
    architecture: { output_modalities: ["text"] },
    description: "Ling 3.1 Flash is a fast MoE model…",
  };

  it("does not treat Lyria as free on OpenRouter despite zero catalog prices, since it charges per clip", () => {
    expect(isFreeOnOpenRouter(lyria)).toBe(false);
    expect(isFreeOnOpenRouter({ ...lyria, architecture: { output_modalities: ["text"] } })).toBe(false);
    expect(isFreeOnOpenRouter({ ...lyria, description: "Music model." })).toBe(false);
  });

  it("treats Gemma :free and an unsuffixed zero-priced text model as free on OpenRouter", () => {
    expect(isFreeOnOpenRouter(gemmaFree)).toBe(true);
    expect(isFreeOnOpenRouter(ling)).toBe(true);
  });

  it("drops OpenRouter models with any price field above zero", () => {
    expect(isFreeOnOpenRouter({ ...ling, pricing: { prompt: "0", completion: "0", image: "0.04" } })).toBe(false);
    expect(isFreeOnOpenRouter({ ...ling, pricing: { prompt: "0", completion: "0.0000004" } })).toBe(false);
  });

  it("gives the Gemini free tier only to models Google lists that way", () => {
    for (const m of [
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemini-2.5-pro",
      "gemini-3.5-flash",
      "gemini-3.8-flash-tts",
      "gemini-2.5-flash-preview-tts",
      "gemini-3.8-live",
      "gemini-embedding-2",
      "gemma-4-31b-it",
      "models/gemini-2.5-flash",
    ]) {
      expect(geminiHasFreeTier(m), m).toBe(true);
    }
    for (const m of [
      "gemini-2.5-flash-image",
      "gemini-3.1-flash-image",
      "gemini-3-pro-image",
      "gemini-3.1-pro-preview",
      "gemini-2.5-pro-preview-tts",
      "gemini-omni-1.1-flash",
      "veo-3.1-generate-preview",
      "lyria-3-pro-preview",
      "imagen-4.0-generate-001",
      "gemini-9-ultra",
    ]) {
      expect(geminiHasFreeTier(m), m).toBe(false);
    }
  });

  it("labels Gemini as an outlined 'free tier' offer and leaves Nano Banana without one", () => {
    const base = { free: false, dataSharing: false, tier: 1 };
    const tag = freeTag("gemini", "gemini-2.5-flash", base);
    expect(tag).toMatchObject({ kind: "offer", label: "free tier" });
    expect(tag?.detail).toMatch(/without billing/);
    expect(freeTag("gemini", "gemini-2.5-flash-image", { ...base, free: true })).toBeNull();
  });
});
