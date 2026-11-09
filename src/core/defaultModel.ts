import type { CorvusSettings } from "../main";
import { pareceEmbeddingDoOllama } from "../rag/types";

export function modeloSalvoPara(s: CorvusSettings, provider: string): string {
  const doCampo = (() => {
    switch (provider) {
      case "anthropic":
        return s.anthropicModel;
      case "gemini":
        return s.geminiModel;
      case "openrouter":
        return s.openrouterModel;
      case "nim":
        return s.nimModel;
      case "ollama":
        return s.ollamaModel;
      default:
        return s.defaultModel;
    }
  })();
  if (doCampo) return doCampo;
  const ativos = s.activeModels?.[provider] ?? [];

  if (provider === "ollama") return ativos.find((m) => !pareceEmbeddingDoOllama(m)) ?? "";
  return ativos[0] ?? "";
}
