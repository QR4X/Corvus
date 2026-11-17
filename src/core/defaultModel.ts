import type { CorvusSettings } from "../settings";
import { looksLikeOllamaEmbedding } from "../rag/types";
import { providerMeta } from "./providersMeta";

export function savedModelFor(s: CorvusSettings, provider: string): string {
  const fromField = s[providerMeta(provider).model];
  if (fromField) return fromField;
  const active = s.activeModels?.[provider] ?? [];

  if (provider === "ollama") return active.find((m) => !looksLikeOllamaEmbedding(m)) ?? "";
  return active[0] ?? "";
}
