import type { ChatSummary } from "../core/chatPersistence";

export interface UsageFilter {
  providers: string[];
  models: string[];
  modes: string[];

  days: number;
}

export const EMPTY_FILTER: UsageFilter = {
  providers: [],
  models: [],
  modes: [],
  days: 0,
};

export interface FilterOption {
  id: string;
  count: number;
}

export function filterOptions(
  chats: readonly ChatSummary[],
  dimension: "provider" | "model" | "mode"
): FilterOption[] {
  const counts = new Map<string, number>();
  for (const c of chats) {
    const v = (c[dimension] ?? "").trim();
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, count }))

    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

export function toggleValue(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}

export function applyFilter(
  chats: readonly ChatSummary[],
  f: UsageFilter,
  now: number = Date.now()
): ChatSummary[] {
  const cutoff = f.days > 0 ? now - f.days * 86_400_000 : 0;
  return chats.filter((c) => {
    if (f.providers.length > 0 && !f.providers.includes(c.provider)) return false;
    if (f.models.length > 0 && !f.models.includes(c.model)) return false;
    if (f.modes.length > 0 && !f.modes.includes(c.mode)) return false;
    if (cutoff > 0) {
      const t = Date.parse(c.date);

      if (!Number.isFinite(t) || t < cutoff) return false;
    }
    return true;
  });
}

