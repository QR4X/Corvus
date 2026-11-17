import { getModelCard } from "../providers/modelDescriptions";
import { mark } from "../i18n/tr";

interface ModelGroup {

  label: string;
  models: string[];
}

const GROUP_ORDER: Array<{ id: string; label: string; cats: string[] }> = [
  { id: "chat", label: mark("Chat"), cats: ["chat-vision", "chat-text", "agent"] },
  { id: "reasoning", label: mark("Reasoning"), cats: ["reasoning"] },
  { id: "image", label: mark("Image"), cats: ["image-gen"] },
  { id: "voice", label: mark("Voice"), cats: ["audio-gen"] },
  { id: "video", label: mark("Video"), cats: ["video-gen"] },
  { id: "other", label: mark("Other"), cats: ["embedding", "other"] },
];

export function groupModels(
  provider: string,
  models: readonly string[]
): ModelGroup[] {
  const byId = new Map<string, string[]>();
  for (const m of models) {
    const cat = getModelCard(provider, m).category;
    const groupId =
      GROUP_ORDER.find((g) => g.cats.includes(cat))?.id ?? "other";
    const bucket = byId.get(groupId);
    if (bucket) bucket.push(m);
    else byId.set(groupId, [m]);
  }
  return GROUP_ORDER.filter((g) => byId.get(g.id)?.length).map((g) => ({
    label: g.label,
    models: byId.get(g.id) as string[],
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
  active: readonly string[],
  catalog: readonly string[]
): string[] {
  const seen = new Set(active);
  return [...active, ...catalog.filter((m) => m && !seen.has(m))];
}
