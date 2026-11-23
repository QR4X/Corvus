import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  shortDay,
  daysBetween,
  chartWindow,
  stepFor,
  peakOf,
  timeSeries,
} from "../src/usage/timeline";
import type { UsageBucket } from "../src/usage/aggregate";

const b = (tokensIn: number, tokensOut: number, chats = 1): UsageBucket => ({
  chats,
  tokensIn,
  tokensOut,
  cost: 0,
  hasUnknownCost: false,
});

describe("time step", () => {
  it("uses days up to a month, weeks up to half a year, then months", () => {
    expect(stepFor(1)).toBe("day");
    expect(stepFor(30)).toBe("day");
    expect(stepFor(31)).toBe("day");
    expect(stepFor(32)).toBe("week");
    expect(stepFor(182)).toBe("week");
    expect(stepFor(183)).toBe("month");
    expect(stepFor(3650)).toBe("month");
  });

  it("counts both endpoints", () => {
    expect(daysBetween("2026-09-11", "2026-09-11")).toBe(1);
    expect(daysBetween("2026-09-01", "2026-09-30")).toBe(30);
    expect(daysBetween("2025-12-31", "2026-01-01")).toBe(2);
  });
});

describe("chart window", () => {
  const byDay = {
    "2026-09-01": b(10, 5),
    "2026-09-20": b(10, 5),
  };

  const now = Date.parse("2026-09-25T12:00:00Z");

  it("has no window without any chats", () => {
    expect(chartWindow(0, {}, now)).toBeNull();
  });

  it("spans from the first to the last chat for All time", () => {
    expect(chartWindow(0, byDay, now)).toEqual({
      from: "2026-09-01",
      to: "2026-09-20",
    });
  });

  it("ends an N-day window today and includes empty days", () => {
    expect(chartWindow(7, { "2026-09-24": b(10, 5) }, now)).toEqual({
      from: "2026-09-19",
      to: "2026-09-25",
    });
  });

  it("stretches to fit every day the aggregation returned", () => {
    expect(chartWindow(7, byDay, now)).toEqual({
      from: "2026-09-01",
      to: "2026-09-25",
    });
  });
});

describe("columns", () => {
  it("creates one column per day in order, including empty days", () => {
    const s = timeSeries(
      { "2026-09-02": b(100, 40) },
      "2026-09-01",
      "2026-09-03",
      "day"
    );
    expect(s.map((c) => c.start)).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
    ]);
    expect(s.map((c) => c.total)).toEqual([0, 140, 0]);
    expect(s[1]).toMatchObject({ tokensIn: 100, tokensOut: 40, chats: 1 });
  });

  it("starts weeks on Monday like the home card calendar", () => {
    const s = timeSeries(
      { "2026-09-11": b(10, 1), "2026-09-13": b(20, 2) },
      "2026-09-11",
      "2026-09-13",
      "week"
    );
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ start: "2026-09-07", tokensIn: 30, tokensOut: 3 });
  });

  it("groups a whole month into one column", () => {
    const s = timeSeries(
      { "2026-08-31": b(5, 1), "2026-09-01": b(10, 2), "2026-09-30": b(20, 4) },
      "2026-08-31",
      "2026-09-30",
      "month"
    );
    expect(s.map((c) => [c.start, c.tokensIn, c.tokensOut])).toEqual([
      ["2026-08-01", 5, 1],
      ["2026-09-01", 30, 6],
    ]);
  });

  it("never labels a column with days that have not happened yet", () => {
    const s = timeSeries({}, "2026-09-07", "2026-09-09", "week");
    expect(s[0].title).toBe("Sep 7 – Sep 9, 2026");
  });

  it("ignores days outside the window and unreadable dates", () => {
    const s = timeSeries(
      { "2026-08-01": b(999, 999), "(no date)": b(7, 7), "2026-09-02": b(1, 1) },
      "2026-09-01",
      "2026-09-03",
      "day"
    );
    expect(s.reduce((t, c) => t + c.total, 0)).toBe(2);
  });

  it("draws nothing for a reversed window", () => {
    expect(timeSeries({}, "2026-09-10", "2026-09-01", "day")).toEqual([]);
  });

  it("uses the tallest column as the peak for the scale", () => {
    const s = timeSeries(
      { "2026-09-01": b(10, 5), "2026-09-03": b(100, 50) },
      "2026-09-01",
      "2026-09-03",
      "day"
    );
    expect(peakOf(s)).toBe(150);
    expect(peakOf([])).toBe(0);
  });
});

describe("labels", () => {
  it("uses short axis labels and full titles", () => {
    const [day] = timeSeries({}, "2026-09-11", "2026-09-11", "day");
    expect(day.label).toBe("Sep 11");
    expect(day.title).toBe("Sep 11, 2026");

    const [week] = timeSeries({}, "2026-09-07", "2026-09-13", "week");
    expect(week.label).toBe("Sep 7");
    expect(week.title).toBe("Sep 7 – Sep 13, 2026");

    const [month] = timeSeries({}, "2026-09-01", "2026-09-30", "month");
    expect(month.label).toBe("Sep");
    expect(month.title).toBe("Sep 2026");
  });

  it("formats short days and returns unparseable input unchanged", () => {
    expect(shortDay("2026-09-11")).toBe("Sep 11");
    expect(shortDay("2026-09-11", true)).toBe("Sep 11, 2026");
    expect(shortDay("nothing")).toBe("nothing");
  });
});

const CSS_NO_COMMENTS = readFileSync(resolve(__dirname, "../styles/main.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  ""
);

function block(needle: string): string {
  const sel = needle.replace(/\{$/, "").trim();
  const re = new RegExp(
    `(?:^|\\})\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`
  );
  const m = CSS_NO_COMMENTS.match(re);
  expect(m, `selector missing from CSS or not on its own: ${sel}`).not.toBeNull();
  return m![1];
}

describe("chart styles", () => {
  it("draws both series as two shades of the app accent color", () => {
    const b = block(".corvus-root .corvus-chart {");
    expect(b).toContain("--corvus-serie-in: var(--corvus-accent)");
    expect(b).toMatch(/--corvus-serie-out:\s*color-mix\(/);
    const out = b.slice(b.indexOf("--corvus-serie-out"));
    expect(out).toContain("var(--text-normal)");
    expect(out).not.toContain("var(--background-primary)");
  });

  it("marks the selected column with an underline instead of filling it", () => {
    const b = block(".corvus-root button.corvus-chart-col.is-on {");
    expect(b).toContain("inset 0 -2px 0 var(--corvus-accent)");
    expect(b).not.toContain("background-color");
  });

  it("keeps the chart card width independent of its text", () => {
    expect(block(".corvus-root .corvus-chart {")).toContain("align-self: stretch");
  });

  it("caps bar width and sets a minimum bar height", () => {
    expect(block(".corvus-root .corvus-chart-stack {")).toContain(
      "width: min(100%, 24px)"
    );
    expect(block(".corvus-root .corvus-chart-bar {")).toContain("min-height: 2px");
  });

  it("separates bar parts and columns with card-colored gaps, not borders", () => {
    expect(block(".corvus-root .corvus-chart-plot {")).toContain("gap: 2px");
    expect(block(".corvus-root .corvus-chart-bar.is-out.has-in {")).toContain(
      "margin-bottom: 2px"
    );
    expect(block(".corvus-root .corvus-chart-bar {")).not.toContain("border:");
  });
});

describe("empty chart styles", () => {
  it("never uses the series colors for placeholder bars", () => {
    const b = block(".corvus-root .corvus-chart-bar.is-ghost {");
    expect(b).toMatch(/color-mix\(in srgb, var\(--text-normal\) \d+%/);
    expect(b).not.toContain("--corvus-serie");
  });

  it("hides the axis line when there is no data", () => {
    expect(block(".corvus-root .corvus-chart.is-empty .corvus-chart-plot {")).toContain(
      "border-bottom-color: transparent"
    );
  });

  it("shares the column track between the button and the empty span", () => {
    const b = block(".corvus-root .corvus-chart-col {");
    expect(b).toContain("flex: 1 1 0");
    expect(b).toContain("height: 100%");
    expect(block(".corvus-root button.corvus-chart-col {")).toContain(
      "cursor: pointer"
    );
  });
});
