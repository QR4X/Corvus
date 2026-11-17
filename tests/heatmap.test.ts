import { describe, it, expect } from "vitest";
import {
  localDay,
  monthHeatmap,
  monthStart,
  dayLevel,
} from "../src/usage/heatmap";
import type { ChatSummary } from "../src/core/chatPersistence";

const chat = (over: Partial<ChatSummary> = {}): ChatSummary => ({
  id: "a",
  title: "t",
  date: new Date().toISOString(),
  mode: "chat",
  provider: "openai",
  model: "gpt-4o",
  effort: "",
  tokensIn: 600,
  tokensOut: 400,
  messageCount: 2,
  toolCount: 0,
  filePath: "p",
  starred: false,
  preview: "",
  ...over,
});

const NOW = new Date(2026, 8, 16, 12).getTime();
const local = (y: number, m: number, d: number, h = 10) =>
  new Date(y, m - 1, d, h).toISOString();

describe("localDay", () => {
  it("uses the local clock day, not UTC", () => {
    expect(localDay(new Date(2026, 8, 16, 23, 50).getTime())).toBe("2026-09-16");
  });

  it("pads month and day with zeros", () => {
    expect(localDay(new Date(2026, 0, 5, 8).getTime())).toBe("2026-01-05");
  });
});

describe("dayLevel", () => {
  it("gives an unused day no level and the peak the top level", () => {
    expect(dayLevel(0, 1000)).toBe(0);
    expect(dayLevel(1000, 1000)).toBe(4);
  });

  it("bands are relative to the peak, not a ranking", () => {
    expect(dayLevel(100, 1000)).toBe(1);
    expect(dayLevel(300, 1000)).toBe(2);
    expect(dayLevel(600, 1000)).toBe(3);
    expect(dayLevel(800, 1000)).toBe(4);
  });

  it("has no scale without a peak", () => {
    expect(dayLevel(500, 0)).toBe(0);
  });
});

describe("monthHeatmap", () => {
  it("builds a rectangular grid of 7 columns per week", () => {
    const h = monthHeatmap([], NOW);
    expect(h.cells.length % 7).toBe(0);
    expect(h.cells).toHaveLength(h.rows * 7);
  });

  it("starts the month on its weekday column", () => {
    const h = monthHeatmap([], NOW);
    expect(h.cells[0].day).toBeNull();
    expect(h.cells[1].day).toBe("2026-09-01");
  });

  it("marks future days as future without a date instead of zero", () => {
    const h = monthHeatmap([], NOW);
    const sixteenth = h.cells.findIndex((c) => c.day === "2026-09-16");
    expect(sixteenth).toBeGreaterThan(0);
    expect(h.cells[sixteenth + 1].day).toBeNull();

    expect(h.cells[sixteenth + 1].future).toBe(true);
    expect(h.cells[0].future).toBeUndefined();
  });

  it("excludes the previous month", () => {
    const h = monthHeatmap([chat({ date: local(2026, 8, 30) })], NOW);
    expect(h.total).toBe(0);
    expect(h.cells.every((c) => !c.day || c.day.startsWith("2026-09"))).toBe(
      true
    );
  });

  it("sums the day tokens across all chats", () => {
    const h = monthHeatmap(
      [
        chat({ id: "a", date: local(2026, 9, 15), tokensIn: 100, tokensOut: 50 }),
        chat({ id: "b", date: local(2026, 9, 15), tokensIn: 30, tokensOut: 20 }),
      ],
      NOW
    );
    expect(h.cells.find((c) => c.day === "2026-09-15")?.tokens).toBe(200);
    expect(h.peak).toBe(200);
    expect(h.total).toBe(200);
  });

  it("skips an unreadable date without breaking the grid", () => {
    const h = monthHeatmap([chat({ date: "yesterday morning" })], NOW);
    expect(h.total).toBe(0);
    expect(h.cells).toHaveLength(h.rows * 7);
  });

  it("puts the busiest day at level 4 and the quietest at 1", () => {
    const h = monthHeatmap(
      [
        chat({ id: "a", date: local(2026, 9, 15), tokensIn: 1000, tokensOut: 0 }),
        chat({ id: "b", date: local(2026, 9, 14), tokensIn: 50, tokensOut: 0 }),
      ],
      NOW
    );
    expect(h.cells.find((c) => c.day === "2026-09-15")?.level).toBe(4);
    expect(h.cells.find((c) => c.day === "2026-09-14")?.level).toBe(1);
  });

  it("has no leading blank cell for a month starting on Monday", () => {
    const h = monthHeatmap([], new Date(2026, 5, 10, 12).getTime());
    expect(h.cells[0].day).toBe("2026-06-01");
  });

  it("uses the month name as the label", () => {
    expect(monthHeatmap([], NOW).label).toBe("September");
  });
});

describe("monthStart", () => {
  it("returns the first day of the current month", () => {
    expect(monthStart(NOW)).toBe("2026-09-01");
  });
});
