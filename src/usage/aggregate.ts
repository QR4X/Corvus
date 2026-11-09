import { type ChatSummary } from "../core/chatPersistence";
import { calculateCost, getPricing, type ModelPricing } from "./pricing";

export interface UsageBucket {
  chats: number;
  tokensIn: number;
  tokensOut: number;
  cost: number; 

  hasUnknownCost: boolean;
}

export interface ChatUsageRow {
  id: string;
  title: string;
  date: string;

  day: string;
  provider: string;
  model: string;
  mode: string;
  tokensIn: number;
  tokensOut: number;
  cost: number | null; 
  messages: number;
  filePath: string;
}

export interface UsageAggregate {
  total: UsageBucket;
  byProvider: Record<string, UsageBucket>;
  byModel: Record<string, UsageBucket>;
  byMode: Record<string, UsageBucket>;

  byDay: Record<string, UsageBucket>;

  chats: ChatUsageRow[];

  periodStart: string | null;
  periodEnd: string | null;
}

function emptyBucket(): UsageBucket {
  return {
    chats: 0,
    tokensIn: 0,
    tokensOut: 0,
    cost: 0,
    hasUnknownCost: false,
  };
}

function dayFromIso(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function bump(bucket: UsageBucket, row: ChatUsageRow): void {
  bucket.chats += 1;
  bucket.tokensIn += row.tokensIn;
  bucket.tokensOut += row.tokensOut;
  if (row.cost == null) {
    bucket.hasUnknownCost = true;
  } else {
    bucket.cost += row.cost;
  }
}

function summaryToRow(s: ChatSummary, pricingCache?: Map<string, ModelPricing>): ChatUsageRow {
  let pricing: ModelPricing;
  if (pricingCache) {
    const key = `${s.provider}::${(s.model || "").toLowerCase()}`;
    pricing = pricingCache.get(key) ?? getPricing(s.provider, s.model);
    pricingCache.set(key, pricing);
  } else {
    pricing = getPricing(s.provider, s.model);
  }

  const tokensIn = Number.isFinite(s.tokensIn) ? s.tokensIn : 0;
  const tokensOut = Number.isFinite(s.tokensOut) ? s.tokensOut : 0;
  const cost = calculateCost(pricing, tokensIn, tokensOut);
  return {
    id: s.id,
    title: s.title,
    date: s.date,
    day: dayFromIso(s.date),
    provider: s.provider,
    model: s.model,
    mode: s.mode,
    tokensIn,
    tokensOut,
    cost,
    messages: s.messageCount,
    filePath: s.filePath,
  };
}

function filterByPeriod(rows: ChatUsageRow[], periodDays?: number): ChatUsageRow[] {
  if (!periodDays || periodDays <= 0) return rows;
  const cutoffMs = Date.now() - periodDays * 24 * 60 * 60 * 1000;
  return rows.filter((r) => {
    const t = Date.parse(r.date);
    return !isNaN(t) && t >= cutoffMs;
  });
}

export function aggregateFromSummaries(
  summaries: ChatSummary[],
  periodDays = 0
): UsageAggregate {

  const pricingCache = new Map<string, ModelPricing>();
  const rawRows = summaries.map((s) => summaryToRow(s, pricingCache));
  const rows = filterByPeriod(rawRows, periodDays);

  const total = emptyBucket();
  const byProvider: Record<string, UsageBucket> = {};
  const byModel: Record<string, UsageBucket> = {};
  const byMode: Record<string, UsageBucket> = {};
  const byDay: Record<string, UsageBucket> = {};

  let minDate: string | null = null;
  let maxDate: string | null = null;

  for (const row of rows) {
    bump(total, row);

    const p = row.provider || "(unknown)";
    byProvider[p] ??= emptyBucket();
    bump(byProvider[p], row);

    const m = row.model || "(unknown)";
    byModel[m] ??= emptyBucket();
    bump(byModel[m], row);

    const mode = row.mode || "chat";
    byMode[mode] ??= emptyBucket();
    bump(byMode[mode], row);

    const day = row.day || "(no date)";
    byDay[day] ??= emptyBucket();
    bump(byDay[day], row);

    if (row.day) {
      if (!minDate || row.day < minDate) minDate = row.day;
      if (!maxDate || row.day > maxDate) maxDate = row.day;
    }
  }

  const sortedChats = [...rows].sort((a, b) => {
    if (a.cost == null && b.cost == null) return 0;
    if (a.cost == null) return 1;
    if (b.cost == null) return -1;
    return b.cost - a.cost;
  });

  return {
    total,
    byProvider,
    byModel,
    byMode,
    byDay,
    chats: sortedChats,
    periodStart: minDate,
    periodEnd: maxDate,
  };
}

export function sortBucketEntries(
  buckets: Record<string, UsageBucket>
): Array<[string, UsageBucket]> {
  return Object.entries(buckets).sort(([, a], [, b]) => b.cost - a.cost);
}
