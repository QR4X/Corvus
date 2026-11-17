import type { ChatSummary } from "../core/chatPersistence";
import { uiLocale } from "../i18n/tr";

export interface HeatCell {

  day: string | null;
  tokens: number;

  level: number;

  future?: boolean;
}

interface Heatmap {

  cells: HeatCell[];

  rows: number;

  peak: number;

  total: number;

  label: string;
}

export function localDay(t: number): string {
  const d = new Date(t);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export function dayLevel(tokens: number, peak: number): number {
  if (tokens <= 0 || peak <= 0) return 0;
  const f = tokens / peak;
  if (f > 0.75) return 4;
  if (f > 0.5) return 3;
  if (f > 0.25) return 2;
  return 1;
}

function tokensByDay(chats: readonly ChatSummary[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const c of chats) {
    const t = Date.parse(c.date);
    if (!Number.isFinite(t)) continue;
    const day = localDay(t);
    const tin = Number.isFinite(c.tokensIn) ? c.tokensIn : 0;
    const tout = Number.isFinite(c.tokensOut) ? c.tokensOut : 0;
    totals.set(day, (totals.get(day) ?? 0) + tin + tout);
  }
  return totals;
}

export function monthHeatmap(
  chats: readonly ChatSummary[],
  now: number = Date.now()
): Heatmap {
  const sums = tokensByDay(chats);
  const today = new Date(now);
  const year = today.getFullYear();
  const month = today.getMonth();

  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const leadingBlanks = (first.getDay() + 6) % 7;
  const rows = Math.ceil((leadingBlanks + daysInMonth) / 7);

  const cells: HeatCell[] = [];
  let peak = 0;
  let total = 0;
  for (let i = 0; i < rows * 7; i++) {
    const dayOfMonth = i - leadingBlanks + 1;
    if (dayOfMonth < 1 || dayOfMonth > daysInMonth) {
      cells.push({ day: null, tokens: 0, level: 0 });
      continue;
    }
    const d = new Date(year, month, dayOfMonth);

    if (d.getTime() > now) {
      cells.push({ day: null, tokens: 0, level: 0, future: true });
      continue;
    }
    const key = localDay(d.getTime());
    const tokens = sums.get(key) ?? 0;
    if (tokens > peak) peak = tokens;
    total += tokens;
    cells.push({ day: key, tokens, level: 0 });
  }

  for (const c of cells) c.level = dayLevel(c.tokens, peak);

  return {
    cells,
    rows,
    peak,
    total,
    label: first.toLocaleDateString(uiLocale(), { month: "long" }),
  };
}

export function monthStart(now: number = Date.now()): string {
  const d = new Date(now);
  return localDay(new Date(d.getFullYear(), d.getMonth(), 1).getTime());
}
