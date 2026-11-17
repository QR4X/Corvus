import type { UsageBucket } from "./aggregate";
import { mark, tr } from "../i18n/tr";

const DAY_MS = 86_400_000;

const MONTHS = [
  mark("Jan"), mark("Feb"), mark("Mar"), mark("Apr"), mark("May"), mark("Jun"),
  mark("Jul"), mark("Aug"), mark("Sep"), mark("Oct"), mark("Nov"), mark("Dec"),
];

function monthName(m: number): string | null {
  const name = MONTHS[m - 1];
  return name ? tr(name) : null;
}

export function shortDay(iso: string, withYear = false): string {
  const [y, m, d] = iso.split("-").map(Number);
  const month = monthName(m);
  if (!y || !month || !d) return iso;
  return withYear
    ? tr("{month} {day}, {year}", { month, day: d, year: y })
    : tr("{month} {day}", { month, day: d });
}

export type ChartStep = "day" | "week" | "month";

export interface Column {

  start: string;

  label: string;

  title: string;
  tokensIn: number;
  tokensOut: number;
  total: number;
  chats: number;
}

function ms(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

function dayKey(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((ms(to) - ms(from)) / DAY_MS) + 1;
}

export function stepFor(days: number): ChartStep {
  if (days <= 31) return "day";
  if (days <= 182) return "week";
  return "month";
}

function stepStart(t: number, step: ChartStep): number {
  const d = new Date(t);
  if (step === "week") {
    const dow = (d.getUTCDay() + 6) % 7;
    return t - dow * DAY_MS;
  }
  if (step === "month") {
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  }
  return t;
}

function stepLabel(start: string, step: ChartStep): string {
  if (step === "month") {
    const m = Number(start.split("-")[1]);
    return monthName(m) ?? start;
  }
  return shortDay(start);
}

function stepTitle(start: string, end: string, step: ChartStep): string {
  const year = start.slice(0, 4);
  if (step === "day") return shortDay(start, true);
  if (step === "month") {
    const m = Number(start.split("-")[1]);
    return `${monthName(m) ?? start} ${year}`;
  }
  return tr("{start} – {end}, {year}", {
    start: shortDay(start),
    end: shortDay(end),
    year,
  });
}

export function chartWindow(
  days: number,
  byDay: Record<string, UsageBucket>,
  now: number = Date.now()
): { from: string; to: string } | null {
  const keys = Object.keys(byDay).filter((k) => Number.isFinite(ms(k))).sort();
  if (keys.length === 0) return null;
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (days <= 0) return { from: first, to: last };
  const today = dayKey(now);
  const start = dayKey(ms(today) - (days - 1) * DAY_MS);
  return {
    from: start < first ? start : first,
    to: today > last ? today : last,
  };
}

export function timeSeries(
  byDay: Record<string, UsageBucket>,
  from: string,
  to: string,
  step: ChartStep
): Column[] {
  const start = ms(from);
  const end = ms(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];

  const columns: Column[] = [];
  const byStart = new Map<string, Column>();

  for (let t = stepStart(start, step); t <= end; ) {
    const k = dayKey(t);
    const next =
      step === "month"
        ? Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth() + 1, 1)
        : t + (step === "week" ? 7 : 1) * DAY_MS;

    const lastDay = dayKey(Math.min(next - DAY_MS, end));
    const col: Column = {
      start: k,
      label: stepLabel(k, step),
      title: stepTitle(k, lastDay, step),
      tokensIn: 0,
      tokensOut: 0,
      total: 0,
      chats: 0,
    };
    columns.push(col);
    byStart.set(k, col);
    t = next;
  }

  for (const [day, b] of Object.entries(byDay)) {
    const t = ms(day);
    if (!Number.isFinite(t) || t < start || t > end) continue;
    const col = byStart.get(dayKey(stepStart(t, step)));
    if (!col) continue;
    col.tokensIn += b.tokensIn;
    col.tokensOut += b.tokensOut;
    col.total += b.tokensIn + b.tokensOut;
    col.chats += b.chats;
  }

  return columns;
}

export function peakOf(columns: readonly Column[]): number {
  return columns.reduce((p, c) => (c.total > p ? c.total : p), 0);
}
