import { Platform } from "obsidian";
import { getEnrichedInfo } from "./modelInfoStore";

export interface ModelCapabilities {

  vision: boolean;

  tools: boolean;

  streaming: boolean;

  free?: boolean;

  imageGen?: boolean;

  audioGen?: boolean;

  videoGen?: boolean;

  pdf?: boolean;
}

const DEFAULT_CAPS: ModelCapabilities = {
  vision: false,
  tools: false,
  streaming: true,
};

const FALLBACK_BY_PROVIDER: Record<string, ModelCapabilities> = {
  openrouter: { vision: false, tools: true, streaming: true },
  nim: { vision: false, tools: true, streaming: false },
};

interface CapsEntry {
  prefix: string;
  caps: ModelCapabilities;
}

const ENTRIES_BY_PROVIDER: Record<string, CapsEntry[]> = {

  openai: [

    { prefix: "dall-e-3", caps: { vision: false, tools: false, streaming: false, imageGen: true } },
    { prefix: "dall-e-2", caps: { vision: false, tools: false, streaming: false, imageGen: true } },
    { prefix: "gpt-image", caps: { vision: false, tools: false, streaming: false, imageGen: true } },

    { prefix: "tts-1-hd", caps: { vision: false, tools: false, streaming: false, audioGen: true } },
    { prefix: "tts-1", caps: { vision: false, tools: false, streaming: false, audioGen: true } },
    { prefix: "gpt-4o-mini-tts", caps: { vision: false, tools: false, streaming: false, audioGen: true } },

    { prefix: "sora", caps: { vision: false, tools: false, streaming: false, videoGen: true } },

    { prefix: "gpt-4o-mini", caps: { vision: true, tools: true, streaming: true } },

    { prefix: "gpt-4o", caps: { vision: true, tools: true, streaming: true } },
    { prefix: "gpt-5", caps: { vision: true, tools: true, streaming: true } },

    { prefix: "o1-mini", caps: { vision: false, tools: false, streaming: true } },
    { prefix: "o1", caps: { vision: true, tools: false, streaming: true } },
    { prefix: "o3-mini", caps: { vision: false, tools: true, streaming: true } },
    { prefix: "o3", caps: { vision: true, tools: true, streaming: true } },
    { prefix: "o4", caps: { vision: true, tools: true, streaming: true } },
  ],

  anthropic: [

    { prefix: "claude-fable", caps: { vision: true, tools: true, streaming: true } },

    { prefix: "claude-opus-4", caps: { vision: true, tools: true, streaming: true } },
    { prefix: "claude-sonnet-4", caps: { vision: true, tools: true, streaming: true } },
    { prefix: "claude-haiku-4", caps: { vision: true, tools: true, streaming: true } },
    { prefix: "claude-3", caps: { vision: true, tools: true, streaming: true } },
    { prefix: "claude-2", caps: { vision: false, tools: false, streaming: true } },
  ],

  gemini: [

    { prefix: "gemini-2.5-flash-image", caps: { vision: true, tools: false, streaming: false, imageGen: true } },
    { prefix: "gemini-2.0-flash-exp-image", caps: { vision: true, tools: false, streaming: false, imageGen: true } },
    { prefix: "imagen-3", caps: { vision: false, tools: false, streaming: false, imageGen: true } },
    { prefix: "imagen-4", caps: { vision: false, tools: false, streaming: false, imageGen: true } },
    { prefix: "imagen-", caps: { vision: false, tools: false, streaming: false, imageGen: true } },

    { prefix: "gemini-2.5-flash-preview-tts", caps: { vision: false, tools: false, streaming: false, audioGen: true } },

    { prefix: "veo", caps: { vision: false, tools: false, streaming: false, videoGen: true } },

    { prefix: "gemini-3", caps: { vision: true, tools: true, streaming: true } },
    { prefix: "gemini-2.5", caps: { vision: true, tools: true, streaming: true } },
    { prefix: "gemini-2.0", caps: { vision: true, tools: true, streaming: true } },
    { prefix: "gemini-1.5", caps: { vision: true, tools: true, streaming: true } },
    { prefix: "gemini-1.0", caps: { vision: true, tools: false, streaming: true } },
  ],

  openrouter: [

    { prefix: "openrouter/auto", caps: { vision: true, tools: true, streaming: true } },

    { prefix: "anthropic/claude-3", caps: { vision: true, tools: true, streaming: true } },
    { prefix: "anthropic/claude-4", caps: { vision: true, tools: true, streaming: true } },
    { prefix: "anthropic/claude-", caps: { vision: true, tools: true, streaming: true } },

    { prefix: "openai/gpt-4o", caps: { vision: true, tools: true, streaming: true } },
    { prefix: "openai/gpt-5", caps: { vision: true, tools: true, streaming: true } },
    { prefix: "openai/o", caps: { vision: true, tools: true, streaming: true } },

    { prefix: "google/gemini-3", caps: { vision: true, tools: true, streaming: true } },
    { prefix: "google/gemini-2", caps: { vision: true, tools: true, streaming: true } },
    { prefix: "google/gemini-1.5", caps: { vision: true, tools: true, streaming: true } },
    { prefix: "google/gemini", caps: { vision: true, tools: false, streaming: true } },
    { prefix: "google/gemma", caps: { vision: false, tools: false, streaming: true } },

    { prefix: "meta-llama/llama-3.3", caps: { vision: false, tools: true, streaming: true } },
    { prefix: "meta-llama/llama-3.2-vision", caps: { vision: true, tools: true, streaming: true } },
    { prefix: "meta-llama/llama-3.2", caps: { vision: false, tools: true, streaming: true } },
    { prefix: "meta-llama/llama-3.1", caps: { vision: false, tools: true, streaming: true } },

    { prefix: "mistralai/pixtral", caps: { vision: true, tools: true, streaming: true } },
    { prefix: "mistralai/", caps: { vision: false, tools: true, streaming: true } },
    { prefix: "qwen/qwen2.5-vl", caps: { vision: true, tools: true, streaming: true } },
    { prefix: "qwen/qwen-vl", caps: { vision: true, tools: true, streaming: true } },
    { prefix: "qwen/qwen", caps: { vision: false, tools: true, streaming: true } },
    { prefix: "deepseek/deepseek-vl", caps: { vision: true, tools: true, streaming: true } },
    { prefix: "deepseek/", caps: { vision: false, tools: true, streaming: true } },

    { prefix: "x-ai/grok-4", caps: { vision: true, tools: true, streaming: true } },
    { prefix: "x-ai/", caps: { vision: false, tools: true, streaming: true } },
    { prefix: "amazon/nova", caps: { vision: true, tools: true, streaming: true } },
    { prefix: "cohere/", caps: { vision: false, tools: true, streaming: true } },
    { prefix: "moonshotai/", caps: { vision: false, tools: true, streaming: true } },
    { prefix: "z-ai/", caps: { vision: false, tools: true, streaming: true } },
    { prefix: "nvidia/", caps: { vision: false, tools: true, streaming: true } },
    { prefix: "microsoft/", caps: { vision: false, tools: true, streaming: true } },

    { prefix: "perplexity/", caps: { vision: false, tools: false, streaming: true } },

  ],

  nim: [

    { prefix: "stabilityai/stable-diffusion", caps: { vision: false, tools: false, streaming: false, imageGen: true, free: true } },
    { prefix: "stabilityai/sdxl", caps: { vision: false, tools: false, streaming: false, imageGen: true, free: true } },
    { prefix: "black-forest-labs/flux", caps: { vision: false, tools: false, streaming: false, imageGen: true, free: true } },
    { prefix: "shutterstock/", caps: { vision: false, tools: false, streaming: false, imageGen: true, free: true } },

    { prefix: "nvidia/llama-3.2-nv-embedqa", caps: { vision: false, tools: false, streaming: false } },
    { prefix: "nvidia/llama-nemotron-embed", caps: { vision: true, tools: false, streaming: false } },
    { prefix: "nvidia/vila", caps: { vision: true, tools: false, streaming: false } },
    { prefix: "nvidia/llama-3.2-90b-vision", caps: { vision: true, tools: true, streaming: false } },
    { prefix: "nvidia/llama-3.2-11b-vision", caps: { vision: true, tools: true, streaming: false } },
    { prefix: "nvidia/", caps: { vision: false, tools: true, streaming: false } },
    { prefix: "meta/llama-3.2-90b-vision", caps: { vision: true, tools: true, streaming: false } },
    { prefix: "meta/llama-3.2-11b-vision", caps: { vision: true, tools: true, streaming: false } },
    { prefix: "meta/llama-3.3", caps: { vision: false, tools: true, streaming: false } },
    { prefix: "meta/llama-3.1", caps: { vision: false, tools: true, streaming: false } },
    { prefix: "meta/", caps: { vision: false, tools: true, streaming: false } },
    { prefix: "qwen/qwen2-vl", caps: { vision: true, tools: true, streaming: false } },
    { prefix: "qwen/qwen2.5-vl", caps: { vision: true, tools: true, streaming: false } },
    { prefix: "qwen/", caps: { vision: false, tools: true, streaming: false } },
    { prefix: "deepseek-ai/", caps: { vision: false, tools: true, streaming: false } },
    { prefix: "microsoft/phi-4", caps: { vision: false, tools: true, streaming: false } },
    { prefix: "microsoft/", caps: { vision: false, tools: false, streaming: false } },
    { prefix: "mistralai/", caps: { vision: false, tools: true, streaming: false } },
    { prefix: "google/gemma", caps: { vision: false, tools: false, streaming: false } },
  ],

  ollama: [
    { prefix: "llava", caps: { vision: true, tools: false, streaming: true, free: true } },
    { prefix: "bakllava", caps: { vision: true, tools: false, streaming: true, free: true } },
    { prefix: "minicpm-v", caps: { vision: true, tools: false, streaming: true, free: true } },
    { prefix: "moondream", caps: { vision: true, tools: false, streaming: true, free: true } },
    { prefix: "llama3.2-vision", caps: { vision: true, tools: true, streaming: true, free: true } },
    { prefix: "llama3.2", caps: { vision: false, tools: true, streaming: true, free: true } },
    { prefix: "llama3.1", caps: { vision: false, tools: true, streaming: true, free: true } },
    { prefix: "llama3.3", caps: { vision: false, tools: true, streaming: true, free: true } },
    { prefix: "qwen2.5-vl", caps: { vision: true, tools: true, streaming: true, free: true } },
    { prefix: "qwen2.5", caps: { vision: false, tools: true, streaming: true, free: true } },

    { prefix: "qwen3.5", caps: { vision: true, tools: true, streaming: true, free: true } },
    { prefix: "qwen3", caps: { vision: false, tools: true, streaming: true, free: true } },
    { prefix: "mistral-large", caps: { vision: false, tools: true, streaming: true, free: true } },
    { prefix: "mistral", caps: { vision: false, tools: false, streaming: true, free: true } },
    { prefix: "deepseek-r1", caps: { vision: false, tools: true, streaming: true, free: true } },
    { prefix: "deepseek", caps: { vision: false, tools: false, streaming: true, free: true } },
    { prefix: "phi", caps: { vision: false, tools: false, streaming: true, free: true } },
    { prefix: "gemma", caps: { vision: false, tools: false, streaming: true, free: true } },
  ],
};

const FREE_DAILY_OPENAI: Record<string, number> = {};
for (const m of ["gpt-5.4", "gpt-5.2", "gpt-5.1", "gpt-5", "gpt-4.1", "gpt-4o", "o1", "o3"])
  FREE_DAILY_OPENAI[m] = 250_000;
for (const m of [
  "gpt-5.4-mini",
  "gpt-5.4-nano",
  "gpt-5-mini",
  "gpt-5-nano",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "gpt-4o-mini",
  "o3-mini",
  "o4-mini",
])
  FREE_DAILY_OPENAI[m] = 2_500_000;

export function getFreeDailyTokens(provider: string, model: string): number | null {
  if (provider !== "openai" || !model) return null;
  const id = model.toLowerCase().replace(/-\d{4}-\d{2}-\d{2}$/, "");
  return FREE_DAILY_OPENAI[id] ?? null;
}

export function getModelCapabilities(
  provider: string,
  model: string
): ModelCapabilities {
  if (!model) return { ...DEFAULT_CAPS };

  const fallback = FALLBACK_BY_PROVIDER[provider] ?? DEFAULT_CAPS;
  const entries = ENTRIES_BY_PROVIDER[provider];
  const lower = model.toLowerCase();

  let matched: ModelCapabilities | null = null;
  if (entries) {
    for (const entry of entries) {
      if (lower.startsWith(entry.prefix.toLowerCase())) {
        matched = entry.caps;
        break;
      }
    }
  }

  const caps: ModelCapabilities = matched ? { ...matched } : { ...fallback };

  const enriched = getEnrichedInfo(provider, model);
  if (enriched) {
    if (enriched.supportsTools != null) {
      if (provider === "openrouter") caps.tools = enriched.supportsTools;
      else if (enriched.supportsTools) caps.tools = true;
    }
    if (enriched.modalities?.includes("image")) caps.vision = true;
    if (enriched.outputModalities?.includes("image")) caps.imageGen = true;
    if (enriched.tier === "free") caps.free = true;
  }

  if (provider === "openrouter" && lower.endsWith(":free")) caps.free = true;

  if (getFreeDailyTokens(provider, model) !== null) caps.free = true;

  if (
    provider === "nim" &&
    !Platform.isMobile &&
    !caps.streaming &&
    !(caps.imageGen || caps.audioGen || caps.videoGen)
  ) {
    caps.streaming = true;
  }

  caps.pdf = supportsPdf(provider, model, caps);

  return caps;
}

export function supportsPdf(
  provider: string,
  model: string,
  caps: Pick<ModelCapabilities, "vision" | "imageGen" | "audioGen" | "videoGen">
): boolean {
  if (!model) return false;

  if (caps.imageGen || caps.audioGen || caps.videoGen) return false;
  const lower = model.toLowerCase();
  switch (provider) {
    case "anthropic":
      if (!lower.startsWith("claude")) return false;
      return !/^claude-(2|instant|3-(opus|sonnet|haiku))/.test(lower);
    case "openai":
      return !!caps.vision;
    case "openrouter":
      return true;
    default:
      return false;
  }
}

export type CapabilityBadgeId =
  | "vision"
  | "tools"
  | "stream"
  | "free"
  | "img-gen"
  | "audio-gen"
  | "video-gen";

export function isGenerationModel(caps: ModelCapabilities): boolean {
  return Boolean(caps.imageGen || caps.audioGen || caps.videoGen);
}
