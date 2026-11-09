import type { ChatUsageRow, UsageAggregate, UsageBucket } from "./aggregate";
import type { Opcao, UsageFilter } from "./filters";

import { diaCurto } from "./timeline";

export type Metrica = "cost" | "tokens";

export function metricaDa(total: UsageBucket): Metrica {
  return total.cost > 0 ? "cost" : "tokens";
}

export function valorNa(
  b: { cost: number | null; tokensIn: number; tokensOut: number },
  m: Metrica
): number {
  return m === "cost" ? (b.cost ?? 0) : b.tokensIn + b.tokensOut;
}

export type Preco = "pago" | "gratis" | "sem-preco";

export function precoDo(b: UsageBucket): Preco {
  if (b.cost > 0) return "pago";
  return b.hasUnknownCost ? "sem-preco" : "gratis";
}

export interface Fatia {
  id: string;
  chats: number;
  tokens: number;
  cost: number;
  preco: Preco;

  piso: boolean;

  pct: number;

  quase: boolean;
}

export type ModeloNaPagina = Fatia;

export function modelosDaPagina(agg: UsageAggregate): Fatia[] {
  return fatiasDe(agg.byModel, agg.total);
}

export function relatorioDe(
  ops: readonly Opcao[],
  buckets: Record<string, UsageBucket>,
  total: UsageBucket
): { usadas: Fatia[]; paradas: Opcao[] } {
  const ids = new Set(ops.map((o) => o.id));
  const usadas = fatiasDe(
    Object.fromEntries(
      Object.entries(buckets).filter(([id, b]) => ids.has(id) && b.chats > 0)
    ),
    total
  );
  const medidas = new Set(usadas.map((u) => u.id));
  return { usadas, paradas: ops.filter((o) => !medidas.has(o.id)) };
}

export function semADimensao(
  f: UsageFilter,
  dim: "providers" | "models" | "modes"
): UsageFilter {
  return { ...f, [dim]: [] };
}

export function fatiasDe(
  buckets: Record<string, UsageBucket>,
  totalDoRecorte: UsageBucket
): Fatia[] {
  const m = metricaDa(totalDoRecorte);
  const total = valorNa(totalDoRecorte, m);
  return (
    Object.entries(buckets)
      .map(([id, b]) => {
        const peso = valorNa(b, m);
        const exato = total > 0 ? (peso / total) * 100 : 0;
        const quase = peso > 0 && Math.round(exato) === 0;
        return {
          id,
          chats: b.chats,
          tokens: b.tokensIn + b.tokensOut,
          cost: b.cost,
          preco: precoDo(b),
          piso: b.cost > 0 && b.hasUnknownCost,
          pct: quase ? 1 : Math.round(exato),
          quase,
          peso,
        };
      })

      .sort(
        (a, b) => b.peso - a.peso || b.tokens - a.tokens || a.id.localeCompare(b.id)
      )
      .map(({ peso: _peso, ...linha }) => linha)
  );
}

export function conversasDoTopo(agg: UsageAggregate, n: number): ChatUsageRow[] {
  if (metricaDa(agg.total) === "cost") return agg.chats.slice(0, n);
  return [...agg.chats]
    .sort(
      (a, b) =>
        b.tokensIn + b.tokensOut - (a.tokensIn + a.tokensOut) ||
        a.id.localeCompare(b.id)
    )
    .slice(0, n);
}

export function mediaPorConversa(total: UsageBucket): number | null {
  if (total.chats <= 0) return null;
  return valorNa(total, metricaDa(total)) / total.chats;
}

export function faixaDeDatas(
  inicio: string | null,
  fim: string | null
): string {
  if (!inicio || !fim) return "";
  if (inicio === fim) return diaCurto(inicio);
  const viraAno = inicio.slice(0, 4) !== fim.slice(0, 4);
  return `${diaCurto(inicio, viraAno)} – ${diaCurto(fim)}`;
}

export function marcados(f: UsageFilter): number {
  return f.providers.length + f.models.length + f.modes.length;
}

export const A_VISTA = 3;

export function opcoesAVista(
  ops: readonly Opcao[],
  selecionados: readonly string[],
  n: number = A_VISTA
): Opcao[] {
  const fora = ops.filter((o, i) => i >= n && selecionados.includes(o.id));
  return [...fora, ...ops.slice(0, n)];
}

export function buscarOpcoes(
  ops: readonly Opcao[],
  termo: string,
  nome: (id: string) => string
): Opcao[] {
  const t = termo.trim().toLowerCase();
  if (!t) return [...ops];
  return ops.filter(
    (o) => nome(o.id).toLowerCase().includes(t) || o.id.toLowerCase().includes(t)
  );
}

export function valeFiltrar(ops: readonly Opcao[], selecionados: readonly string[]): boolean {
  return ops.length > 1 || selecionados.length > 0;
}
