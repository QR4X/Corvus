import { afterEach, describe, expect, it, vi } from "vitest";
import { __setRequestUrl } from "obsidian";
import { embedItems, embedOllama } from "../src/rag/embeddings";
import { inferEmbeddingSpec, pareceEmbeddingDoOllama, registerDiscoveredEmbeddings } from "../src/rag/types";
import { EMBEDDING_PROVIDERS } from "../src/rag/discovered";
import { ollamaProvider } from "../src/providers/ollama";

afterEach(() => {
  __setRequestUrl(null);
  vi.unstubAllGlobals();
  registerDiscoveredEmbeddings([]);
});

describe("os modelos de embedding do Ollama", () => {
  it("as famílias comuns se reconhecem pelo nome", () => {
    for (const m of ["nomic-embed-text:latest", "mxbai-embed-large", "bge-m3", "all-minilm:l6-v2", "snowflake-arctic-embed:m", "granite-embedding:278m", "embeddinggemma", "qwen3-embedding:0.6b"]) {
      expect(pareceEmbeddingDoOllama(m), m).toBe(true);
    }
    for (const m of ["llama3.2", "gemma3:4b", "qwen3:8b", "deepseek-r1", "mistral"]) {
      expect(pareceEmbeddingDoOllama(m), m).toBe(false);
    }
  });

  it("o spec é local, sem preço, e a dimensão é palpite pela família", () => {
    const nomic = inferEmbeddingSpec("ollama", "nomic-embed-text:latest");
    expect(nomic).toMatchObject({ provider: "ollama", local: true, free: true, pricePerMillion: 0, dim: 768 });
    expect(inferEmbeddingSpec("ollama", "mxbai-embed-large").dim).toBe(1024);
    expect(inferEmbeddingSpec("ollama", "all-minilm").dim).toBe(384);
    expect(EMBEDDING_PROVIDERS).toContain("ollama");
  });

  it("a lista junta o nome e o que o /api/show diz que é embedding", async () => {
    const pedidos: string[] = [];
    __setRequestUrl(async (o) => {
      const { url, body } = o as { url: string; body?: string };
      pedidos.push(url);
      if (url.endsWith("/api/tags")) {
        return { status: 200, json: { models: [{ name: "llama3.2" }, { name: "nomic-embed-text:latest" }, { name: "meu-embed-custom" }, { name: "x-encoder" }] } };
      }
      const model = JSON.parse(body ?? "{}").model;
      return { status: 200, json: { capabilities: model === "x-encoder" ? ["embedding"] : ["completion"] } };
    });
    const lista = await ollamaProvider.listEmbeddingModels("http://localhost:11434");
    expect(lista).toEqual(["meu-embed-custom", "nomic-embed-text:latest", "x-encoder"]);

    expect(pedidos.filter((u) => u.endsWith("/api/show"))).toHaveLength(2);
  });
});

describe("embedar no Ollama", () => {
  it("/api/embed com a lista inteira", async () => {
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    let corpo: Record<string, unknown> = {};
    __setRequestUrl(async (o) => {
      const { url, body } = o as { url: string; body: string };
      expect(url).toBe("http://localhost:11434/api/embed");
      corpo = JSON.parse(body);
      return { status: 200, json: { embeddings: [[0.1, 0.2], [0.3, 0.4]] } };
    });
    const v = await embedOllama(["a", "b"], "http://localhost:11434/", "nomic-embed-text");
    expect(v).toEqual([[0.1, 0.2], [0.3, 0.4]]);
    expect(corpo).toMatchObject({ model: "nomic-embed-text", input: ["a", "b"], truncate: true });
  });

  it("Ollama antigo (404 no /api/embed): um por vez no /api/embeddings", async () => {
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    __setRequestUrl(async (o) => {
      const { url, body } = o as { url: string; body: string };
      if (url.endsWith("/api/embed")) return { status: 404, text: "not found" };
      const prompt = JSON.parse(body).prompt as string;
      return { status: 200, json: { embedding: [prompt.length, 1] } };
    });
    expect(await embedOllama(["um", "três"], "http://h:11434", "m")).toEqual([[2, 1], [4, 1]]);
  });

  it("vetores faltando e servidor fora viram erro claro", async () => {
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    __setRequestUrl(async () => ({ status: 200, json: { embeddings: [[1]] } }));
    await expect(embedOllama(["a", "b"], "", "m")).rejects.toThrow(/1 vectors for 2 inputs/);
    __setRequestUrl(async () => {
      throw new Error("ECONNREFUSED");
    });
    await expect(embedOllama(["a"], "", "m")).rejects.toThrow(/Couldn't reach Ollama at http:\/\/localhost:11434.*is it running/);
  });

  it("o despacho do RAG manda o modelo local pro Ollama, com o endereço das settings", async () => {
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    registerDiscoveredEmbeddings([inferEmbeddingSpec("ollama", "nomic-embed-text")]);
    let url = "";
    __setRequestUrl(async (o) => {
      url = (o as { url: string }).url;
      return { status: 200, json: { embeddings: [[1, 0]] } };
    });
    await embedItems([{ kind: "text", text: "oi" }], { openaiApiKey: "", openrouterApiKey: "", ollamaEndpoint: "http://192.168.0.9:11434" }, "nomic-embed-text");
    expect(url).toBe("http://192.168.0.9:11434/api/embed");
  });
});
