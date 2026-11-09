export interface ModelPricing {

  inputPerMillion: number | null;

  outputPerMillion: number | null;

  imagePerCall?: number;

  charPerMillion?: number;

  tier?: "free" | "paid" | "unknown";

  asOf?: string;
}

interface PricingEntry {
  prefix: string;
  pricing: ModelPricing;
}

const PRICES_BY_PROVIDER: Record<string, PricingEntry[]> = {

  openai: [

    { prefix: "gpt-5-nano", pricing: { inputPerMillion: 0.05, outputPerMillion: 0.40, tier: "paid", asOf: "2026-06" } },
    { prefix: "gpt-5-mini", pricing: { inputPerMillion: 0.25, outputPerMillion: 2.00, tier: "paid", asOf: "2026-06" } },
    { prefix: "gpt-5", pricing: { inputPerMillion: 1.25, outputPerMillion: 10.00, tier: "paid", asOf: "2026-06" } },

    { prefix: "gpt-4o-mini", pricing: { inputPerMillion: 0.15, outputPerMillion: 0.60, tier: "paid", asOf: "2026-06" } },
    { prefix: "gpt-4o", pricing: { inputPerMillion: 2.50, outputPerMillion: 10.00, tier: "paid", asOf: "2026-06" } },

    { prefix: "o4-mini", pricing: { inputPerMillion: 1.10, outputPerMillion: 4.40, tier: "paid", asOf: "2026-06" } },
    { prefix: "o4", pricing: { inputPerMillion: 7.50, outputPerMillion: 30.00, tier: "paid", asOf: "2026-06" } },
    { prefix: "o3-mini", pricing: { inputPerMillion: 1.10, outputPerMillion: 4.40, tier: "paid", asOf: "2026-06" } },
    { prefix: "o3", pricing: { inputPerMillion: 2.00, outputPerMillion: 8.00, tier: "paid", asOf: "2026-06" } },
    { prefix: "o1-mini", pricing: { inputPerMillion: 1.10, outputPerMillion: 4.40, tier: "paid", asOf: "2026-06" } },
    { prefix: "o1", pricing: { inputPerMillion: 15.00, outputPerMillion: 60.00, tier: "paid", asOf: "2026-06" } },

    { prefix: "dall-e-3", pricing: { inputPerMillion: null, outputPerMillion: null, imagePerCall: 0.040, tier: "paid", asOf: "2026-06" } },
    { prefix: "dall-e-2", pricing: { inputPerMillion: null, outputPerMillion: null, imagePerCall: 0.020, tier: "paid", asOf: "2026-06" } },
    { prefix: "gpt-image-1", pricing: { inputPerMillion: 5.00, outputPerMillion: 40.00, imagePerCall: 0.042, tier: "paid", asOf: "2026-06" } },

    { prefix: "tts-1-hd", pricing: { inputPerMillion: null, outputPerMillion: null, charPerMillion: 30.00, tier: "paid", asOf: "2026-06" } },
    { prefix: "tts-1", pricing: { inputPerMillion: null, outputPerMillion: null, charPerMillion: 15.00, tier: "paid", asOf: "2026-06" } },
    { prefix: "gpt-4o-mini-tts", pricing: { inputPerMillion: 0.60, outputPerMillion: 12.00, charPerMillion: 12.00, tier: "paid", asOf: "2026-06" } },
  ],

  anthropic: [

    { prefix: "claude-fable-5", pricing: { inputPerMillion: null, outputPerMillion: null, tier: "paid", asOf: "2026-06" } },
    { prefix: "claude-opus-4-8", pricing: { inputPerMillion: 15.00, outputPerMillion: 75.00, tier: "paid", asOf: "2026-06" } },
    { prefix: "claude-opus-4", pricing: { inputPerMillion: 15.00, outputPerMillion: 75.00, tier: "paid", asOf: "2026-06" } },
    { prefix: "claude-sonnet-4-6", pricing: { inputPerMillion: 3.00, outputPerMillion: 15.00, tier: "paid", asOf: "2026-06" } },
    { prefix: "claude-sonnet-4", pricing: { inputPerMillion: 3.00, outputPerMillion: 15.00, tier: "paid", asOf: "2026-06" } },
    { prefix: "claude-haiku-4", pricing: { inputPerMillion: 1.00, outputPerMillion: 5.00, tier: "paid", asOf: "2026-06" } },
    { prefix: "claude-3-5-sonnet", pricing: { inputPerMillion: 3.00, outputPerMillion: 15.00, tier: "paid", asOf: "2026-06" } },
    { prefix: "claude-3-5-haiku", pricing: { inputPerMillion: 0.80, outputPerMillion: 4.00, tier: "paid", asOf: "2026-06" } },
    { prefix: "claude-3-opus", pricing: { inputPerMillion: 15.00, outputPerMillion: 75.00, tier: "paid", asOf: "2026-06" } },
    { prefix: "claude-3-sonnet", pricing: { inputPerMillion: 3.00, outputPerMillion: 15.00, tier: "paid", asOf: "2026-06" } },
    { prefix: "claude-3-haiku", pricing: { inputPerMillion: 0.25, outputPerMillion: 1.25, tier: "paid", asOf: "2026-06" } },
  ],

  gemini: [

    { prefix: "gemini-2.5-flash-image", pricing: { inputPerMillion: 0.30, outputPerMillion: 30.00, imagePerCall: 0.039, tier: "paid", asOf: "2026-06" } },
    { prefix: "imagen-3", pricing: { inputPerMillion: null, outputPerMillion: null, imagePerCall: 0.040, tier: "paid", asOf: "2026-06" } },
    { prefix: "imagen-4", pricing: { inputPerMillion: null, outputPerMillion: null, imagePerCall: 0.040, tier: "paid", asOf: "2026-06" } },

    { prefix: "gemini-2.5-flash-preview-tts", pricing: { inputPerMillion: null, outputPerMillion: null, charPerMillion: 0.50, tier: "free", asOf: "2026-06" } },

    { prefix: "gemini-3-pro", pricing: { inputPerMillion: 1.25, outputPerMillion: 5.00, tier: "paid", asOf: "2026-06" } },
    { prefix: "gemini-3.5-flash", pricing: { inputPerMillion: 0.075, outputPerMillion: 0.30, tier: "paid", asOf: "2026-06" } },
    { prefix: "gemini-3.1-flash-lite", pricing: { inputPerMillion: 0.05, outputPerMillion: 0.20, tier: "paid", asOf: "2026-06" } },

    { prefix: "gemini-2.5-pro", pricing: { inputPerMillion: 1.25, outputPerMillion: 5.00, tier: "paid", asOf: "2026-06" } },
    { prefix: "gemini-2.5-flash-lite", pricing: { inputPerMillion: 0.05, outputPerMillion: 0.20, tier: "paid", asOf: "2026-06" } },
    { prefix: "gemini-2.5-flash", pricing: { inputPerMillion: 0.10, outputPerMillion: 0.40, tier: "paid", asOf: "2026-06" } },

    { prefix: "gemini-2.0-flash", pricing: { inputPerMillion: 0.10, outputPerMillion: 0.40, tier: "paid", asOf: "2026-06" } },
    { prefix: "gemini-1.5-pro", pricing: { inputPerMillion: 1.25, outputPerMillion: 5.00, tier: "paid", asOf: "2026-06" } },
    { prefix: "gemini-1.5-flash", pricing: { inputPerMillion: 0.075, outputPerMillion: 0.30, tier: "paid", asOf: "2026-06" } },
  ],

  openrouter: [

    { prefix: "openrouter/auto", pricing: { inputPerMillion: 1.00, outputPerMillion: 3.00, tier: "paid", asOf: "2026-06" } },

    { prefix: "anthropic/claude-opus-4", pricing: { inputPerMillion: 15.00, outputPerMillion: 75.00, tier: "paid", asOf: "2026-06" } },
    { prefix: "anthropic/claude-sonnet-4", pricing: { inputPerMillion: 3.00, outputPerMillion: 15.00, tier: "paid", asOf: "2026-06" } },
    { prefix: "anthropic/claude-haiku-4", pricing: { inputPerMillion: 1.00, outputPerMillion: 5.00, tier: "paid", asOf: "2026-06" } },
    { prefix: "anthropic/claude-3.5-sonnet", pricing: { inputPerMillion: 3.00, outputPerMillion: 15.00, tier: "paid", asOf: "2026-06" } },
    { prefix: "anthropic/claude-3.5-haiku", pricing: { inputPerMillion: 0.80, outputPerMillion: 4.00, tier: "paid", asOf: "2026-06" } },

    { prefix: "openai/gpt-5", pricing: { inputPerMillion: 1.25, outputPerMillion: 10.00, tier: "paid", asOf: "2026-06" } },
    { prefix: "openai/gpt-4o-mini", pricing: { inputPerMillion: 0.15, outputPerMillion: 0.60, tier: "paid", asOf: "2026-06" } },
    { prefix: "openai/gpt-4o", pricing: { inputPerMillion: 2.50, outputPerMillion: 10.00, tier: "paid", asOf: "2026-06" } },
    { prefix: "openai/o1", pricing: { inputPerMillion: 15.00, outputPerMillion: 60.00, tier: "paid", asOf: "2026-06" } },

    { prefix: "google/gemini-2.5-flash", pricing: { inputPerMillion: 0.10, outputPerMillion: 0.40, tier: "paid", asOf: "2026-06" } },
    { prefix: "google/gemini-2.5-pro", pricing: { inputPerMillion: 1.25, outputPerMillion: 5.00, tier: "paid", asOf: "2026-06" } },
    { prefix: "google/gemini-2.0-flash", pricing: { inputPerMillion: 0.10, outputPerMillion: 0.40, tier: "paid", asOf: "2026-06" } },

    { prefix: "meta-llama/llama-3.3-70b", pricing: { inputPerMillion: 0.13, outputPerMillion: 0.40, tier: "paid", asOf: "2026-06" } },
    { prefix: "meta-llama/llama-3.1-405b", pricing: { inputPerMillion: 1.79, outputPerMillion: 1.79, tier: "paid", asOf: "2026-06" } },
    { prefix: "meta-llama/llama-3.1-70b", pricing: { inputPerMillion: 0.13, outputPerMillion: 0.40, tier: "paid", asOf: "2026-06" } },
    { prefix: "meta-llama/llama-3.1-8b", pricing: { inputPerMillion: 0.02, outputPerMillion: 0.05, tier: "paid", asOf: "2026-06" } },

    { prefix: "qwen/qwen3-coder", pricing: { inputPerMillion: 0.60, outputPerMillion: 2.40, tier: "paid", asOf: "2026-06" } },
    { prefix: "qwen/qwen2.5-72b", pricing: { inputPerMillion: 0.35, outputPerMillion: 0.40, tier: "paid", asOf: "2026-06" } },

    { prefix: "deepseek/deepseek-r1", pricing: { inputPerMillion: 0.55, outputPerMillion: 2.19, tier: "paid", asOf: "2026-06" } },
    { prefix: "deepseek/", pricing: { inputPerMillion: 0.14, outputPerMillion: 0.28, tier: "paid", asOf: "2026-06" } },

  ],

  nim: [
    { prefix: "", pricing: { inputPerMillion: null, outputPerMillion: null, tier: "unknown", asOf: "2026-10" } },
  ],

  ollama: [
    { prefix: "", pricing: { inputPerMillion: 0, outputPerMillion: 0, tier: "free", asOf: "2026-06" } },
  ],
};

const gratisConhecidos = new Map<string, Set<string>>();

const normalizado = (id: string) => id.toLowerCase().replace(/_/g, ".");

export function definirGratisConhecidos(provider: string, ids: readonly string[]): void {
  gratisConhecidos.set(provider, new Set(ids.map(normalizado)));
}

export function getPricing(provider: string, model: string): ModelPricing {
  if (!model) return { inputPerMillion: null, outputPerMillion: null, tier: "unknown" };
  const entries = PRICES_BY_PROVIDER[provider];
  if (!entries) return { inputPerMillion: null, outputPerMillion: null, tier: "unknown" };

  const lower = model.toLowerCase();

  if (gratisConhecidos.get(provider)?.has(normalizado(model))) {
    return { inputPerMillion: 0, outputPerMillion: 0, tier: "free", asOf: "2026-10" };
  }

  if (provider === "openrouter" && lower.endsWith(":free")) {
    return { inputPerMillion: 0, outputPerMillion: 0, tier: "free", asOf: "2026-06" };
  }

  for (const entry of entries) {
    if (entry.prefix === "" || lower.startsWith(entry.prefix.toLowerCase())) {
      return { ...entry.pricing };
    }
  }
  return { inputPerMillion: null, outputPerMillion: null, tier: "unknown" };
}

export function calculateCost(
  pricing: ModelPricing,
  tokensIn: number,
  tokensOut: number,
  imageCount = 0,
  charCount = 0
): number | null {
  let cost = 0;
  let hasAnyKnown = false;

  if (pricing.inputPerMillion != null && tokensIn > 0) {
    cost += (tokensIn / 1_000_000) * pricing.inputPerMillion;
    hasAnyKnown = true;
  } else if (tokensIn > 0) {
    return null; 
  }

  if (pricing.outputPerMillion != null && tokensOut > 0) {
    cost += (tokensOut / 1_000_000) * pricing.outputPerMillion;
    hasAnyKnown = true;
  } else if (tokensOut > 0 && pricing.outputPerMillion == null) {
    return null;
  }

  if (pricing.imagePerCall != null && imageCount > 0) {
    cost += imageCount * pricing.imagePerCall;
    hasAnyKnown = true;
  }

  if (pricing.charPerMillion != null && charCount > 0) {
    cost += (charCount / 1_000_000) * pricing.charPerMillion;
    hasAnyKnown = true;
  }

  if (!hasAnyKnown && tokensIn === 0 && tokensOut === 0) return 0;
  return cost;
}

export function formatUsdRounded(n: number | null): string {
  if (n == null) return "—";
  if (n > 0 && n < 0.01) return "<$0.01";
  return `$${n.toFixed(2)}`;
}

export function formatUsd(n: number | null): string {
  if (n == null) return "—";
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  if (n < 100) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(0)}`;
}
