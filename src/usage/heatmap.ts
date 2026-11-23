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
  
  // To render a gorgeous wide GitHub-like timeline:
  // We render the last 15 weeks (15 columns x 7 rows = 105 cells)
  // Align cells starting on Monday of each week.
  const cells: HeatCell[] = [];
  let peak = 0;
  let total = 0;
  
  // Calculate Monday of 14 weeks ago
  const start = new Date(now);
  start.setDate(start.getDate() - 14 * 7);
  const leadingBlanks = (start.getDay() + 6) % 7; // Align to Monday
  start.setDate(start.getDate() - leadingBlanks);
  
  const totalDays = 15 * 7; // 15 full weeks
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(start.getTime());
    d.setDate(d.getDate() + i);
    
    if (d.getTime() > now) {
      cells.push({ day: null, tokens: 0, level: 0, future: true });
      continue;
    }
    
    const key = localDay(d.getTime());
    const tokens = sums.get(key) ?? 0;
    if (tokens > peak) peak = tokens;
    
    // Only count current month towards the text summary total
    if (d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear()) {
      total += tokens;
    }
    
    cells.push({ day: key, tokens, level: 0 });
  }
  
  for (const c of cells) {
    if (c.day) c.level = dayLevel(c.tokens, peak);
  }
  
  const currentMonthName = today.toLocaleDateString(uiLocale(), { month: "long" });
  
  return {
    cells,
    rows: 7, // Fixed 7 days a week
    peak,
    total,
    label: currentMonthName,
  };
}

export function monthStart(now: number = Date.now()): string {
  const d = new Date(now);
  return localDay(new Date(d.getFullYear(), d.getMonth(), 1).getTime());
}