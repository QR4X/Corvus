import { getModelCard } from "../providers/modelDescriptions";
import { mark } from "../i18n/tr";

export interface ModelGroup {

  label: string;
  models: string[];
}

const ORDEM: Array<{ id: string; label: string; cats: string[] }> = [
  { id: "chat", label: mark("Chat"), cats: ["chat-vision", "chat-text", "agent"] },
  { id: "reasoning", label: mark("Reasoning"), cats: ["reasoning"] },
  { id: "image", label: mark("Image"), cats: ["image-gen"] },
  { id: "voice", label: mark("Voice"), cats: ["audio-gen"] },
  { id: "video", label: mark("Video"), cats: ["video-gen"] },
  { id: "outros", label: mark("Other"), cats: ["embedding", "other"] },
];

export function groupModels(
  provider: string,
  models: readonly string[]
): ModelGroup[] {
  const porId = new Map<string, string[]>();
  for (const m of models) {
    const cat = getModelCard(provider, m).category;
    const alvo =
      ORDEM.find((g) => g.cats.includes(cat))?.id ?? "outros";
    const atual = porId.get(alvo);
    if (atual) atual.push(m);
    else porId.set(alvo, [m]);
  }
  return ORDEM.filter((g) => porId.get(g.id)?.length).map((g) => ({
    label: g.label,
    models: porId.get(g.id) as string[],
  }));
}

export function filterModels(
  models: readonly string[],
  query: string,
  pretty: (m: string) => string
): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...models];
  return models.filter(
    (m) =>
      m.toLowerCase().includes(q) || pretty(m).toLowerCase().includes(q)
  );
}

export function mergeModelOptions(
  ativos: readonly string[],
  catalogo: readonly string[]
): string[] {
  const vistos = new Set(ativos);
  return [...ativos, ...catalogo.filter((m) => m && !vistos.has(m))];
}
