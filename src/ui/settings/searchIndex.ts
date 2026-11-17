import type { PickItem } from "./tree";
import { mark, tr } from "../../i18n/tr";

export const QUANT_ITEMS: PickItem[] = [
  { value: "precision", label: mark("Precision — full detail"), icon: "target" },
  { value: "balanced", label: mark("Balanced — 4× smaller"), icon: "scale" },
  { value: "light", label: mark("Light — smaller vectors"), icon: "feather" },
  { value: "minimal", label: mark("Minimal — smallest"), icon: "minimize-2" },
];

interface CurrentIndex {
  profile: string;
  streamed: boolean;

  model?: string;
}

export function pendingIndexUpdate(
  current: CurrentIndex | null,
  s: { ragQuantProfile?: string; ragStreamShards?: boolean; ragEmbeddingModel?: string }
): string | null {
  if (!current) return null;
  const parts: string[] = [];

  if (s.ragEmbeddingModel && current.model && s.ragEmbeddingModel !== current.model) {
    parts.push(tr("the new embedding model"));
  }
  if ((s.ragQuantProfile || "balanced") !== (current.profile || "balanced")) {
    parts.push(tr("the new precision"));
  }
  const sharded = s.ragStreamShards === true;
  if (sharded !== current.streamed) {
    parts.push(sharded ? tr("search in pieces") : tr("a single index file"));
  }
  if (parts.length === 0) return null;

  const changes = parts.reduce((a, b) => tr("{a} and {b}", { a, b }));
  return tr("Update the index to apply {changes}.", { changes });
}
