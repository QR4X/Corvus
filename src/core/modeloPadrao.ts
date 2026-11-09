// src/core/modeloPadrao.ts
// O modelo SALVO pra cada provider — os campos legados das settings (um por
// provider) e, sem eles, o primeiro modelo ativo. É o que a conversa nova
// usa (session.ts) e o que as ações do editor usam (editor/inline.ts): os
// dois lugares tinham que concordar, então a regra mora num lugar só.

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
  // No Ollama a lista pode ter um modelo de embedding ligado à mão — ele não
  // conversa, e virar o padrão dava erro no primeiro envio. Sem modelo que
  // converse, fica vazio: o envio avisa o que fazer.
  if (provider === "ollama") return ativos.find((m) => !pareceEmbeddingDoOllama(m)) ?? "";
  return ativos[0] ?? "";
}
