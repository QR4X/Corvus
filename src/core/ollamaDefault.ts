export const OLLAMA_LOCAL = "http://localhost:11434";

interface SavedOllamaSettings {
  ollamaEndpoint?: unknown;
  ollamaDefaultReviewed?: unknown;
  defaultProvider?: unknown;
  ollamaModel?: unknown;
  providerStatus?: Record<string, { ok?: unknown } | undefined>;
  favoriteModels?: Record<string, unknown>;
  activeModels?: Record<string, unknown>;
  roleModels?: Record<string, { provider?: unknown } | undefined>;
  modelProvider?: Record<string, unknown>;
}

interface OllamaFactoryDefaults {
  model: string;
  active: readonly string[];
}

export function usesOllama(s: SavedOllamaSettings, defaults: OllamaFactoryDefaults): boolean {
  const isNonEmpty = (v: unknown): v is unknown[] => Array.isArray(v) && v.length > 0;
  const active = s.activeModels?.ollama;
  const activeChanged =
    isNonEmpty(active) &&
    (active.length !== defaults.active.length ||
      active.some((m) => !defaults.active.includes(m as string)));
  return (
    s.defaultProvider === "ollama" ||
    s.providerStatus?.ollama?.ok === true ||
    (typeof s.ollamaModel === "string" &&
      s.ollamaModel !== "" &&
      s.ollamaModel !== defaults.model) ||
    isNonEmpty(s.favoriteModels?.ollama) ||
    activeChanged ||
    Object.values(s.roleModels ?? {}).some((r) => r?.provider === "ollama") ||
    Object.values(s.modelProvider ?? {}).some((p) => p === "ollama")
  );
}

export const OLLAMA_DEFAULTS_UNTIL_0923: OllamaFactoryDefaults = {
  model: "llama3.2",
  active: ["llama3.2", "qwen2.5", "deepseek-r1", "mistral"],
};

export function fullModelName(m: string): string {
  const lastSegment = m.slice(m.lastIndexOf("/") + 1);
  return lastSegment.includes(":") ? m : `${m}:latest`;
}

export interface OllamaLists {
  active: readonly string[];
  favorites: readonly string[];

  model: string;

  seen: readonly string[] | null;
}

export function isFactoryList(active: readonly string[]): boolean {
  if (active.length === 0) return true;
  const defaults = OLLAMA_DEFAULTS_UNTIL_0923.active;
  return active.length === defaults.length && active.every((m) => defaults.includes(m));
}

export function alignToInstalled(
  l: OllamaLists,
  installed: readonly string[],
  isEmbedding: (m: string) => boolean
): OllamaLists & { seen: readonly string[] } {
  const installedNames = new Set(installed.map(fullModelName));
  const isInstalled = (m: string) => installedNames.has(fullModelName(m));

  const installedName = (m: string) => installed.find((i) => fullModelName(i) === fullModelName(m));

  const factoryState = l.seen === null && l.favorites.length === 0 && isFactoryList(l.active);
  const start: OllamaLists = factoryState
    ? { active: [], favorites: [], model: (l.model && installedName(l.model)) || "", seen: null }
    : l;

  const active: string[] = [];
  const activeKeys = new Set<string>();
  const activate = (m: string) => {
    const k = fullModelName(m);
    if (activeKeys.has(k)) return;
    activeKeys.add(k);
    active.push(m);
  };
  for (const m of start.active) if (isInstalled(m)) activate(m);

  const seen =
    start.seen !== null
      ? new Set(start.seen.map(fullModelName))
      : active.length > 0
        ? installedNames
        : new Set<string>();
  for (const m of installed) {
    if (!seen.has(fullModelName(m)) && !isEmbedding(m)) activate(m);
  }

  if (!active.some((m) => !isEmbedding(m))) {
    for (const m of installed) if (!isEmbedding(m)) activate(m);
  }

  const favorites = start.favorites.filter(isInstalled);
  const model =
    start.model && isInstalled(start.model)
      ? start.model
      : (active.find((m) => !isEmbedding(m)) ?? "");
  return { active, favorites, model, seen: [...installed] };
}

export function reviewOllamaDefault(
  s: SavedOllamaSettings,
  defaults: OllamaFactoryDefaults
): string | null {
  if (s.ollamaDefaultReviewed === true) return null;
  if (s.ollamaEndpoint !== OLLAMA_LOCAL) return null;
  return usesOllama(s, defaults) ? null : "";
}
