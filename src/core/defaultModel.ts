import type { CorvusSettings } from "../settings";
import { pareceEmbeddingDoOllama } from "../rag/types";
import { providerMeta } from "./providersMeta";

export function modeloSalvoPara(s: CorvusSettings, provider: string): string {
  const doCampo = s[providerMeta(provider).model];
  if (doCampo) return doCampo;
  const ativos = s.activeModels?.[provider] ?? [];

  if (provider === "ollama") return ativos.find((m) => !pareceEmbeddingDoOllama(m)) ?? "";
  return ativos[0] ?? "";
}
