import { describe, it, expect, afterEach } from "vitest";
import { __setRequestUrl } from "obsidian";
import { getModelCapabilities } from "../src/providers/modelCapabilities";
import {
  hydrateModelInfoCache,
  enrichModelsFromCatalog,
} from "../src/providers/modelInfoStore";
import { enrichOllamaCapabilities } from "../src/providers/ollama";

const CATALOG = {
  data: [
    {
      id: "lab/new-model-vl",
      architecture: {
        input_modalities: ["text", "image"],
        output_modalities: ["text"],
      },
      supported_parameters: ["tools"],
      pricing: { prompt: "0.000001", completion: "0.000002" },
    },
    {
      id: "lab/generator-1",
      architecture: {
        input_modalities: ["text"],
        output_modalities: ["text", "image"],
      },
      supported_parameters: [],
      pricing: { prompt: "0.000002", completion: "0" },
    },
  ],
};

describe("OpenRouter catalog fills model capabilities", () => {
  afterEach(() => {
    __setRequestUrl(null);
    hydrateModelInfoCache({});
  });

  it("enables vision and imageGen for models outside the curated tables", async () => {
    __setRequestUrl(async () => ({
      status: 200,
      json: CATALOG,
      text: "",
      headers: {},
    }));

    expect(getModelCapabilities("nim", "lab/new-model-vl").vision).toBe(false);

    const saved = await enrichModelsFromCatalog("nim", [
      "lab/new-model-vl",
      "lab/generator-1",
      "lab/not-in-catalog",
    ]);
    expect(saved).toBe(2);

    expect(getModelCapabilities("nim", "lab/new-model-vl")).toMatchObject({
      vision: true,
      tools: true,
    });
    expect(getModelCapabilities("nim", "lab/generator-1").imageGen).toBe(true);

    expect(getModelCapabilities("nim", "lab/not-in-catalog").vision).toBe(
      false
    );
  });

  it("does not overwrite cached entries, fetching once per model", async () => {
    __setRequestUrl(async () => ({
      status: 200,
      json: CATALOG,
      text: "",
      headers: {},
    }));

    hydrateModelInfoCache({
      "nim::lab/generator-1": { modalities: ["text"], outputModalities: ["text"] },
    });

    expect(await enrichModelsFromCatalog("nim", ["lab/generator-1"])).toBe(0);
    expect(getModelCapabilities("nim", "lab/generator-1").imageGen).toBeUndefined();
  });

  it("an offline catalog neither throws nor invents capabilities", async () => {
    __setRequestUrl(async () => {
      throw new Error("offline");
    });
    expect(await enrichModelsFromCatalog("openai", ["future-model-9000"])).toBe(0);
    expect(getModelCapabilities("openai", "future-model-9000").vision).toBe(
      false
    );

    expect(getModelCapabilities("openai", "gpt-4o").vision).toBe(true);
  });
});

describe("Ollama capabilities come from the server", () => {
  afterEach(() => {
    __setRequestUrl(null);
    hydrateModelInfoCache({});
  });

  it("marks gemma3 as vision capable from the server response", async () => {
    expect(getModelCapabilities("ollama", "gemma3:4b").vision).toBe(false);

    __setRequestUrl(async () => ({
      status: 200,
      json: { capabilities: ["completion", "vision", "tools"] },
      text: "",
      headers: {},
    }));
    expect(
      await enrichOllamaCapabilities("http://localhost:11434", ["gemma3:4b"])
    ).toBe(1);
    expect(getModelCapabilities("ollama", "gemma3:4b")).toMatchObject({
      vision: true,
      tools: true,
    });
  });

  it("an old server without capabilities saves nothing and the table decides", async () => {
    __setRequestUrl(async () => ({
      status: 200,
      json: { model_info: {} },
      text: "",
      headers: {},
    }));
    expect(
      await enrichOllamaCapabilities("http://localhost:11434", ["llava"])
    ).toBe(0);
    expect(getModelCapabilities("ollama", "llava").vision).toBe(true);
  });

  it("an unreachable server neither throws nor saves", async () => {
    __setRequestUrl(async () => {
      throw new Error("offline");
    });
    expect(
      await enrichOllamaCapabilities("http://localhost:11434", ["gemma4:2b"])
    ).toBe(0);
    expect(getModelCapabilities("ollama", "gemma4:2b").vision).toBe(false);
  });
});
