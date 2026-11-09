export const OLLAMA_LOCAL = "http://localhost:11434";

export interface OllamaSalvo {
  ollamaEndpoint?: unknown;
  ollamaPadraoRevisto?: unknown;
  defaultProvider?: unknown;
  ollamaModel?: unknown;
  providerStatus?: Record<string, { ok?: unknown } | undefined>;
  favoriteModels?: Record<string, unknown>;
  activeModels?: Record<string, unknown>;
  roleModels?: Record<string, { provider?: unknown } | undefined>;
  modelProvider?: Record<string, unknown>;
}

export interface OllamaFabrica {
  modelo: string;
  ativos: readonly string[];
}

export function usaOllama(s: OllamaSalvo, fabrica: OllamaFabrica): boolean {
  const lista = (v: unknown): v is unknown[] => Array.isArray(v) && v.length > 0;
  const ativos = s.activeModels?.ollama;
  const ativosMexidos =
    lista(ativos) &&
    (ativos.length !== fabrica.ativos.length ||
      ativos.some((m) => !fabrica.ativos.includes(m as string)));
  return (
    s.defaultProvider === "ollama" ||
    s.providerStatus?.ollama?.ok === true ||
    (typeof s.ollamaModel === "string" &&
      s.ollamaModel !== "" &&
      s.ollamaModel !== fabrica.modelo) ||
    lista(s.favoriteModels?.ollama) ||
    ativosMexidos ||
    Object.values(s.roleModels ?? {}).some((r) => r?.provider === "ollama") ||
    Object.values(s.modelProvider ?? {}).some((p) => p === "ollama")
  );
}

export const FABRICA_ATE_0923: OllamaFabrica = {
  modelo: "llama3.2",
  ativos: ["llama3.2", "qwen2.5", "deepseek-r1", "mistral"],
};

export function nomeCompleto(m: string): string {
  const ultimo = m.slice(m.lastIndexOf("/") + 1);
  return ultimo.includes(":") ? m : `${m}:latest`;
}

export interface ListasDoOllama {
  ativos: readonly string[];
  favoritos: readonly string[];

  modelo: string;

  vistos: readonly string[] | null;
}

export function listaDeFabrica(ativos: readonly string[]): boolean {
  if (ativos.length === 0) return true;
  const fabrica = FABRICA_ATE_0923.ativos;
  return ativos.length === fabrica.length && ativos.every((m) => fabrica.includes(m));
}

export function alinharAoInstalado(
  l: ListasDoOllama,
  instalados: readonly string[],
  ehEmbedding: (m: string) => boolean
): ListasDoOllama & { vistos: readonly string[] } {
  const tem = new Set(instalados.map(nomeCompleto));
  const existe = (m: string) => tem.has(nomeCompleto(m));

  const doOllama = (m: string) => instalados.find((i) => nomeCompleto(i) === nomeCompleto(m));

  const deFabrica = l.vistos === null && l.favoritos.length === 0 && listaDeFabrica(l.ativos);
  const partida: ListasDoOllama = deFabrica
    ? { ativos: [], favoritos: [], modelo: (l.modelo && doOllama(l.modelo)) || "", vistos: null }
    : l;

  const ativos: string[] = [];
  const jaAtivos = new Set<string>();
  const ativar = (m: string) => {
    const k = nomeCompleto(m);
    if (jaAtivos.has(k)) return;
    jaAtivos.add(k);
    ativos.push(m);
  };
  for (const m of partida.ativos) if (existe(m)) ativar(m);

  const vistos =
    partida.vistos !== null
      ? new Set(partida.vistos.map(nomeCompleto))
      : ativos.length > 0
        ? tem
        : new Set<string>();
  for (const m of instalados) {
    if (!vistos.has(nomeCompleto(m)) && !ehEmbedding(m)) ativar(m);
  }

  if (!ativos.some((m) => !ehEmbedding(m))) {
    for (const m of instalados) if (!ehEmbedding(m)) ativar(m);
  }

  const favoritos = partida.favoritos.filter(existe);
  const modelo =
    partida.modelo && existe(partida.modelo)
      ? partida.modelo
      : (ativos.find((m) => !ehEmbedding(m)) ?? "");
  return { ativos, favoritos, modelo, vistos: [...instalados] };
}

export function revisarOllamaPadrao(
  s: OllamaSalvo,
  fabrica: OllamaFabrica
): string | null {
  if (s.ollamaPadraoRevisto === true) return null;
  if (s.ollamaEndpoint !== OLLAMA_LOCAL) return null;
  return usaOllama(s, fabrica) ? null : "";
}
