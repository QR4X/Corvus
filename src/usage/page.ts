import type { ChatUsageRow, UsageAggregate, UsageBucket } from "./aggregate";
import type { FilterOption, UsageFilter } from "./filters";

import { shortDay } from "./timeline";

export type Metric = "cost" | "tokens";

export function metricOf(total: UsageBucket): Metric {
  return total.cost > 0 ? "cost" : "tokens";
}

function metricValue(
  b: { cost: number | null; tokensIn: number; tokensOut: number },
  m: Metric
): number {
  return m === "cost" ? (b.cost ?? 0) : b.tokensIn + b.tokensOut;
}

export type PriceKind = "paid" | "free" | "unpriced";

export function priceKind(b: UsageBucket): PriceKind {
  if (b.cost > 0) return "paid";
  return b.hasUnknownCost ? "unpriced" : "free";
}

export interface Slice {
  id: string;
  chats: number;
  tokens: number;
  cost: number;
  price: PriceKind;

  isFloor: boolean;

  pct: number;

  nearZero: boolean;
}

export function pageModels(agg: UsageAggregate): Slice[] {
  return slicesOf(agg.byModel, agg.total);
}

export function sliceReport(
  ops: readonly FilterOption[],
  buckets: Record<string, UsageBucket>,
  total: UsageBucket
): { used: Slice[]; idle: FilterOption[] } {
  const ids = new Set(ops.map((o) => o.id));
  const used = slicesOf(
    Object.fromEntries(
      Object.entries(buckets).filter(([id, b]) => ids.has(id) && b.chats > 0)
    ),
    total
  );
  const measured = new Set(used.map((u) => u.id));
  return { used, idle: ops.filter((o) => !measured.has(o.id)) };
}

export function withoutDimension(
  f: UsageFilter,
  dim: "providers" | "models" | "modes"
): UsageFilter {
  return { ...f, [dim]: [] };
}

export function slicesOf(
  buckets: Record<string, UsageBucket>,
  sliceTotal: UsageBucket
): Slice[] {
  const m = metricOf(sliceTotal);
  const total = metricValue(sliceTotal, m);
  return (
    Object.entries(buckets)
      .map(([id, b]) => {
        const weight = metricValue(b, m);
        const exact = total > 0 ? (weight / total) * 100 : 0;
        const nearZero = weight > 0 && Math.round(exact) === 0;
        return {
          id,
          chats: b.chats,
          tokens: b.tokensIn + b.tokensOut,
          cost: b.cost,
          price: priceKind(b),
          isFloor: b.cost > 0 && b.hasUnknownCost,
          pct: nearZero ? 1 : Math.round(exact),
          nearZero,
          weight,
        };
      })

      .sort(
        (a, b) => b.weight - a.weight || b.tokens - a.tokens || a.id.localeCompare(b.id)
      )
      .map(({ weight: _weight, ...row }) => row)
  );
}

export function topChats(agg: UsageAggregate, n: number): ChatUsageRow[] {
  if (metricOf(agg.total) === "cost") return agg.chats.slice(0, n);
  return [...agg.chats]
    .sort(
      (a, b) =>
        b.tokensIn + b.tokensOut - (a.tokensIn + a.tokensOut) ||
        a.id.localeCompare(b.id)
    )
    .slice(0, n);
}

export function averagePerChat(total: UsageBucket): number | null {
  if (total.chats <= 0) return null;
  return metricValue(total, metricOf(total)) / total.chats;
}

export function dateRange(
  start: string | null,
  end: string | null
): string {
  if (!start || !end) return "";
  if (start === end) return shortDay(start);
  const crossesYear = start.slice(0, 4) !== end.slice(0, 4);
  return `${shortDay(start, crossesYear)} – ${shortDay(end)}`;
}

export function selectedCount(f: UsageFilter): number {
  return f.providers.length + f.models.length + f.modes.length;
}

export const VISIBLE_OPTIONS = 3;

export function visibleOptions(
  ops: readonly FilterOption[],
  selected: readonly string[],
  n: number = VISIBLE_OPTIONS
): FilterOption[] {
  const pinned = ops.filter((o, i) => i >= n && selected.includes(o.id));
  return [...pinned, ...ops.slice(0, n)];
}

export function searchOptions(
  ops: readonly FilterOption[],
  query: string,
  nameOf: (id: string) => string
): FilterOption[] {
  const t = query.trim().toLowerCase();
  if (!t) return [...ops];
  return ops.filter(
    (o) => nameOf(o.id).toLowerCase().includes(t) || o.id.toLowerCase().includes(t)
  );
}

export function worthFiltering(ops: readonly FilterOption[], selected: readonly string[]): boolean {
  return ops.length > 1 || selected.length > 0;
}
