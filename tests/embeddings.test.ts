import { describe, it, expect, afterEach } from "vitest";
import {
  isEmbeddingModelId,
  inferEmbeddingSpec,
  getAllEmbeddingModels,
  getEmbeddingSpec,
  registerDiscoveredEmbeddings,
} from "../src/rag/types";

afterEach(() => registerDiscoveredEmbeddings([]));

describe("isEmbeddingModelId", () => {
  it("recognizes embedding ids", () => {
    expect(isEmbeddingModelId("text-embedding-3-small")).toBe(true);
    expect(isEmbeddingModelId("text-embedding-ada-002")).toBe(true);
    expect(isEmbeddingModelId("nvidia/nv-embedqa-e5-v5")).toBe(true);
    expect(isEmbeddingModelId("gemini-embedding-001")).toBe(true);
  });
  it("ignores chat and generation models", () => {
    expect(isEmbeddingModelId("gpt-4o")).toBe(false);
    expect(isEmbeddingModelId("claude-opus-4-8")).toBe(false);
    expect(isEmbeddingModelId("dall-e-3")).toBe(false);
  });
});

describe("inferEmbeddingSpec", () => {
  it("uses the curated spec when the model is known", () => {
    const s = inferEmbeddingSpec("openai", "text-embedding-3-large");
    expect(s.dim).toBe(3072);
    expect(s.discovered).toBeUndefined();
  });

  it("infers the dimension from the name for unknown models", () => {
    expect(inferEmbeddingSpec("openai", "text-embedding-3-large-2025").dim).toBe(3072);
    expect(inferEmbeddingSpec("gemini", "text-embedding-004").dim).toBe(768);
    expect(inferEmbeddingSpec("nim", "nvidia/nv-embedqa-e5-v5-next").dim).toBe(1024);

    expect(inferEmbeddingSpec("openai", "embed-mystery").dim).toBe(1536);
  });

  it("marks the spec as discovered and infers image and free flags", () => {
    const vl = inferEmbeddingSpec("openrouter", "vendor/embed-vl-2b:free");
    expect(vl.discovered).toBe(true);
    expect(vl.supportsImage).toBe(true);
    expect(vl.free).toBe(true);

    expect(inferEmbeddingSpec("nim", "vendor/embed-x").free).toBeUndefined();
    expect(inferEmbeddingSpec("gemini", "text-embedding-004").free).toBeUndefined();
  });
});

describe("discovered model registry", () => {
  it("getAllEmbeddingModels merges curated and discovered models without duplicates", () => {
    const before = getAllEmbeddingModels().length;
    registerDiscoveredEmbeddings([
      inferEmbeddingSpec("openai", "text-embedding-9-ultra"),

      inferEmbeddingSpec("openai", "text-embedding-3-small"),
    ]);
    const all = getAllEmbeddingModels();
    expect(all.length).toBe(before + 1);
    expect(all.some((m) => m.model === "text-embedding-9-ultra")).toBe(true);
  });

  it("getEmbeddingSpec finds a discovered model instead of falling back", () => {
    registerDiscoveredEmbeddings([
      inferEmbeddingSpec("nim", "nvidia/nv-embedqa-mystery-v9"),
    ]);
    const spec = getEmbeddingSpec("nvidia/nv-embedqa-mystery-v9");
    expect(spec.model).toBe("nvidia/nv-embedqa-mystery-v9");
    expect(spec.provider).toBe("nim");
  });

  it("getEmbeddingSpec falls back to the first curated model for an unknown id", () => {
    expect(getEmbeddingSpec("missing-xyz").model).toBe(
      "text-embedding-3-small"
    );
  });
});
