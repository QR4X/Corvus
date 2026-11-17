import { describe, it, expect } from "vitest";
import { compareVendors, modelVendor } from "../src/providers/vendors";
import { buildModelCatalog, byVendor, looseByVendor } from "../src/ui/modelCatalog";
import { freeFromNvidiaCatalog } from "../src/providers/nim";
import { keyFreeQuota } from "../src/providers/openrouter";
import { isFreeOnOpenRouter } from "../src/providers/openrouterFree";
import { freeTag, geminiHasFreeTier, isTrulyFree } from "../src/usage/freeTag";

describe("fabricante de um id vendor/modelo", () => {
  it("prefixos diferentes pra mesma casa viram uma só", () => {
    expect(modelVendor("meta-llama/llama-3.3-70b-instruct")).toEqual({ key: "meta", name: "Meta" });
    expect(modelVendor("meta/llama-3.1-70b-instruct")).toEqual({ key: "meta", name: "Meta" });
    expect(modelVendor("deepseek-ai/deepseek-v4.1-flash").name).toBe("DeepSeek");
    expect(modelVendor("deepseek/deepseek-chat").key).toBe("deepseek");
    expect(modelVendor("x-ai/grok-4").name).toBe("xAI");
    expect(modelVendor("mistralai/mistral-large").name).toBe("Mistral");
  });

  it("casa nova ganha nome a partir do prefixo; sem prefixo é Other", () => {
    expect(modelVendor("some-new-lab/model-x").name).toBe("Some New Lab");
    expect(modelVendor("gpt-5")).toEqual({ key: "", name: "Other" });
  });

  it("ordem: as grandes primeiro, o resto por nome, Other no fim", () => {
    const nomes = ["poolside/x", "anthropic/x", "zzz/x", "openai/x", "abc/x", "sem-prefixo"]
      .map(modelVendor)
      .sort(compareVendors)
      .map((f) => f.name);
    expect(nomes).toEqual(["OpenAI", "Anthropic", "Abc", "Poolside", "Zzz", "Other"]);
  });
});

describe("o catálogo por fabricante", () => {
  const modelos = [
    "anthropic/claude-opus-4.8",
    "anthropic/claude-sonnet-4.6",
    "openai/gpt-5",
    "openai/gpt-4o",
    "meta-llama/llama-3.3-70b-instruct",
    "perplexity/sonar",
  ];

  it("cada fabricante junta as classes dele, na ordem das casas", () => {
    const grupos = byVendor(buildModelCatalog("openrouter", modelos));
    expect(grupos.map((g) => g.vendor.name)).toEqual(["OpenAI", "Anthropic", "Meta", "Perplexity"]);
    const anthropic = grupos.find((g) => g.vendor.key === "anthropic")!;
    expect(anthropic.total).toBe(2);

    const todos = grupos.flatMap((g) => g.sections.flatMap((s) => s.family.models)).sort();
    expect(todos).toEqual([...modelos].sort());
  });

  it("o filtro Free (lista solta) também sai por fabricante", () => {
    const g = looseByVendor(["meta/llama-3.2-11b-vision-instruct", "deepseek-ai/deepseek-v4.1-flash", "meta/llama-guard-4-12b"]);
    expect(g.map((x) => [x.vendor.name, x.models.length])).toEqual([["Meta", 2], ["DeepSeek", 1]]);
  });
});

describe("NIM: grátis = a mark 'Free Endpoint' do catálogo da NVIDIA", () => {

  const recurso = (name: string, publisher: string, gratis: boolean) => ({
    resourceType: "ENDPOINT",
    name,
    labels: [
      {
        key: "general",
        values: gratis ? ["chat", "Free Endpoint"] : ["chat", "Partner Endpoint"],
        unresolvedValues: gratis ? ["playgroundtype_chat", "nim_type_preview"] : ["playgroundtype_chat"],
      },
      { key: "publisher", values: [publisher], unresolvedValues: [publisher] },
    ],
  });
  const pagina = {
    resultTotal: 3,
    results: [

      { groupValue: "_scored", resources: [recurso("deepseek-v4.1-flash", "deepseek-ai", true)] },
      {
        groupValue: "ENDPOINT",
        resources: [
          recurso("deepseek-v4.1-flash", "deepseek-ai", true),
          recurso("riva-translate-4b-instruct-v1_1", "nvidia", true),

          recurso("llama-3.1-70b-instruct", "meta", false),
        ],
      },
    ],
  };

  it("id = publisher/nome, com o _ da NVIDIA virando o . da API", () => {
    const { ids, total } = freeFromNvidiaCatalog(pagina);
    expect(ids.sort()).toEqual(["deepseek-ai/deepseek-v4.1-flash", "nvidia/riva-translate-4b-instruct-v1.1"]);
    expect(total).toBe(3);
  });

  it("catálogo quebrado: nada", () => {
    expect(freeFromNvidiaCatalog(undefined).ids).toEqual([]);
    expect(freeFromNvidiaCatalog({ results: "x" }).ids).toEqual([]);
  });
});

describe("OpenRouter: a cota diária dos grátis na chave", () => {
  it("o free_model_daily_requests, quando vem", () => {
    expect(keyFreeQuota({ data: { free_model_daily_requests: { used: 13, limit: 50, remaining: 37 } } })).toEqual({
      limit: 50,
      remaining: 37,
    });
  });

  it("senão, o is_free_tier: sem crédito comprado = 50; com = 1.000", () => {
    expect(keyFreeQuota({ data: { is_free_tier: true } })).toEqual({ limit: 50 });
    expect(keyFreeQuota({ data: { is_free_tier: false } })).toEqual({ limit: 1000 });
    expect(keyFreeQuota({ data: {} })).toBeNull();
    expect(keyFreeQuota(null)).toBeNull();
  });
});

describe("grátis de verdade e a etiqueta", () => {
  it("sem :free, a lista do fetch decide (preço zero de verdade); com :free, é a grátis declarada", () => {
    const livres = ["vendor/promo-model", "meta-llama/llama-3.3-70b-instruct:free"];
    expect(isTrulyFree("vendor/promo-model", livres, false)).toBe(true);
    expect(isTrulyFree("vendor/paid-model", livres, true)).toBe(false); 

    expect(isTrulyFree("other/thing:free", livres, false)).toBe(true);
  });

  it("sem lista (ninguém buscou), vale o palpite", () => {
    expect(isTrulyFree("x/y:free", undefined, true)).toBe(true);
    expect(isTrulyFree("x/y", [], false)).toBe(false);
  });

  it("NIM: o _ e o . são o mesmo modelo", () => {
    expect(isTrulyFree("nvidia/llama-3.1-nemotron-safety-guard-8b-v3", ["nvidia/llama-3_1-nemotron-safety-guard-8b-v3"], false)).toBe(true);
  });

  it("OpenRouter mostra a cota da chave no rótulo", () => {
    const base = { free: true, dataSharing: false, tier: 1 };
    expect(freeTag("openrouter", "a/b:free", { ...base, quota: { limit: 50, remaining: 37 } })?.label).toBe("free · 50/day");
    expect(freeTag("openrouter", "a/b:free", { ...base, quota: { limit: 1000 } })?.label).toBe("free · 1,000/day");
    expect(freeTag("openrouter", "a/b:free", base)?.label).toBe("free");
    expect(freeTag("openrouter", "a/b:free", { ...base, quota: { limit: 50, remaining: 37 } })?.detail).toContain("37 were left");
  });

  it("NIM diz o limite por minuto; não grátis, nada", () => {
    expect(freeTag("nim", "meta/x", { free: true, dataSharing: false, tier: 1 })?.label).toBe("free · 40/min");
    expect(freeTag("nim", "meta/x", { free: false, dataSharing: false, tier: 1 })).toBeNull();
  });
});

describe("Google de verdade — o Rafael desconfiou, e com razão", () => {

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

  it("OpenRouter: o Lyria tem preço zero no catálogo mas cobra por clipe — NÃO é grátis", () => {
    expect(isFreeOnOpenRouter(lyria)).toBe(false);

    expect(isFreeOnOpenRouter({ ...lyria, architecture: { output_modalities: ["text"] } })).toBe(false);

    expect(isFreeOnOpenRouter({ ...lyria, description: "Music model." })).toBe(false);
  });

  it("OpenRouter: o Gemma :free é grátis declarado; o Ling sem sufixo, de texto e sem preço, também", () => {
    expect(isFreeOnOpenRouter(gemmaFree)).toBe(true);
    expect(isFreeOnOpenRouter(ling)).toBe(true);
  });

  it("OpenRouter: qualquer campo de preço acima de zero tira (imagem, áudio, busca…)", () => {
    expect(isFreeOnOpenRouter({ ...ling, pricing: { prompt: "0", completion: "0", image: "0.04" } })).toBe(false);
    expect(isFreeOnOpenRouter({ ...ling, pricing: { prompt: "0", completion: "0.0000004" } })).toBe(false);
  });

  it("Gemini: tier grátis só nos modelos que o Google lista assim", () => {
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

  it("Gemini: a etiqueta é 'free tier' de contorno (depende da conta), e o Nano Banana fica sem", () => {
    const base = { free: false, dataSharing: false, tier: 1 };
    const tag = freeTag("gemini", "gemini-2.5-flash", base);
    expect(tag).toMatchObject({ kind: "offer", label: "free tier" });
    expect(tag?.detail).toMatch(/without billing/);
    expect(freeTag("gemini", "gemini-2.5-flash-image", { ...base, free: true })).toBeNull();
  });
});
