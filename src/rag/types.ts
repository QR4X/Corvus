export interface VectorEntry {

  path: string;

  hash: string;

  chunkIndex: number;

  chunkCount: number;

  text: string;

  embedding: Float32Array | Int8Array;

  kind?: "text" | "image";
}

export interface StoredEntry {
  path: string;
  hash: string;
  chunkIndex: number;
  chunkCount: number;
  text: string;
  kind?: "text" | "image";

  emb: string;
}

export interface IndexFile {
  version: number;
  provider: string;
  model: string;
  dim: number;

  precision: "float32" | "int8";

  profile: string;

  lastIndexedAt: string;

  fileCount: number;
  entries: StoredEntry[];
}

export interface SearchResult {
  entry: VectorEntry;

  score: number;
}

export type EmbeddingProvider = "openai" | "openrouter" | "gemini" | "nim" | "ollama";

export interface EmbeddingModelSpec {
  provider: EmbeddingProvider;

  model: string;

  dim: number;

  maxInputTokens: number;

  pricePerMillion: number;

  supportsImage?: boolean;

  supportsDimensions?: boolean;

  free?: boolean;

  discovered?: boolean;

  local?: boolean;
}

export const EMBEDDING_MODELS: EmbeddingModelSpec[] = [
  {
    provider: "openai",
    model: "text-embedding-3-small",
    dim: 1536,
    maxInputTokens: 8191,
    pricePerMillion: 0.02,
    supportsDimensions: true,
  },
  {
    provider: "openai",
    model: "text-embedding-3-large",
    dim: 3072,
    maxInputTokens: 8191,
    pricePerMillion: 0.13,
    supportsDimensions: true,
  },
  {
    provider: "openrouter",
    model: "nvidia/llama-nemotron-embed-vl-1b-v2:free",
    dim: 2048,
    maxInputTokens: 131000,
    pricePerMillion: 0,
    supportsImage: true,
    free: true,
  },

  {
    provider: "gemini",
    model: "gemini-embedding-001",
    dim: 3072,
    maxInputTokens: 2048,
    pricePerMillion: 0.15,
    supportsDimensions: true,
  },
  {
    provider: "gemini",
    model: "text-embedding-004",
    dim: 768,
    maxInputTokens: 2048,
    pricePerMillion: 0,
  },

  {
    provider: "nim",
    model: "nvidia/nv-embedqa-e5-v5",
    dim: 1024,
    maxInputTokens: 512,
    pricePerMillion: 0,
  },
  {
    provider: "nim",
    model: "nvidia/llama-3.2-nv-embedqa-1b-v2",
    dim: 2048,
    maxInputTokens: 8192,
    pricePerMillion: 0,
  },

  {
    provider: "openai",
    model: "text-embedding-ada-002",
    dim: 1536,
    maxInputTokens: 8191,
    pricePerMillion: 0.1,
  },
];

let DISCOVERED_EMBEDDINGS: EmbeddingModelSpec[] = [];

export function registerDiscoveredEmbeddings(specs: EmbeddingModelSpec[]): void {
  DISCOVERED_EMBEDDINGS = specs;
}

export function getAllEmbeddingModels(): EmbeddingModelSpec[] {
  const seen = new Set(EMBEDDING_MODELS.map((m) => m.model));
  const extra = DISCOVERED_EMBEDDINGS.filter((m) => !seen.has(m.model));
  return [...EMBEDDING_MODELS, ...extra];
}

export function isEmbeddingModelId(id: string): boolean {
  return /embed/i.test(id);
}

export function pareceEmbeddingDoOllama(nome: string): boolean {
  return /(embed|bge|minilm|\be5\b|e5-|gte|nomic|mxbai|snowflake-arctic|granite-embedding|paraphrase|jina)/i.test(nome);
}

function dimDoOllama(id: string): number {
  if (/minilm|granite-embedding:30m|arctic-embed:(xs|s)\b|arctic-embed:2[23]m/.test(id)) return 384;
  if (/qwen3-embedding:8b/.test(id)) return 4096;
  if (/qwen3-embedding:4b/.test(id)) return 2560;
  if (/mxbai|bge-m3|bge-large|arctic-embed(:l|:335m|$|:latest)|qwen3-embedding/.test(id)) return 1024;
  return 768; 
}

export function inferEmbeddingSpec(
  provider: EmbeddingProvider,
  model: string
): EmbeddingModelSpec {
  const curated = EMBEDDING_MODELS.find((m) => m.model === model);
  if (curated) return curated;

  const id = model.toLowerCase();

  if (provider === "ollama") {
    return {
      provider,
      model,
      dim: dimDoOllama(id),
      maxInputTokens: 8192,
      pricePerMillion: 0,
      free: true,
      local: true,
      discovered: true,
    };
  }

  let dim = 1536;
  if (id.includes("3-large") || id.includes("gemini-embedding")) dim = 3072;
  else if (id.includes("004")) dim = 768;
  else if (id.includes("nv-embedqa-e5") || id.includes("e5-v5")) dim = 1024;
  else if (id.includes("nemotron-embed") || id.includes("nv-embedqa-1b") || id.includes("-2048")) dim = 2048;
  else if (id.includes("3-small") || id.includes("ada-002")) dim = 1536;

  const supportsImage = /(\bvl\b|vision|multimodal|embed-vl)/.test(id);
  const supportsDimensions =
    id.includes("text-embedding-3") || id.includes("gemini-embedding");

  const free = provider === "openrouter" && id.includes(":free");

  return {
    provider,
    model,
    dim,
    maxInputTokens: 8192,
    pricePerMillion: free ? 0 : 0.1, 
    ...(supportsImage ? { supportsImage: true } : {}),
    ...(supportsDimensions ? { supportsDimensions: true } : {}),
    ...(free ? { free: true } : {}),
    discovered: true,
  };
}

export function getEmbeddingSpec(model: string): EmbeddingModelSpec {
  return (
    getAllEmbeddingModels().find((m) => m.model === model) ?? EMBEDDING_MODELS[0]
  );
}

export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"] as const;

export function isImagePath(path: string): boolean {
  const ext = path.toLowerCase().split(".").pop() ?? "";
  return (IMAGE_EXTENSIONS as readonly string[]).includes(ext);
}

export function imageMimeFromPath(path: string): string {
  const ext = path.toLowerCase().split(".").pop() ?? "";
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
}
