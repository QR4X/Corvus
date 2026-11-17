import { afterEach, describe, expect, it } from "vitest";
import { __setRequestUrl } from "obsidian";
import { openrouterProvider, nextPageUrl } from "../src/providers/openrouter";

afterEach(() => __setRequestUrl(null));

describe("OpenRouter embeddings", () => {
  it("reads the new endpoint, follows pagination and does not filter by name", async () => {
    const urls: string[] = [];
    __setRequestUrl(async (o) => {
      const { url } = o as { url: string };
      urls.push(url);
      if (url === "https://openrouter.ai/api/v1/embeddings/models") {
        return {
          status: 200,
          json: {
            data: [{ id: "openai/text-embedding-3-small" }, { id: "baai/bge-m3" }],
            links: { next: "https://openrouter.ai/api/v1/embeddings/models?offset=2" },
          },
        };
      }
      return { status: 200, json: { data: [{ id: "nvidia/llama-nemotron-embed-vl-1b-v2:free" }], links: { next: null } } };
    });
    expect(await openrouterProvider.listEmbeddingModels("k")).toEqual([
      "baai/bge-m3",
      "nvidia/llama-nemotron-embed-vl-1b-v2:free",
      "openai/text-embedding-3-small",
    ]);
    expect(urls).toHaveLength(2);
  });

  it("falls back to the old catalog filtered by name when the new endpoint fails", async () => {
    __setRequestUrl(async (o) => {
      const { url } = o as { url: string };
      if (url.includes("/embeddings/models")) return { status: 404, json: {} };
      return { status: 200, json: { data: [{ id: "openai/gpt-5" }, { id: "openai/text-embedding-3-large" }] } };
    });
    expect(await openrouterProvider.listEmbeddingModels("k")).toEqual(["openai/text-embedding-3-large"]);
  });

  it("returns nothing without a key", async () => {
    expect(await openrouterProvider.listEmbeddingModels("")).toEqual([]);
  });

  it("follows the next page only on OpenRouter itself", () => {
    expect(nextPageUrl({ links: { next: "https://openrouter.ai/api/v1/embeddings/models?offset=20" } })).toMatch(/offset=20/);
    expect(nextPageUrl({ links: { next: "https://evil.example/x" } })).toBeNull();
    expect(nextPageUrl({ links: {} })).toBeNull();
    expect(nextPageUrl(null)).toBeNull();
  });
});
