import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __setRequestUrl } from "obsidian";
import {
  msUntilRollover,
  startOfDay,
  addEntry,
  modelsSince,
  prune,
  sumSince,
  type DailyLedger,
} from "../src/usage/dailyLedger";
import { setUsageRecorder, setSpendGuard } from "../src/usage/recorder";
import { getProvider, providers } from "../src/providers";
import type { Provider } from "../src/providers/base";
import { keyStatusFrom } from "../src/providers/openrouter";
import { embedItems } from "../src/rag/embeddings";
import {
  SPEND_LIMIT_KEY,
  shortDuration,
  gaugeLevel,
  remainingToday,
  type TodayInput,
  type Gauge,
} from "../src/usage/remainingToday";
import { isPaid, spendSince, crossedMarks, knownPrice } from "../src/usage/dailySpend";

const H = 3_600_000;

describe("each provider's day", () => {
  it("UTC resets at UTC midnight", () => {
    expect(startOfDay(new Date("2026-10-02T15:30:00Z"), "UTC").toISOString()).toBe("2026-10-02T00:00:00.000Z");
    expect(msUntilRollover(new Date("2026-10-02T15:30:00Z"), "UTC")).toBe(8.5 * H);
  });

  it("Gemini resets at Pacific midnight (PDT -7 in October, PST -8 in December)", () => {
    expect(startOfDay(new Date("2026-10-02T15:30:00Z"), "America/Los_Angeles").toISOString()).toBe(
      "2026-10-02T07:00:00.000Z"
    );
    expect(startOfDay(new Date("2026-10-02T05:00:00Z"), "America/Los_Angeles").toISOString()).toBe(
      "2026-10-01T07:00:00.000Z"
    );
    expect(startOfDay(new Date("2026-12-10T12:00:00Z"), "America/Los_Angeles").toISOString()).toBe(
      "2026-12-10T08:00:00.000Z"
    );
  });

  it("on the day daylight saving ends, the day starts in PDT and the next one in PST", () => {
    const now = new Date("2026-11-01T20:00:00Z");
    expect(startOfDay(now, "America/Los_Angeles").toISOString()).toBe("2026-11-01T07:00:00.000Z");
    expect(msUntilRollover(now, "America/Los_Angeles")).toBe(12 * H);
  });

  it("on the day daylight saving starts, the day starts in PST and lasts 23 hours", () => {
    const now = new Date("2026-03-08T19:00:00Z");
    expect(startOfDay(now, "America/Los_Angeles").toISOString()).toBe("2026-03-08T08:00:00.000Z");
    expect(msUntilRollover(now, "America/Los_Angeles")).toBe(12 * H);
  });

  it("uses the user's time zone (Sao Paulo, UTC-3)", () => {
    expect(startOfDay(new Date("2026-10-02T02:00:00Z"), "America/Sao_Paulo").toISOString()).toBe(
      "2026-10-01T03:00:00.000Z"
    );
  });

  it("shortDuration shows hours and minutes without seconds", () => {
    expect(shortDuration(8.5 * H)).toBe("8h 30m");
    expect(shortDuration(H)).toBe("1h");
    expect(shortDuration(42 * 60_000)).toBe("42m");
    expect(shortDuration(59_000)).toBe("<1m");
  });
});

describe("the daily ledger", () => {
  it("sums per hour and per model and cuts at the start of the day", () => {
    const ledger: DailyLedger = {};
    addEntry(ledger, new Date("2026-10-02T10:15:00Z"), "gemini", "gemini-2.5-flash", { r: 1, i: 100, o: 10 });
    addEntry(ledger, new Date("2026-10-02T10:45:00Z"), "gemini", "gemini-2.5-flash", { r: 1, i: 50, o: 5 });
    addEntry(ledger, new Date("2026-10-02T11:00:00Z"), "gemini", "gemini-2.5-pro", { r: 3 });
    addEntry(ledger, new Date("2026-10-02T06:00:00Z"), "gemini", "gemini-2.5-pro", { r: 9 });
    expect(ledger["2026-10-02T10"]["gemini\u0001gemini-2.5-flash"]).toEqual({ r: 2, i: 150, o: 15 });

    const since = new Date("2026-10-02T07:00:00Z");
    expect(sumSince(ledger, since, (p) => p === "gemini")).toEqual({ r: 5, i: 150, o: 15 });
    expect(modelsSince(ledger, since, "gemini").map((x) => [x.model, x.r])).toEqual([
      ["gemini-2.5-pro", 3],
      ["gemini-2.5-flash", 2],
    ]);
  });

  it("a model id may contain slashes and colons (OpenRouter)", () => {
    const ledger: DailyLedger = {};
    addEntry(ledger, new Date("2026-10-02T10:00:00Z"), "openrouter", "meta-llama/llama-3.3-70b-instruct:free", { r: 1 });
    expect(modelsSince(ledger, new Date("2026-10-02T00:00:00Z"), "openrouter")[0].model).toBe(
      "meta-llama/llama-3.3-70b-instruct:free"
    );
  });

  it("pruning drops entries older than 50 hours so the ledger does not grow", () => {
    const ledger: DailyLedger = {};
    addEntry(ledger, new Date("2026-09-29T00:00:00Z"), "nim", "x", { r: 1 });
    addEntry(ledger, new Date("2026-10-01T00:00:00Z"), "nim", "x", { r: 1 });
    prune(ledger, new Date("2026-10-02T12:00:00Z"));
    expect(Object.keys(ledger)).toEqual(["2026-10-01T00"]);
  });
});

describe("the recorder logs provider usage into the ledger", () => {
  const recorded: Array<[string, string, unknown]> = [];
  beforeEach(() => {
    recorded.length = 0;
    setUsageRecorder((p, m, d) => recorded.push([p, m, d]));
  });
  afterEach(() => {
    setUsageRecorder(null);
    delete providers.fake;
  });

  const req = { model: "m-1", messages: [] } as unknown as Parameters<Provider["chat"]>[0];

  const fake = (over: Partial<Provider>): Provider =>
    ({
      id: "fake",
      name: "Fake",
      listModels: async () => ["m-1"],
      chat: async () => ({ content: "ok", usage: { input: 10, output: 5 } }),
      streamChat: async () => ({ content: "" }),
      ...over,
    }) as unknown as Provider;

  it("a stream counts one request with the last usage, so cumulative reports are not doubled", async () => {
    providers.fake = fake({
      streamChat: async (_r, _k, onToken, onUsage) => {
        onToken("a");
        onUsage?.({ input: 100, output: 1 });
        onUsage?.({ input: 100, output: 20 });
        return { content: "a" };
      },
    });
    await getProvider("fake").streamChat(req, "k", () => {});
    expect(recorded).toEqual([["fake", "m-1", { r: 1, i: 100, o: 20 }]]);
  });

  it("a stream without usage callbacks uses the response usage", async () => {
    providers.fake = fake({
      streamChat: async (_r, _k, onToken) => {
        onToken("a");
        return { content: "a", usage: { input: 7, output: 3 } };
      },
    });
    await getProvider("fake").streamChat(req, "k", () => {});
    expect(recorded).toEqual([["fake", "m-1", { r: 1, i: 7, o: 3 }]]);
  });

  it("a stream stopped midway still counts because the server accepted it", async () => {
    providers.fake = fake({
      streamChat: async (_r, _k, onToken) => {
        onToken("a");
        throw new Error("aborted");
      },
    });
    await expect(getProvider("fake").streamChat(req, "k", () => {})).rejects.toThrow("aborted");
    expect(recorded).toEqual([["fake", "m-1", { r: 1, i: 0, o: 0 }]]);
  });

  it("a request rejected before starting (429, bad key) does not count", async () => {
    providers.fake = fake({
      streamChat: async () => {
        throw new Error("429");
      },
      chat: async () => {
        throw new Error("401");
      },
    });
    await expect(getProvider("fake").streamChat(req, "k", () => {})).rejects.toThrow();
    await expect(getProvider("fake").chat(req, "k")).rejects.toThrow();
    expect(recorded).toEqual([]);
  });

  it("the spend guard blocks before sending and nothing is recorded", async () => {
    let sent = false;
    providers.fake = fake({
      chat: async () => {
        sent = true;
        return { content: "x" };
      },
    });
    setSpendGuard(() => {
      throw new Error("limit reached");
    });
    try {
      await expect(getProvider("fake").chat(req, "k")).rejects.toThrow("limit reached");
      await expect(getProvider("fake").streamChat(req, "k", () => {})).rejects.toThrow("limit reached");
    } finally {
      setSpendGuard(null);
    }
    expect(sent).toBe(false);
    expect(recorded).toEqual([]);
  });

  it("chat counts one request with the response tokens", async () => {
    providers.fake = fake({});
    await getProvider("fake").chat(req, "k");
    expect(recorded).toEqual([["fake", "m-1", { r: 1, i: 10, o: 5 }]]);
  });

  it("other methods pass through and replacing the provider replaces the wrapper", async () => {
    providers.fake = fake({});
    const w = getProvider("fake");
    expect(w).toBe(getProvider("fake"));
    expect(await w.listModels("k")).toEqual(["m-1"]);
    providers.fake = fake({ chat: async () => ({ content: "new", usage: { input: 1, output: 1 } }) });
    expect((await getProvider("fake").chat(req, "k")).content).toBe("new");
  });
});

describe("embeddings also use the daily quota", () => {
  const recorded: Array<[string, string, unknown]> = [];
  beforeEach(() => {
    recorded.length = 0;
    setUsageRecorder((p, m, d) => recorded.push([p, m, d]));
    vi.stubGlobal("window", { setTimeout, clearTimeout });
  });
  afterEach(() => {
    setUsageRecorder(null);
    __setRequestUrl(null);
    vi.unstubAllGlobals();
  });
  const creds = { openaiApiKey: "", openrouterApiKey: "", geminiApiKey: "g", nimApiKey: "" };

  it("counts one request per successful call (Gemini)", async () => {
    __setRequestUrl(async () => ({
      status: 200,
      json: { data: [{ embedding: [0.1, 0.2], index: 0 }], usage: { prompt_tokens: 7, total_tokens: 7 } },
    }));
    await embedItems([{ kind: "text", text: "hi" }], creds, "gemini-embedding-001");
    expect(recorded).toEqual([["gemini", "gemini-embedding-001", { r: 1, i: 7 }]]);
  });

  it("a rejected request (429) does not count", async () => {
    __setRequestUrl(async () => ({ status: 429, json: {}, text: "" }));
    await expect(embedItems([{ kind: "text", text: "hi" }], creds, "gemini-embedding-001")).rejects.toThrow();
    expect(recorded).toEqual([]);
  });
});

describe("the OpenRouter key status (/api/v1/key)", () => {
  it("reads daily free requests, credit, spend today and the reset period", () => {
    expect(
      keyStatusFrom({
        data: {
          free_model_daily_requests: { used: 20, limit: 50, remaining: 30 },
          limit_remaining: 4.2,
          usage_daily: 0.31,
          limit_reset: "monthly",
        },
      })
    ).toEqual({
      free: { limit: 50, used: 20, remaining: 30 },
      creditRemaining: 4.2,
      spentToday: 0.31,
      creditResetsAt: "monthly",
    });
  });

  it("a key without a cap has null credit and missing fields are not invented", () => {
    expect(keyStatusFrom({ data: { limit_remaining: null } })).toEqual({ creditRemaining: null });
    expect(keyStatusFrom({ data: {} })).toEqual({});
    expect(keyStatusFrom({ data: { is_free_tier: true } })).toEqual({ free: { limit: 50 } });
    expect(keyStatusFrom(null)).toBeNull();
  });
});

describe("the Left today cards", () => {
  const now = new Date("2026-10-02T15:30:00Z");
  const makeLedger = (): DailyLedger => {
    const l: DailyLedger = {};

    addEntry(l, new Date("2026-10-02T01:00:00Z"), "openai", "gpt-5", { r: 1, i: 1000, o: 500 });
    addEntry(l, new Date("2026-10-01T23:00:00Z"), "openai", "gpt-5", { r: 1, i: 9999, o: 1 });
    addEntry(l, new Date("2026-10-02T10:00:00Z"), "openai", "gpt-5-mini", { r: 1, i: 2000, o: 0 });
    addEntry(l, new Date("2026-10-02T10:00:00Z"), "openai", "gpt-image-1", { r: 1, i: 50, o: 50 });
    addEntry(l, new Date("2026-10-02T06:00:00Z"), "gemini", "gemini-2.5-flash", { r: 5 });
    addEntry(l, new Date("2026-10-02T08:00:00Z"), "gemini", "gemini-2.5-flash", { r: 12 });
    addEntry(l, new Date("2026-10-02T09:00:00Z"), "gemini", "gemini-2.5-flash-image", { r: 2 });
    addEntry(l, new Date("2026-10-02T03:00:00Z"), "openrouter", "meta-llama/llama-3.3-70b-instruct:free", { r: 13 });
    addEntry(l, new Date("2026-10-02T03:00:00Z"), "openrouter", "inclusionai/ling-3.1-flash", { r: 4 });
    addEntry(l, new Date("2026-10-02T14:00:00Z"), "nim", "meta/llama-3.1-70b-instruct", { r: 23 });
    addEntry(l, new Date("2026-10-02T02:00:00Z"), "nim", "meta/llama-3.1-70b-instruct", { r: 6 });
    return l;
  };
  const base = (over: Partial<TodayInput> = {}): TodayInput => ({
    ledger: makeLedger(),
    now: now,
    hasKey: () => true,
    openai: { dataSharing: true, tier: 1 },
    limits: {},
    openRouterQuota: { limit: 50 },
    localTimeZone: "America/Sao_Paulo",
    ...over,
  });
  const gauge = (cards: ReturnType<typeof remainingToday>, provider: string, id: string): Gauge =>
    cards.find((c) => c.provider === provider)!.gauges.find((m) => m.id === id)!;

  it("keeps a fixed order and only shows providers with a key or usage today", () => {
    expect(remainingToday(base()).map((c) => c.provider)).toEqual(["spend", "openai", "gemini", "openrouter", "nim"]);
    expect(remainingToday(base({ ledger: {}, hasKey: () => false }))).toEqual([]);
    expect(remainingToday(base({ ledger: {}, hasKey: (p) => p === "gemini" })).map((c) => c.provider)).toEqual(["gemini"]);
    expect(remainingToday(base({ hasKey: () => false })).map((c) => c.provider)).toEqual([
      "spend",
      "openai",
      "gemini",
      "openrouter",
      "nim",
    ]);
  });

  it("OpenAI shows both UTC daily buckets and excludes image models", () => {
    const c = remainingToday(base());
    expect(gauge(c, "openai", "openai-big")).toMatchObject({ used: 1500, limit: 250_000, remaining: 248_500 });
    expect(gauge(c, "openai", "openai-mini")).toMatchObject({ used: 2000, limit: 2_500_000, remaining: 2_498_000 });
    expect(c.find((x) => x.provider === "openai")!.resetsIn).toBe(8.5 * H);
    const t3 = remainingToday(base({ openai: { dataSharing: true, tier: 3 } }));
    expect(gauge(t3, "openai", "openai-big").limit).toBe(1_000_000);
  });

  it("OpenAI without data sharing explains why, with no gauge and no reset timer", () => {
    const o = remainingToday(base({ openai: { dataSharing: false, tier: 1 } })).find((x) => x.provider === "openai")!;
    expect(o.gauges).toEqual([]);
    expect(o.empty).toMatch(/shares API data/);
    expect(o.resetsIn).toBeNull();
    expect(
      remainingToday(base({ openai: { dataSharing: true, tier: 0 } })).find((x) => x.provider === "openai")!.empty
    ).toMatch(/tier 1/);
  });

  it("Gemini shows gauges per model on the Pacific day and flags paid-only models", () => {
    const c = remainingToday(base());
    const g = c.find((x) => x.provider === "gemini")!;
    expect(g.gauges.map((m) => [m.model, m.used])).toEqual([
      ["gemini-2.5-flash", 12],
      ["gemini-2.5-flash-image", 2],
    ]);
    expect(g.gauges[0]).toMatchObject({ limit: undefined, remaining: undefined, limitKey: "gemini\u0001gemini-2.5-flash" });
    expect(g.gauges[1].note).toMatch(/Paid only/);
    expect(g.resetsIn).toBe(15.5 * H);
    expect(g.link?.url).toBe("https://aistudio.google.com/rate-limit");
  });

  it("Gemini turns a user-set cap into remaining requests and shows capped models without usage", () => {
    const c = remainingToday(
      base({
        limits: {
          "gemini\u0001gemini-2.5-flash": 250,
          "gemini\u0001gemini-2.5-pro": 100,
          "gemini\u0001junk": 0,
        },
      })
    );
    const g = c.find((x) => x.provider === "gemini")!;
    expect(g.gauges.map((m) => [m.model, m.used, m.remaining])).toEqual([
      ["gemini-2.5-flash", 12, 238],
      ["gemini-2.5-flash-image", 2, undefined],
      ["gemini-2.5-pro", 0, 100],
    ]);
  });

  it("OpenRouter without key status counts :free requests on this device", () => {
    const m = gauge(remainingToday(base()), "openrouter", "openrouter-free");
    expect(m).toMatchObject({ used: 13, limit: 50, remaining: 37, source: "local" });
    expect(remainingToday(base()).find((x) => x.provider === "openrouter")!.note).toMatch(/^Counted on this device/);
  });

  it("OpenRouter with key status uses its numbers and includes the credit", () => {
    const live = keyStatusFrom({
      data: {
        free_model_daily_requests: { used: 20, limit: 50, remaining: 30 },
        limit_remaining: 4.2,
        usage_daily: 0.31,
        limit_reset: "monthly",
      },
    });
    const c = remainingToday(base({ openRouterKeyStatus: live }));
    expect(gauge(c, "openrouter", "openrouter-free")).toMatchObject({ used: 20, limit: 50, remaining: 30, source: "live" });
    expect(c.find((x) => x.provider === "openrouter")!.credit).toEqual({ remaining: 4.2, spentToday: 0.31, resets: "monthly" });
    expect(c.find((x) => x.provider === "openrouter")!.note).toMatch(/^Counted by OpenRouter for this key/);
  });

  it("OpenRouter key status with only the tier uses its cap and the local count", () => {
    const c = remainingToday(base({ openRouterKeyStatus: keyStatusFrom({ data: { is_free_tier: false } }) }));
    expect(gauge(c, "openrouter", "openrouter-free")).toMatchObject({ used: 13, limit: 1000, remaining: 987, source: "local" });
  });

  it("NIM uses the user's day with no daily cap", () => {
    const n = remainingToday(base()).find((x) => x.provider === "nim")!;
    expect(n.gauges[0].used).toBe(23);
    expect(n.gauges[0].limit).toBeUndefined();
    expect(n.resetsIn).toBeNull();
    expect(n.noReset).toBe("no daily cap");
    expect(n.note).toMatch(/40 requests a minute/);
  });

  it("the gauge level is depleted, low or ok", () => {
    const m = (remaining: number, limit = 100): Gauge => ({
      id: "x",
      label: "x",
      used: limit - remaining,
      limit,
      remaining: remaining,
      unit: "requests",
      source: "local",
    });
    expect(gaugeLevel(m(0))).toBe("depleted");
    expect(gaugeLevel(m(10))).toBe("low");
    expect(gaugeLevel(m(50))).toBe("ok");
    expect(gaugeLevel({ ...m(5), limit: undefined, remaining: undefined })).toBeNull();
  });
});

describe("daily spend and the spend limit", () => {
  const now = new Date("2026-10-02T15:30:00Z");
  const makeLedger = (): DailyLedger => {
    const l: DailyLedger = {};

    addEntry(l, new Date("2026-10-02T12:00:00Z"), "openai", "gpt-5-nano", { r: 2, i: 1_000_000, o: 1_000_000 });
    addEntry(l, new Date("2026-10-02T02:00:00Z"), "openai", "gpt-5-nano", { r: 1, i: 9_000_000, o: 0 });
    addEntry(l, new Date("2026-10-02T12:00:00Z"), "openrouter", "x/y:free", { r: 4, i: 500_000, o: 500_000 });
    addEntry(l, new Date("2026-10-02T12:00:00Z"), "ollama", "llama3.2", { r: 3, i: 900_000, o: 900_000 });
    addEntry(l, new Date("2026-10-02T12:00:00Z"), "nim", "some/unpriced-model", { r: 5, i: 10, o: 10 });
    return l;
  };

  it("sums public prices on the user's day and counts unpriced requests separately", () => {
    const g = spendSince(makeLedger(), startOfDay(now, "America/Sao_Paulo"));
    const p = knownPrice("openai", "gpt-5-nano")!;
    expect(g.total).toBeCloseTo(p.input + p.output, 6);
    expect(g.unpriced).toBe(5);
    expect(knownPrice("ollama", "any")).toEqual({ input: 0, output: 0 });
    expect(isPaid("openrouter", "x/y:free")).toBe(false);
    expect(isPaid("openai", "gpt-5-nano")).toBe(true);
    expect(isPaid("nim", "some/unpriced-model")).toBe(false);
  });

  it("the 80% and 100% marks fire once each, only when crossed", () => {
    expect(crossedMarks(0.5, 0.85, 1)).toEqual([80]);
    expect(crossedMarks(0.85, 1.2, 1)).toEqual([100]);
    expect(crossedMarks(0.1, 1.5, 1)).toEqual([80, 100]);
    expect(crossedMarks(0.85, 0.9, 1)).toEqual([]);
    expect(crossedMarks(0, 5, 0)).toEqual([]);
  });

  it("the Paid models card gauges spend against an editable limit and notes what is excluded", () => {
    const base = {
      ledger: makeLedger(),
      now: now,
      hasKey: () => false,
      openai: { dataSharing: false, tier: 1 },
      limits: {},
      localTimeZone: "America/Sao_Paulo",
    };
    const p = knownPrice("openai", "gpt-5-nano")!;
    const total = p.input + p.output;
    const withLimit = remainingToday({ ...base, spendLimit: 2, blockAtLimit: true })[0];
    expect(withLimit.provider).toBe("spend");
    expect(withLimit.gauges[0]).toMatchObject({ unit: "usd", limit: 2, limitKey: SPEND_LIMIT_KEY });
    expect(withLimit.gauges[0].remaining).toBeCloseTo(2 - total, 6);
    expect(withLimit.note).toMatch(/5 requests on models without a public price aren't included/);
    expect(withLimit.note).toMatch(/paid models pause until midnight/);
    expect(remainingToday({ ...base, ledger: {}, spendLimit: 0 }).map((c) => c.provider)).not.toContain("spend");

    const noLimit = remainingToday({ ...base, spendLimit: 0 })[0];
    expect(noLimit.gauges[0].limit).toBeUndefined();
    expect(noLimit.note).toMatch(/Set a limit/);
  });
});
