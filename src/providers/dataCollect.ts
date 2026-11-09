import { HOT_DATA } from "./hotData.generated";

const HOT_BASELINE: [RegExp, number][] = (
  HOT_DATA.length > 0
    ? HOT_DATA
    : ([
        ["claude-(fable|opus|sonnet)", 0.96],
        ["(^|/)gpt-(4o|5)", 0.9],
        ["gemini-(3|2\\.5)", 0.85],
      ] as [string, number][])
)

  .reduce<[RegExp, number][]>((acc, [pat, score]) => {
    try {
      acc.push([new RegExp(pat), score]);
    } catch (e) {
      console.warn(`[dataCollect] invalid baseline pattern, ignored: ${pat}`, e);
    }
    return acc;
  }, []);

let LOCAL_USAGE: Record<string, number> = {};

export function registerLocalUsage(byModelCount: Record<string, number>): void {
  const values = Object.values(byModelCount);
  const max = Math.max(1, ...values);
  const next: Record<string, number> = {};
  for (const [model, count] of Object.entries(byModelCount)) {
    if (count > 0) next[model.toLowerCase()] = count / max;
  }
  LOCAL_USAGE = next;
}

export interface HotInfo {

  level: 0 | 1 | 2 | 3;

  score: number;

  usedLocally: boolean;
}

const BASELINE_CACHE = new Map<string, number>();

function baselineFor(id: string): number {
  const cached = BASELINE_CACHE.get(id);
  if (cached !== undefined) return cached;

  let best = 0;
  for (const [re, s] of HOT_BASELINE) {
    if (s > best && re.test(id)) best = s;
  }
  BASELINE_CACHE.set(id, best);
  return best;
}

export function getHotLevel(provider: string, model: string): HotInfo {
  const id = (model || "").toLowerCase();
  const base = baselineFor(id);
  const local = LOCAL_USAGE[id] ?? 0;
  const score = Math.min(1, base * 0.65 + local * 0.7);
  const level: HotInfo["level"] =
    score >= 0.72 ? 3 : score >= 0.45 ? 2 : score >= 0.2 ? 1 : 0;
  return { level, score, usedLocally: local > 0 };
}

export function hotLabel(info: HotInfo): string {
  switch (info.level) {
    case 3: return info.usedLocally ? "Trending · you use it a lot" : "Trending";
    case 2: return info.usedLocally ? "Popular · you use it" : "Popular";
    case 1: return "Well-known";
    default: return "";
  }
}
