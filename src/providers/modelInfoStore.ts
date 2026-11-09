import { requestUrl } from "obsidian";
import { ehGratisNoOpenRouter } from "./openrouterFree";

export interface EnrichedModelInfo {

  descriptionEn?: string;
  contextWindow?: number;
  inputPerMillion?: number | null;
  outputPerMillion?: number | null;

  imagePerCall?: number | null;

  modalities?: string[];

  outputModalities?: string[];

  supportsTools?: boolean;
  tier?: "free" | "paid" | "unknown";

  source?: string;
  fetchedAt?: string;
}

let CACHE: Record<string, EnrichedModelInfo> = {};

let openRouterCatalog: OpenRouterModel[] | null = null;

let catalogPromise: Promise<OpenRouterModel[]> | null = null;

interface OpenRouterModel {
  id?: string;
  name?: string;
  description?: string;
  context_length?: number;
  architecture?: {
    modality?: string;
    input_modalities?: string[];
    output_modalities?: string[];
  };
  pricing?: { prompt?: string; completion?: string; image?: string };
  supported_parameters?: string[];
}

export function cacheKey(provider: string, model: string): string {
  return provider + "::" + model;
}

export function hydrateModelInfoCache(
  data: Record<string, EnrichedModelInfo> | undefined | null
): void {

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    CACHE = {};
    return;
  }
  const clean: Record<string, EnrichedModelInfo> = {};
  for (const [key, val] of Object.entries(data)) {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      clean[key] = val;
    }
  }
  CACHE = clean;
}

export function getModelInfoCache(): Record<string, EnrichedModelInfo> {
  return CACHE;
}

export function getEnrichedInfo(
  provider: string,
  model: string
): EnrichedModelInfo | undefined {
  return CACHE[cacheKey(provider, model)];
}

async function loadOpenRouterCatalog(): Promise<OpenRouterModel[]> {
  if (openRouterCatalog) return openRouterCatalog;

  if (catalogPromise) return catalogPromise;
  catalogPromise = (async () => {
    const res = await requestUrl({
      url: "https://openrouter.ai/api/v1/models",
      method: "GET",
      headers: { Accept: "application/json" },

    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error("OpenRouter /models HTTP " + res.status);
    }
    const data = (res.json as { data?: unknown } | undefined)?.data as
      | OpenRouterModel[]
      | undefined;

    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("OpenRouter /models payload empty/invalid");
    }
    openRouterCatalog = data;
    return data;
  })();
  try {
    return await catalogPromise;
  } catch (e) {
    catalogPromise = null;
    throw e;
  }
}

function tailOf(id: string): string {
  const lower = (id || "").toLowerCase().replace(/:free$/, "");
  return lower.includes("/") ? lower.slice(lower.lastIndexOf("/") + 1) : lower;
}

function matchOpenRouter(
  catalog: OpenRouterModel[],
  model: string
): OpenRouterModel | null {
  const lower = (model || "").toLowerCase().replace(/:free$/, "");
  let hit = catalog.find((m) => (m.id || "").toLowerCase() === lower);
  if (hit) return hit;
  const tail = tailOf(model);
  hit = catalog.find((m) => tailOf(m.id || "") === tail);
  if (hit) return hit;

  const boundary = (full: string, prefix: string): boolean => {
    if (!full.startsWith(prefix)) return false;
    const next = full.charAt(prefix.length);
    return next === "" || next === "-" || next === ":" || next === "/" || next === ".";
  };
  let best: OpenRouterModel | null = null;
  let bestLen = 0;
  for (const m of catalog) {
    const mt = tailOf(m.id || "");
    let overlap = 0;
    if (tail.length >= 5 && boundary(mt, tail)) overlap = tail.length;
    else if (mt.length >= 5 && boundary(tail, mt)) overlap = mt.length;
    if (overlap > bestLen) {
      bestLen = overlap;
      best = m;
    }
  }
  return best;
}

function perMillion(usdPerToken: string | undefined): number | null {
  const v = parseFloat(usdPerToken ?? "");
  if (isNaN(v)) return null;

  return Math.round(v * 1_000_000 * 1_000_000) / 1_000_000;
}

function toEnriched(raw: OpenRouterModel): EnrichedModelInfo {
  const arch = raw.architecture ?? {};

  const inModal =
    arch.input_modalities ??
    (arch.modality
      ? String(arch.modality)
          .split("->")[0]
          .split("+")
          .map((s) => s.trim())
      : []);
  const params = raw.supported_parameters ?? [];
  const input = perMillion(raw.pricing?.prompt);
  const output = perMillion(raw.pricing?.completion);
  const imgRaw = parseFloat(raw.pricing?.image ?? "");

  const gratis =
    typeof raw.id === "string" &&
    ehGratisNoOpenRouter({
      id: raw.id,
      pricing: raw.pricing,
      architecture: raw.architecture,
      description: raw.description,
    });
  const tier: "free" | "paid" | "unknown" =
    input === 0 && output === 0
      ? gratis
        ? "free"
        : "unknown"
      : input === null || output === null
        ? "unknown"
        : "paid";
  const rawDesc =
    typeof raw.description === "string" ? raw.description.trim() : undefined;
  return {

    descriptionEn:
      rawDesc && rawDesc.length > 280 ? rawDesc.slice(0, 279) + "…" : rawDesc,
    contextWindow:
      typeof raw.context_length === "number" ? raw.context_length : undefined,
    inputPerMillion: input,
    outputPerMillion: output,

    imagePerCall: isNaN(imgRaw) ? null : imgRaw,
    modalities: inModal.filter(Boolean),
    outputModalities: (arch.output_modalities ?? []).filter(Boolean),
    supportsTools:
      params.includes("tools") || params.includes("tool_choice"),
    tier,
    source: "openrouter",
  };
}

export function recordModelInfo(
  provider: string,
  model: string,
  info: EnrichedModelInfo
): void {
  CACHE[cacheKey(provider, model)] = info;
}

function gravarDoCatalogo(
  catalog: OpenRouterModel[],
  provider: string,
  model: string
): EnrichedModelInfo | null {
  const raw = matchOpenRouter(catalog, model);
  if (!raw) return null;
  const info = toEnriched(raw);
  info.fetchedAt = new Date().toISOString();
  CACHE[cacheKey(provider, model)] = info;
  return info;
}

export async function fetchAndCacheModelInfo(
  provider: string,
  model: string
): Promise<EnrichedModelInfo | null> {
  const catalog = await loadOpenRouterCatalog();
  return gravarDoCatalogo(catalog, provider, model);
}

export async function enrichModelsFromCatalog(
  provider: string,
  models: readonly string[]
): Promise<number> {

  const faltando = models.filter((m) => m && !CACHE[cacheKey(provider, m)]);
  if (faltando.length === 0) return 0;
  let catalog: OpenRouterModel[];
  try {
    catalog = await loadOpenRouterCatalog();
  } catch {
    return 0; 
  }
  let gravados = 0;
  for (const model of faltando) {
    if (gravarDoCatalogo(catalog, provider, model)) gravados++;
  }
  return gravados;
}
