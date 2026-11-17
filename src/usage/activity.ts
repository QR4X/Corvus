import type { ChatSummary } from "../core/chatPersistence";
import { localDay, type HeatCell } from "./heatmap";

export function dayStreak(
  chats: readonly ChatSummary[],
  now: number = Date.now()
): number {
  const usedDays = new Set<string>();
  for (const c of chats) {
    const t = Date.parse(c.date);
    if (!Number.isFinite(t)) continue;
    const tin = Number.isFinite(c.tokensIn) ? c.tokensIn : 0;
    const tout = Number.isFinite(c.tokensOut) ? c.tokensOut : 0;
    if (tin + tout <= 0 && !Number.isFinite(c.messageCount)) continue;
    usedDays.add(localDay(t));
  }
  if (usedDays.size === 0) return 0;

  const today = new Date(now);
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  if (!usedDays.has(localDay(cursor.getTime()))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  let n = 0;
  while (usedDays.has(localDay(cursor.getTime()))) {
    n += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return n;
}

interface ActiveDays {
  active: number;
  total: number;
}

export function activeDays(cells: readonly HeatCell[]): ActiveDays {
  const days = cells.filter((c) => c.day !== null);
  return {
    active: days.filter((c) => c.tokens > 0).length,
    total: days.length,
  };
}

export interface PeriodWork {

  actions: number;
  messages: number;
}

export function periodWork(
  chats: readonly ChatSummary[],
  since: string
): PeriodWork {
  let actions = 0;
  let messages = 0;
  for (const c of chats) {
    if (since && (c.date ?? "").slice(0, 10) < since) continue;
    actions += Number.isFinite(c.toolCount) ? c.toolCount : 0;
    messages += Number.isFinite(c.messageCount) ? c.messageCount : 0;
  }
  return { actions, messages };
}

export interface ModelUsage {
  model: string;
  provider: string;
  tokens: number;
  chats: number;

  pct: number;
}

export function topModels(
  chats: readonly ChatSummary[],
  since: string,
  limit: number = 3
): ModelUsage[] {
  const byModel = new Map<string, ModelUsage>();
  let total = 0;
  for (const c of chats) {
    if (since && (c.date ?? "").slice(0, 10) < since) continue;
    if (!c.model) continue;
    const tin = Number.isFinite(c.tokensIn) ? c.tokensIn : 0;
    const tout = Number.isFinite(c.tokensOut) ? c.tokensOut : 0;
    const entry = byModel.get(c.model) ?? {
      model: c.model,
      provider: c.provider,
      tokens: 0,
      chats: 0,
      pct: 0,
    };
    entry.tokens += tin + tout;
    entry.chats += 1;
    if (!entry.provider) entry.provider = c.provider;
    byModel.set(c.model, entry);
    total += tin + tout;
  }

  const ranked = [...byModel.values()].sort((a, b) => {
    if (b.tokens !== a.tokens) return b.tokens - a.tokens;

    if (b.chats !== a.chats) return b.chats - a.chats;
    return a.model.localeCompare(b.model);
  });
  for (const m of ranked) {
    m.pct = total > 0 ? Math.round((m.tokens / total) * 100) : 0;
  }
  return ranked.slice(0, limit);
}
