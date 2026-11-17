import { getPricing } from "./pricing";
import { getAllEmbeddingModels } from "../rag/types";
import { hourKey, startOfDay, type DailyLedger } from "./dailyLedger";

export interface UnitPrice {
  input: number;
  output: number;
}

export function knownPrice(provider: string, model: string): UnitPrice | null {
  if (provider === "ollama") return { input: 0, output: 0 };
  const p = getPricing(provider, model);
  if (p.inputPerMillion != null && p.outputPerMillion != null) {
    return { input: p.inputPerMillion, output: p.outputPerMillion };
  }
  const emb = getAllEmbeddingModels().find((m) => m.model === model && !m.discovered);
  if (emb) return { input: emb.pricePerMillion, output: 0 };
  return null;
}

export function isPaid(provider: string, model: string): boolean {
  const p = knownPrice(provider, model);
  return !!p && (p.input > 0 || p.output > 0);
}

interface Spend {

  total: number;

  unpriced: number;
}

export function spendSince(
  ledger: DailyLedger,
  start: Date,
  priceOf: (provider: string, model: string) => UnitPrice | null = knownPrice
): Spend {
  const since = hourKey(start);
  let total = 0;
  let unpriced = 0;
  for (const [hour, models] of Object.entries(ledger)) {
    if (hour < since) continue;
    for (const [key, l] of Object.entries(models)) {
      const cut = key.indexOf("\u0001");
      const p = priceOf(key.slice(0, cut), key.slice(cut + 1));
      if (!p) {
        unpriced += l.r;
        continue;
      }
      total += (l.i / 1_000_000) * p.input + (l.o / 1_000_000) * p.output;
    }
  }
  return { total, unpriced };
}

function machineTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function spendToday(ledger: DailyLedger, now: Date, timeZone = machineTimeZone()): Spend {
  return spendSince(ledger, startOfDay(now, timeZone));
}

export function crossedMarks(before: number, after: number, limit: number): Array<80 | 100> {
  if (!(limit > 0)) return [];
  const marks: Array<80 | 100> = [];
  for (const m of [80, 100] as const) {
    const threshold = (limit * m) / 100;
    if (before < threshold && after >= threshold) marks.push(m);
  }
  return marks;
}

export function usd(n: number): string {
  if (n === 0) return "$0.00";
  if (n > 0 && n < 0.01) return "<$0.01";
  return `$${n.toFixed(2)}`;
}
