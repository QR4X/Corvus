import { afterEach, describe, expect, it } from "vitest";
import { __setRequestUrl } from "obsidian";
import { openrouterProvider, proximaPagina } from "../src/providers/openrouter";

afterEach(() => __setRequestUrl(null));

describe("embeddings do OpenRouter", () => {
  it("lê o endereço novo, segue a paginação, e não filtra pelo nome", async () => {
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

  it("se o endereço novo falhar, cai no catálogo antigo filtrando pelo nome", async () => {
    __setRequestUrl(async (o) => {
      const { url } = o as { url: string };
      if (url.includes("/embeddings/models")) return { status: 404, json: {} };
      return { status: 200, json: { data: [{ id: "openai/gpt-5" }, { id: "openai/text-embedding-3-large" }] } };
    });
    expect(await openrouterProvider.listEmbeddingModels("k")).toEqual(["openai/text-embedding-3-large"]);
  });

  it("sem chave: nada, sem sair", async () => {
    expect(await openrouterProvider.listEmbeddingModels("")).toEqual([]);
  });

  it("a próxima página só vale se for do próprio OpenRouter", () => {
    expect(proximaPagina({ links: { next: "https://openrouter.ai/api/v1/embeddings/models?offset=20" } })).toMatch(/offset=20/);
    expect(proximaPagina({ links: { next: "https://evil.example/x" } })).toBeNull();
    expect(proximaPagina({ links: {} })).toBeNull();
    expect(proximaPagina(null)).toBeNull();
  });
});
