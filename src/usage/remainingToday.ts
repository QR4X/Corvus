import type { KeyStatus } from "../providers/base";
import { tr } from "../i18n/tr";
import { geminiHasFreeTier } from "./freeTag";
import { openaiFreeAllowance, openaiFreeTierForModel } from "./freeTokens";
import {
  msUntilRollover,
  startOfDay,
  modelsSince,
  sumSince,
  type DailyLedger,
} from "./dailyLedger";
import { spendSince } from "./dailySpend";

export const SPEND_LIMIT_KEY = "__spend";

const AI_STUDIO_LIMITS_URL = "https://aistudio.google.com/rate-limit";

const PACIFIC_TIME_ZONE = "America/Los_Angeles";

function limitKeyFor(provider: string, model: string): string {
  return `${provider}\u0001${model}`;
}

type GaugeUnit = "tokens" | "requests" | "usd";

export interface Gauge {
  id: string;

  label: string;

  model?: string;
  used: number;

  limit?: number;

  remaining?: number;
  unit: GaugeUnit;

  source: "live" | "local";

  note?: string;

  limitKey?: string;
}

export interface TodayCard {
  provider: "spend" | "openai" | "gemini" | "openrouter" | "nim";
  name: string;

  resetsIn: number | null;

  resetsAt?: string;

  noReset?: string;
  gauges: Gauge[];

  empty?: string;

  note?: string;

  link?: { label: string; url: string };

  credit?: { remaining: number | null; spentToday?: number; resets?: string };
}

export interface TodayInput {
  ledger: DailyLedger;
  now: Date;

  hasKey: (provider: string) => boolean;
  openai: { dataSharing: boolean; tier: number };

  limits: Record<string, number>;

  openRouterQuota?: { limit: number; remaining?: number };

  openRouterKeyStatus?: KeyStatus | null;

  localTimeZone?: string;

  spendLimit?: number;

  blockAtLimit?: boolean;
}

const remainingOf = (limit: number | undefined, used: number): number | undefined =>
  limit == null ? undefined : Math.max(0, limit - used);

function userLimit(limits: Record<string, number>, key: string): number | undefined {
  const v = limits[key];
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : undefined;
}

function machineTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function remainingToday(e: TodayInput): TodayCard[] {
  const { ledger, now } = e;
  const cards: TodayCard[] = [];
  const utcMidnight = startOfDay(now, "UTC");
  const utcResetIn = msUntilRollover(now, "UTC");
  const usedSince = (provider: string, since: Date) =>
    sumSince(ledger, since, (p) => p === provider).r > 0;
  const timeZone = e.localTimeZone ?? machineTimeZone();
  const localMidnight = startOfDay(now, timeZone);

  const spend = spendSince(ledger, localMidnight);
  const spendLimit = e.spendLimit && e.spendLimit > 0 ? e.spendLimit : 0;
  if (spendLimit > 0 || spend.total > 0) {
    cards.push({
      provider: "spend",
      name: tr("Paid models"),
      resetsIn: msUntilRollover(now, timeZone),
      resetsAt: tr("midnight, your time"),
      gauges: [
        {
          id: "spend-today",
          label: tr("Spent today"),
          used: spend.total,
          limit: spendLimit || undefined,
          remaining: spendLimit ? Math.max(0, spendLimit - spend.total) : undefined,
          unit: "usd",
          source: "local",
          limitKey: SPEND_LIMIT_KEY,
        },
      ],
      note: [
        tr("Counted in this vault from public token prices. Gemini counts at paid prices, so a free-tier project may cost less."),
        spend.unpriced > 0
          ? spend.unpriced === 1
            ? tr("1 request on models without a public price isn't included.")
            : tr("{n} requests on models without a public price aren't included.", { n: spend.unpriced })
          : "",
        spendLimit > 0
          ? e.blockAtLimit
            ? tr("At the limit, paid models pause until midnight.")
            : tr("At the limit you get a heads-up; turn on “Stop paid models at the limit” in settings to pause them.")
          : tr("Set a limit to get a heads-up at 80% and 100%."),
        tr("Resets at midnight, your time."),
      ]
        .filter(Boolean)
        .join(" "),
    });
  }

  if (e.hasKey("openai") || usedSince("openai", utcMidnight)) {
    const allowance = openaiFreeAllowance(e.openai.tier, e.openai.dataSharing);
    const base: TodayCard = {
      provider: "openai",
      name: "OpenAI",
      resetsIn: utcResetIn,
      resetsAt: tr("00:00 UTC"),
      gauges: [],
    };
    if (!e.openai.dataSharing) {
      base.empty = tr(
        "No free tokens to track. If your organization shares API data with OpenAI, turn that on in settings."
      );
      base.resetsIn = null;
    } else if (!allowance.eligible) {
      base.empty = tr("Free tokens start at usage tier 1.");
      base.resetsIn = null;
    } else {
      const tierTokens = (tier: "big" | "mini") => {
        const s = sumSince(
          ledger,
          utcMidnight,
          (p, m) => p === "openai" && openaiFreeTierForModel(m) === tier
        );
        return s.i + s.o;
      };
      const bigUsed = tierTokens("big");
      const miniUsed = tierTokens("mini");
      base.gauges = [
        {
          id: "openai-big",
          label: tr("Flagship models"),
          used: bigUsed,
          limit: allowance.bigPerDay,
          remaining: remainingOf(allowance.bigPerDay, bigUsed),
          unit: "tokens",
          source: "local",
        },
        {
          id: "openai-mini",
          label: tr("Mini models"),
          used: miniUsed,
          limit: allowance.miniPerDay,
          remaining: remainingOf(allowance.miniPerDay, miniUsed),
          unit: "tokens",
          source: "local",
        },
      ];
      base.note = tr(
        "Free daily tokens for sharing API data with OpenAI. Flagship: GPT-5, GPT-4.1, GPT-4o, o1, o3. Mini: their mini and nano versions, and o4-mini. Counted in this vault: other apps on the same OpenAI organization draw from the same quota, so the real number may be lower. Resets at 00:00 UTC."
      );
    }
    cards.push(base);
  }

  const pacificMidnight = startOfDay(now, PACIFIC_TIME_ZONE);
  const geminiUsed = modelsSince(ledger, pacificMidnight, "gemini");
  if (e.hasKey("gemini") || geminiUsed.length > 0) {

    const prefix = limitKeyFor("gemini", "");
    const limitOnly = Object.keys(e.limits)
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.slice(prefix.length))
      .filter((m) => m && userLimit(e.limits, limitKeyFor("gemini", m)) != null)
      .filter((m) => !geminiUsed.some((u) => u.model === m))
      .sort((a, b) => a.localeCompare(b));
    const models = [
      ...geminiUsed.map((u) => ({ model: u.model, r: u.r })),
      ...limitOnly.map((model) => ({ model, r: 0 })),
    ];
    cards.push({
      provider: "gemini",
      name: "Gemini",
      resetsIn: msUntilRollover(now, PACIFIC_TIME_ZONE),
      resetsAt: tr("midnight Pacific"),
      gauges: models.map(({ model, r }): Gauge => {
        const key = limitKeyFor("gemini", model);
        const limit = userLimit(e.limits, key);
        return {
          id: `gemini:${model}`,
          label: model,
          model,
          used: r,
          limit,
          remaining: remainingOf(limit, r),
          unit: "requests",
          source: "local",
          limitKey: key,
          ...(geminiHasFreeTier(model) ? {} : { note: tr("Paid only") }),
        };
      }),
      empty: models.length === 0 ? tr("Nothing used since midnight Pacific.") : undefined,
      note: tr(
        "Requests per day, per model and per Google Cloud project. The free tier only exists on projects without billing, and Google shows its numbers in AI Studio, not in the docs: set each model's limit here to see what's left. Resets at midnight Pacific."
      ),
      link: { label: tr("Your limits in AI Studio"), url: AI_STUDIO_LIMITS_URL },
    });
  }

  if (e.hasKey("openrouter") || usedSince("openrouter", utcMidnight)) {

    const local = sumSince(
      ledger,
      utcMidnight,
      (p, m) => p === "openrouter" && m.endsWith(":free")
    ).r;
    const live = e.openRouterKeyStatus ?? null;
    const g = live?.free;
    let gauge: Gauge;
    if (g && (g.used != null || g.remaining != null)) {
      const used = g.used ?? Math.max(0, g.limit - (g.remaining ?? g.limit));
      gauge = {
        id: "openrouter-free",
        label: tr("Free models"),
        used,
        limit: g.limit,
        remaining: g.remaining ?? remainingOf(g.limit, used),
        unit: "requests",
        source: "live",
      };
    } else {
      const limit = g?.limit ?? e.openRouterQuota?.limit;
      gauge = {
        id: "openrouter-free",
        label: tr("Free models"),
        used: local,
        limit,
        remaining: remainingOf(limit, local),
        unit: "requests",
        source: "local",
      };
    }
    const card: TodayCard = {
      provider: "openrouter",
      name: "OpenRouter",
      resetsIn: utcResetIn,
      resetsAt: tr("00:00 UTC"),
      gauges: [gauge],
      note: [
        gauge.source === "live"
          ? tr("Counted by OpenRouter for this key, across every app that uses it.")
          : tr("Counted on this device: OpenRouter didn't answer, so other apps using this key aren't included."),
        tr(
          "Models ending in :free allow 20 requests a minute and 50 a day, or 1,000 a day once you've bought $10 in credits. Resets at 00:00 UTC."
        ),
      ].join(" "),
    };
    if (live && (live.creditRemaining !== undefined || live.spentToday !== undefined)) {
      card.credit = {
        remaining: live.creditRemaining ?? null,
        ...(live.spentToday !== undefined ? { spentToday: live.spentToday } : {}),
        ...(live.creditResetsAt ? { resets: live.creditResetsAt } : {}),
      };
    }
    cards.push(card);
  }

  if (e.hasKey("nim") || usedSince("nim", localMidnight)) {
    const today = sumSince(ledger, localMidnight, (p) => p === "nim").r;
    cards.push({
      provider: "nim",
      name: "NVIDIA NIM",
      resetsIn: null,
      noReset: tr("no daily cap"),
      gauges: [
        {
          id: "nim-today",
          label: tr("All models"),
          used: today,
          unit: "requests",
          source: "local",
        },
      ],
      note: tr(
        "Free endpoints allow 40 requests a minute. NVIDIA publishes no daily cap, so this is just what you used today (your local day)."
      ),
    });
  }

  return cards;
}

export function shortDuration(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "<1m";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function remainingFraction(m: Gauge): number | null {
  if (m.limit == null || m.limit <= 0 || m.remaining == null) return null;
  return Math.max(0, Math.min(1, m.remaining / m.limit));
}

export function gaugeLevel(m: Gauge): "ok" | "low" | "depleted" | null {
  const f = remainingFraction(m);
  if (f == null) return null;
  if (m.remaining === 0) return "depleted";
  return f <= 0.1 ? "low" : "ok";
}
