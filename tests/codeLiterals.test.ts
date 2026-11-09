import { describe, it, expect, afterEach } from "vitest";
import { __setRequestUrl } from "obsidian";
import { definirGratisConhecidos, getPricing } from "../src/usage/pricing";
import { fetchAndCacheModelInfo } from "../src/providers/modelInfoStore";
import { getModelCard } from "../src/providers/modelDescriptions";
import { openaiFreeTierForModel } from "../src/usage/freeTokens";
import { gratisDeVerdade } from "../src/usage/freeTag";

describe("painel de uso: custo zero só pro que é grátis de verdade", () => {
  it("NIM sem a mark Free Endpoint: custo desconhecido, não US$ 0", () => {
    const p = getPricing("nim", "meta/llama-3.1-70b-instruct");
    expect(p.tier).toBe("unknown");
    expect(p.inputPerMillion).toBeNull();
  });

  it("NIM com a mark (vinda do fetch): grátis, inclusive com o _ da NVIDIA", () => {
    definirGratisConhecidos("nim", ["deepseek-ai/deepseek-v4.1-flash", "nvidia/llama-3_1-nemotron-safety-guard-8b-v3"]);
    expect(getPricing("nim", "deepseek-ai/deepseek-v4.1-flash")).toMatchObject({ tier: "free", inputPerMillion: 0 });
    expect(getPricing("nim", "nvidia/llama-3.1-nemotron-safety-guard-8b-v3").tier).toBe("free");
    expect(getPricing("nim", "meta/llama-3.1-70b-instruct").tier).toBe("unknown");
  });

  it("OpenRouter: grátis sem :free (descoberto pelo preço) custa zero; o resto segue a tabela", () => {
    definirGratisConhecidos("openrouter", ["inclusionai/ling-3.1-flash"]);
    expect(getPricing("openrouter", "inclusionai/ling-3.1-flash").tier).toBe("free");
    expect(getPricing("openrouter", "google/lyria-3-clip-preview").tier).toBe("unknown");
  });
});

describe("cache do catálogo: o Lyria não volta como grátis pelo palpite", () => {
  afterEach(() => __setRequestUrl(null));

  it("preço zero por token, mas música cobrada por clipe → unknown, não free", async () => {
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
    const lyria = await fetchAndCacheModelInfo("openrouter", "google/lyria-3-clip-preview");
    expect(lyria?.tier).toBe("unknown");
    const gemma = await fetchAndCacheModelInfo("openrouter", "google/gemma-4-31b-it:free");
    expect(gemma?.tier).toBe("free");
  });
});

describe("descrições que prometiam grátis", () => {
  it("o Nano Banana diz que é pago, sem tier grátis", () => {
    const c = getModelCard("gemini", "gemini-2.5-flash-image");
    expect(c.description).not.toMatch(/free tier \d/i);
    expect(c.description).toMatch(/no free tier/i);
    expect(c.goodFor ?? "").not.toMatch(/free/i);
  });

  it("o SD3 do NIM não promete tier grátis", () => {
    expect(getModelCard("nim", "stabilityai/stable-diffusion-3-medium").description).not.toMatch(/free/i);
  });
});

describe("cota grátis da OpenAI (data sharing): o balde certo", () => {
  it("os -mini/-nano dos GPT-5.x vão pro balde pequeno (2,5M), não pro grande", () => {
    expect(openaiFreeTierForModel("gpt-5.1-mini")).toBe("mini");
    expect(openaiFreeTierForModel("gpt-5.2-nano")).toBe("mini");
    expect(openaiFreeTierForModel("gpt-5-mini")).toBe("mini");
    expect(openaiFreeTierForModel("gpt-5.5")).toBe("big");
    expect(openaiFreeTierForModel("gpt-image-1")).toBeNull();
  });
});

describe("a variante :free é grátis mesmo fora da lista do fetch", () => {
  it("o embedding Nemotron VL :free não depende da lista do chat", () => {
    expect(gratisDeVerdade("nvidia/llama-nemotron-embed-vl-1b-v2:free", ["outro/modelo"], false)).toBe(true);
  });
});
