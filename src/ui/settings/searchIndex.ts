import type { PickItem } from "./tree";
import { mark, tr } from "../../i18n/tr";

export const QUANT_ITENS: PickItem[] = [
  { value: "precision", label: mark("Precision — full detail"), icon: "target" },
  { value: "balanced", label: mark("Balanced — 4× smaller"), icon: "scale" },
  { value: "light", label: mark("Light — smaller vectors"), icon: "feather" },
  { value: "minimal", label: mark("Minimal — smallest"), icon: "minimize-2" },
];

export interface IndiceAtual {
  profile: string;
  streamed: boolean;

  model?: string;
}

export function pendenciaDoIndice(
  atual: IndiceAtual | null,
  s: { ragQuantProfile?: string; ragStreamShards?: boolean; ragEmbeddingModel?: string }
): string | null {
  if (!atual) return null;
  const partes: string[] = [];

  if (s.ragEmbeddingModel && atual.model && s.ragEmbeddingModel !== atual.model) {
    partes.push(tr("the new embedding model"));
  }
  if ((s.ragQuantProfile || "balanced") !== (atual.profile || "balanced")) {
    partes.push(tr("the new precision"));
  }
  const pedacos = s.ragStreamShards === true;
  if (pedacos !== atual.streamed) {
    partes.push(pedacos ? tr("search in pieces") : tr("a single index file"));
  }
  if (partes.length === 0) return null;

  const quais = partes.reduce((a, b) => tr("{a} and {b}", { a, b }));
  return tr("Update the index to apply {changes}.", { changes: quais });
}
