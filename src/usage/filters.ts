import type { ChatSummary } from "../core/chatPersistence";

export interface UsageFilter {
  providers: string[];
  models: string[];
  modes: string[];

  days: number;
}

export const FILTRO_VAZIO: UsageFilter = {
  providers: [],
  models: [],
  modes: [],
  days: 0,
};

export interface Opcao {
  id: string;
  count: number;
}

export function opcoes(
  chats: readonly ChatSummary[],
  dimensao: "provider" | "model" | "mode"
): Opcao[] {
  const contagem = new Map<string, number>();
  for (const c of chats) {
    const v = (c[dimensao] ?? "").trim();
    if (!v) continue;
    contagem.set(v, (contagem.get(v) ?? 0) + 1);
  }
  return [...contagem.entries()]
    .map(([id, count]) => ({ id, count }))

    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

export function alternar(lista: string[], valor: string): string[] {
  return lista.includes(valor)
    ? lista.filter((v) => v !== valor)
    : [...lista, valor];
}

export function aplicar(
  chats: readonly ChatSummary[],
  f: UsageFilter,
  agora: number = Date.now()
): ChatSummary[] {
  const corte = f.days > 0 ? agora - f.days * 86_400_000 : 0;
  return chats.filter((c) => {
    if (f.providers.length > 0 && !f.providers.includes(c.provider)) return false;
    if (f.models.length > 0 && !f.models.includes(c.model)) return false;
    if (f.modes.length > 0 && !f.modes.includes(c.mode)) return false;
    if (corte > 0) {
      const t = Date.parse(c.date);

      if (!Number.isFinite(t) || t < corte) return false;
    }
    return true;
  });
}

export function temFiltro(f: UsageFilter): boolean {
  return (
    f.providers.length > 0 ||
    f.models.length > 0 ||
    f.modes.length > 0 ||
    f.days > 0
  );
}
