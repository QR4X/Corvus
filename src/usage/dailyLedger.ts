export interface LedgerEntry {
  r: number;
  i: number;
  o: number;
}

export type DailyLedger = Record<string, Record<string, LedgerEntry>>;

const SEP = "\u0001";

export function hourKey(when: Date): string {
  return when.toISOString().slice(0, 13);
}

export function addEntry(
  ledger: DailyLedger,
  when: Date,
  provider: string,
  model: string,
  delta: Partial<LedgerEntry>
): void {
  const hour = (ledger[hourKey(when)] ??= {});
  const key = `${provider}${SEP}${model}`;
  const l = (hour[key] ??= { r: 0, i: 0, o: 0 });
  l.r += delta.r ?? 0;
  l.i += delta.i ?? 0;
  l.o += delta.o ?? 0;
}

export function prune(ledger: DailyLedger, now: Date, hours = 50): void {
  const cutoff = hourKey(new Date(now.getTime() - hours * 3_600_000));
  for (const hour of Object.keys(ledger)) {
    if (hour < cutoff) delete ledger[hour];
  }
}

function wallClock(when: Date, timeZone: string): { y: number; m: number; d: number; ms: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(when);
  const n = (unit: string) => Number(parts.find((p) => p.type === unit)?.value ?? 0);
  const y = n("year");
  const m = n("month");
  const d = n("day");
  return { y, m, d, ms: Date.UTC(y, m - 1, d, n("hour") % 24, n("minute"), n("second")) };
}

function utcOffset(when: Date, timeZone: string): number {
  const wholeSeconds = Math.floor(when.getTime() / 1000) * 1000;
  return Math.round((wallClock(when, timeZone).ms - wholeSeconds) / 60_000) * 60_000;
}

export function startOfDay(now: Date, timeZone: string): Date {
  const { y, m, d } = wallClock(now, timeZone);
  const midnight = Date.UTC(y, m - 1, d);
  const guess = midnight - utcOffset(now, timeZone);
  return new Date(midnight - utcOffset(new Date(guess), timeZone));
}

export function msUntilRollover(now: Date, timeZone: string): number {
  const start = startOfDay(now, timeZone).getTime();
  const next = startOfDay(new Date(start + 36 * 3_600_000), timeZone).getTime();
  return Math.max(0, next - now.getTime());
}

export function sumSince(
  ledger: DailyLedger,
  start: Date,
  matches: (provider: string, model: string) => boolean
): LedgerEntry {
  const since = hourKey(start);
  const total: LedgerEntry = { r: 0, i: 0, o: 0 };
  for (const [hour, models] of Object.entries(ledger)) {
    if (hour < since) continue;
    for (const [key, l] of Object.entries(models)) {
      const cut = key.indexOf(SEP);
      const provider = key.slice(0, cut);
      const model = key.slice(cut + 1);
      if (!matches(provider, model)) continue;
      total.r += l.r;
      total.i += l.i;
      total.o += l.o;
    }
  }
  return total;
}

export function modelsSince(
  ledger: DailyLedger,
  start: Date,
  provider: string
): Array<{ model: string } & LedgerEntry> {
  const since = hourKey(start);
  const byModel = new Map<string, LedgerEntry>();
  for (const [hour, models] of Object.entries(ledger)) {
    if (hour < since) continue;
    for (const [key, l] of Object.entries(models)) {
      const cut = key.indexOf(SEP);
      if (key.slice(0, cut) !== provider) continue;
      const model = key.slice(cut + 1);
      const acc = byModel.get(model) ?? { r: 0, i: 0, o: 0 };
      acc.r += l.r;
      acc.i += l.i;
      acc.o += l.o;
      byModel.set(model, acc);
    }
  }
  return Array.from(byModel.entries())
    .map(([model, l]) => ({ model, ...l }))
    .sort((a, b) => b.r - a.r || a.model.localeCompare(b.model));
}
