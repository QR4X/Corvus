import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  searchOptions,
  topChats,
  dateRange,
  slicesOf,
  visibleOptions,
  sliceReport,
  withoutDimension,
  selectedCount,
  averagePerChat,
  metricOf,
  pageModels,
  priceKind,
  worthFiltering,
} from "../src/usage/page";
import { EMPTY_FILTER } from "../src/usage/filters";
import type {
  ChatUsageRow,
  UsageAggregate,
  UsageBucket,
} from "../src/usage/aggregate";

const bucket = (over: Partial<UsageBucket> = {}): UsageBucket => ({
  chats: 1,
  tokensIn: 100,
  tokensOut: 50,
  cost: 0,
  hasUnknownCost: false,
  ...over,
});

const row = (over: Partial<ChatUsageRow> = {}): ChatUsageRow => ({
  id: "a",
  title: "t",
  date: "2026-09-01T10:00:00Z",
  day: "2026-09-01",
  provider: "openai",
  model: "gpt-5",
  mode: "chat",
  tokensIn: 100,
  tokensOut: 50,
  cost: 0,
  messages: 2,
  filePath: "p",
  ...over,
});

function aggregateOf(
  models: Record<string, UsageBucket>,
  chats: ChatUsageRow[] = []
): UsageAggregate {
  const total = Object.values(models).reduce(
    (t, b) => ({
      chats: t.chats + b.chats,
      tokensIn: t.tokensIn + b.tokensIn,
      tokensOut: t.tokensOut + b.tokensOut,
      cost: t.cost + b.cost,
      hasUnknownCost: t.hasUnknownCost || b.hasUnknownCost,
    }),
    bucket({ chats: 0, tokensIn: 0, tokensOut: 0 })
  );
  return {
    total,
    byProvider: {},
    byModel: models,
    byMode: {},
    byDay: {},
    chats,
    periodStart: null,
    periodEnd: null,
  };
}

describe("page unit", () => {
  it("uses cost when money was spent and tokens otherwise", () => {
    expect(metricOf(bucket({ cost: 0.01 }))).toBe("cost");
    expect(metricOf(bucket({ cost: 0 }))).toBe("tokens");
    expect(metricOf(bucket({ cost: 0, hasUnknownCost: true }))).toBe("tokens");
  });

  it("distinguishes free from unpriced zero cost", () => {
    expect(priceKind(bucket({ cost: 1 }))).toBe("paid");
    expect(priceKind(bucket({ cost: 0 }))).toBe("free");
    expect(priceKind(bucket({ cost: 0, hasUnknownCost: true }))).toBe("unpriced");
  });

  it("averages per chat in the page unit", () => {
    expect(averagePerChat(bucket({ chats: 0, cost: 0 }))).toBeNull();
    expect(averagePerChat(bucket({ chats: 4, cost: 2 }))).toBe(0.5);
    expect(
      averagePerChat(bucket({ chats: 2, cost: 0, tokensIn: 300, tokensOut: 100 }))
    ).toBe(200);
  });
});

describe("By model", () => {
  it("sorts from most to least expensive with the share of cost", () => {
    const r = pageModels(
      aggregateOf({
        "gpt-5": bucket({ cost: 1, tokensIn: 9000 }),
        "claude-sonnet-4-6": bucket({ cost: 3, tokensIn: 100 }),
      })
    );
    expect(r.map((m) => m.id)).toEqual(["claude-sonnet-4-6", "gpt-5"]);
    expect(r.map((m) => m.pct)).toEqual([75, 25]);
  });

  it("sorts and shares by volume when nothing cost money", () => {
    const r = pageModels(
      aggregateOf({
        "llama3.2": bucket({ tokensIn: 100, tokensOut: 0 }),
        "qwen2.5": bucket({ tokensIn: 300, tokensOut: 0 }),
      })
    );
    expect(r.map((m) => [m.id, m.pct, m.price])).toEqual([
      ["qwen2.5", 75, "free"],
      ["llama3.2", 25, "free"],
    ]);
  });

  it("never shows 0% for a model that cost something", () => {
    const r = pageModels(
      aggregateOf({
        large: bucket({ cost: 3.1 }),
        small: bucket({ cost: 0.0039 }),
      })
    );
    const p = r.find((m) => m.id === "small")!;
    expect(p.nearZero).toBe(true);
    expect(p.pct).toBe(1);
    expect(r.find((m) => m.id === "large")!.nearZero).toBe(false);
  });

  it("marks paid totals that include unpriced chats as a floor", () => {
    const [m] = pageModels(
      aggregateOf({ x: bucket({ cost: 1, hasUnknownCost: true }) })
    );
    expect(m.isFloor).toBe(true);
  });

  it("breaks ties by volume and then by name for a stable order", () => {
    const r = pageModels(
      aggregateOf({
        b: bucket({ tokensIn: 10 }),
        a: bucket({ tokensIn: 10 }),
        c: bucket({ tokensIn: 20 }),
      })
    );
    expect(r.map((m) => m.id)).toEqual(["c", "a", "b"]);
  });
});

describe("full dimension report (See all)", () => {
  const ops = [
    { id: "gpt-5", count: 13 },
    { id: "claude-sonnet-4-6", count: 7 },
    { id: "gemini-2.5-flash", count: 1 },
  ];

  it("lists used options by weight and idle ones at the end", () => {
    const buckets = {
      "gpt-5": bucket({ cost: 1 }),
      "claude-sonnet-4-6": bucket({ cost: 3 }),
    };
    const total = aggregateOf(buckets).total;
    const r = sliceReport(ops, buckets, total);
    expect(r.used.map((u) => [u.id, u.pct])).toEqual([
      ["claude-sonnet-4-6", 75],
      ["gpt-5", 25],
    ]);
    expect(r.idle.map((o) => o.id)).toEqual(["gemini-2.5-flash"]);
    expect(r.used.length + r.idle.length).toBe(ops.length);
  });

  it("includes only listed options so search narrows the report", () => {
    const buckets = {
      "gpt-5": bucket({ cost: 1 }),
      "claude-sonnet-4-6": bucket({ cost: 3 }),
    };
    const r = sliceReport([ops[0]], buckets, aggregateOf(buckets).total);
    expect(r.used.map((u) => u.id)).toEqual(["gpt-5"]);
    expect(r.used[0].pct).toBe(25);
    expect(r.idle).toEqual([]);
  });

  it("removes only the filter of its own dimension", () => {
    const f = { providers: ["openai"], models: ["gpt-5"], modes: ["agent"], days: 30 };
    expect(withoutDimension(f, "models")).toEqual({
      providers: ["openai"],
      models: [],
      modes: ["agent"],
      days: 30,
    });
    expect(f.models).toEqual(["gpt-5"]);
  });

  it("slicesOf works for any grouping and matches By model", () => {
    const buckets = { a: bucket({ cost: 1 }), b: bucket({ cost: 1 }) };
    const agg = aggregateOf(buckets);
    expect(slicesOf(buckets, agg.total)).toEqual(pageModels(agg));
  });
});

describe("top chats", () => {
  const chats = [
    row({ id: "pricey", cost: 2, tokensIn: 10 }),
    row({ id: "cheap", cost: 1, tokensIn: 5000 }),
    row({ id: "unpriced", cost: null, tokensIn: 90 }),
  ];

  it("lists the most expensive chats when money was spent", () => {
    const agg = aggregateOf({ m: bucket({ cost: 3 }) }, chats);
    expect(topChats(agg, 10).map((c) => c.id)).toEqual([
      "pricey",
      "cheap",
      "unpriced",
    ]);
    expect(topChats(agg, 1)).toHaveLength(1);
  });

  it("lists the largest chats when nothing cost money", () => {
    const agg = aggregateOf({ m: bucket({ cost: 0 }) }, chats);
    expect(topChats(agg, 10).map((c) => c.id)).toEqual([
      "cheap",
      "unpriced",
      "pricey",
    ]);
  });
});

describe("date range of the slice", () => {
  it("is empty without chats", () => {
    expect(dateRange(null, null)).toBe("");
  });

  it("shows a single day once", () => {
    expect(dateRange("2026-09-11", "2026-09-11")).toBe("Sep 11");
  });

  it("omits the year within the same year", () => {
    expect(dateRange("2026-06-01", "2026-09-29")).toBe("Jun 1 – Sep 29");
  });

  it("shows the start year when crossing a year boundary", () => {
    expect(dateRange("2025-12-03", "2026-01-15")).toBe(
      "Dec 3, 2025 – Jan 15"
    );
  });
});

describe("filters worth showing", () => {
  it("counts only list filters since the period has its own selector", () => {
    expect(selectedCount(EMPTY_FILTER)).toBe(0);
    expect(
      selectedCount({ providers: ["a"], models: ["b", "c"], modes: [], days: 30 })
    ).toBe(3);
  });

  const ops = [
    { id: "gpt-5", count: 13 },
    { id: "claude-sonnet-4-6", count: 7 },
    { id: "gpt-4o", count: 6 },
    { id: "gemini-2.5-flash", count: 1 },
    { id: "llama3.2", count: 1 },
  ];

  it("shows the three most used options and leaves the rest to See all", () => {
    expect(visibleOptions(ops, []).map((o) => o.id)).toEqual([
      "gpt-5",
      "claude-sonnet-4-6",
      "gpt-4o",
    ]);
    expect(visibleOptions(ops.slice(0, 2), [])).toHaveLength(2);
  });

  it("brings a selected option outside the top three to the front of the row", () => {
    expect(visibleOptions(ops, ["llama3.2"]).map((o) => o.id)).toEqual([
      "llama3.2",
      "gpt-5",
      "claude-sonnet-4-6",
      "gpt-4o",
    ]);
    expect(visibleOptions(ops, ["gpt-4o"]).map((o) => o.id)).toEqual([
      "gpt-5",
      "claude-sonnet-4-6",
      "gpt-4o",
    ]);
  });

  it("searches options by display name and by id", () => {
    const nameOf = (id: string) =>
      ({ "claude-sonnet-4-6": "Sonnet 4.6", "gpt-5": "GPT 5" })[id] ?? id;
    expect(searchOptions(ops, "sonnet 4.6", nameOf).map((o) => o.id)).toEqual([
      "claude-sonnet-4-6",
    ]);
    expect(searchOptions(ops, "CLAUDE", nameOf).map((o) => o.id)).toEqual([
      "claude-sonnet-4-6",
    ]);
    expect(searchOptions(ops, "  ", nameOf)).toHaveLength(ops.length);
    expect(searchOptions(ops, "mistral", nameOf)).toEqual([]);
  });

  it("treats a single option as not worth filtering unless it is selected", () => {
    expect(worthFiltering([{ id: "openai", count: 9 }], [])).toBe(false);
    expect(worthFiltering([{ id: "openai", count: 9 }], ["openai"])).toBe(true);
    expect(
      worthFiltering(
        [
          { id: "openai", count: 9 },
          { id: "anthropic", count: 2 },
        ],
        []
      )
    ).toBe(true);
  });
});

const CSS = readFileSync(resolve(__dirname, "../styles/main.css"), "utf8");
const CSS_NO_COMMENTS = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

function block(needle: string): string {
  const i = CSS_NO_COMMENTS.indexOf(needle);
  expect(i, `selector missing from CSS: ${needle}`).toBeGreaterThan(-1);
  const open = CSS_NO_COMMENTS.indexOf("{", i);
  return CSS_NO_COMMENTS.slice(open + 1, CSS_NO_COMMENTS.indexOf("}", open));
}

describe("usage page styles", () => {
  it("styles the report action like a top bar action", () => {
    expect(CSS).toMatch(
      /button\.corvus-sheet-action,\s*\.corvus-root button\.corvus-topbar-action\s*\{/
    );
  });

  it("keeps filter pills at their natural size", () => {
    expect(block(".corvus-root .corvus-usage-dim button.corvus-choice {")).toContain(
      "flex: 0 0 auto"
    );
  });

  it("lays out each dimension as one horizontally scrolling row that never wraps", () => {
    const b = block(".corvus-root .corvus-usage-dim .corvus-choices {");
    expect(b).toContain("flex-wrap: nowrap");
    expect(b).toContain("overflow-x: auto");
    expect(b).toContain("margin: 0 calc(var(--corvus-gutter) * -1)");
    expect(b).toContain("padding: 0 var(--corvus-gutter)");
    expect(b).not.toMatch(/mask-image/);
  });

  it("hides the module icon instead of truncating the title on narrow cards", () => {
    expect(block(".corvus-root .corvus-usage.is-hero .corvus-mod {")).toContain(
      "container-type: inline-size"
    );
    const i = CSS_NO_COMMENTS.search(/@container \(max-width: [\d.]+px\)/);
    expect(i, "the narrow card rule is missing").toBeGreaterThan(-1);
    const rule = CSS_NO_COMMENTS.slice(i, CSS_NO_COMMENTS.indexOf("}", i));
    expect(rule).toContain(".corvus-mod-title.has-icon .corvus-icon");
    expect(rule).toContain("display: none");
  });

  it("stretches lists inside a section block", () => {
    expect(block(".corvus-root .corvus-home-block > .corvus-usage-list {")).toContain(
      "align-self: stretch"
    );
  });

  it("sizes the module icon through the token, not the attribute", () => {
    expect(block(".corvus-root .corvus-mod-title.has-icon {")).toMatch(
      /--icon-size:\s*\d+px/
    );
  });

  it("uses muted, never faint, text for information on a card", () => {
    for (const sel of [
      ".corvus-root .corvus-usage-line {",
      ".corvus-root .corvus-usage-sub {",
      ".corvus-root .corvus-usage-sep {",
      ".corvus-root .corvus-usage-approx {",
      ".corvus-root .corvus-usage-row-sub {",
      ".corvus-root .corvus-usage-row-pct {",
      ".corvus-root .corvus-usage-dim-label {",
    ]) {
      const b = block(sel);
      expect(b, sel).toContain("var(--text-muted)");
      expect(b, sel).not.toContain("var(--text-faint)");
    }
  });

  it("spaces filter groups further apart than the pills inside them", () => {
    expect(block(".corvus-root .corvus-home-block.corvus-usage-filters {")).toContain(
      "gap: var(--corvus-5)"
    );
    expect(block(".corvus-root .corvus-usage-dim {")).toContain("gap: var(--corvus-2)");
    expect(block(".corvus-root .corvus-usage-dim .corvus-choices {")).toContain(
      "gap: 10px"
    );
  });
});
