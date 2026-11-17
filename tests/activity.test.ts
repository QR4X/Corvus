import { describe, it, expect } from "vitest";
import {
  activeDays,
  topModels,
  dayStreak,
  periodWork,
} from "../src/usage/activity";
import type { HeatCell } from "../src/usage/heatmap";
import type { ChatSummary } from "../src/core/chatPersistence";

const chat = (over: Partial<ChatSummary> = {}): ChatSummary => ({
  id: "a",
  title: "t",
  date: "2026-09-16T10:00:00.000Z",
  mode: "agent",
  provider: "openai",
  model: "gpt-4o",
  effort: "",
  tokensIn: 100,
  tokensOut: 50,
  messageCount: 4,
  toolCount: 7,
  filePath: "p",
  starred: false,
  preview: "",
  ...over,
});

const NOW = new Date(2026, 8, 16, 12).getTime();
const local = (y: number, m: number, d: number, h = 10) =>
  new Date(y, m - 1, d, h).toISOString();

describe("dayStreak", () => {
  it("counts consecutive days up to today", () => {
    const c = [
      chat({ id: "a", date: local(2026, 9, 14) }),
      chat({ id: "b", date: local(2026, 9, 15) }),
      chat({ id: "c", date: local(2026, 9, 16) }),
    ];
    expect(dayStreak(c, NOW)).toBe(3);
  });

  it("an empty today does not reset the streak; it counts from the last finished day", () => {
    const c = [
      chat({ id: "a", date: local(2026, 9, 14) }),
      chat({ id: "b", date: local(2026, 9, 15) }),
    ];
    expect(dayStreak(c, NOW)).toBe(2);
  });

  it("two empty days break the streak", () => {
    const c = [chat({ id: "a", date: local(2026, 9, 13) })];
    expect(dayStreak(c, NOW)).toBe(0);
  });

  it("the streak crosses a month boundary", () => {
    const now = new Date(2026, 9, 2, 12).getTime();
    const c = [
      chat({ id: "a", date: local(2026, 9, 29) }),
      chat({ id: "b", date: local(2026, 9, 30) }),
      chat({ id: "c", date: local(2026, 10, 1) }),
      chat({ id: "d", date: local(2026, 10, 2) }),
    ];
    expect(dayStreak(c, now)).toBe(4);
  });

  it("several chats on the same day count as one day", () => {
    const c = [
      chat({ id: "a", date: local(2026, 9, 16, 9) }),
      chat({ id: "b", date: local(2026, 9, 16, 18) }),
    ];
    expect(dayStreak(c, NOW)).toBe(1);
  });

  it("no chats means no streak", () => {
    expect(dayStreak([], NOW)).toBe(0);
  });

  it("an unreadable date does not break the count", () => {
    expect(dayStreak([chat({ date: "not a date" })], NOW)).toBe(0);
  });
});

describe("activeDays", () => {
  const days = (tokens: number[]): HeatCell[] =>
    tokens.map((t, i) => ({
      day: `2026-09-${String(i + 1).padStart(2, "0")}`,
      tokens: t,
      level: t > 0 ? 1 : 0,
    }));

  it("counts the days that had usage", () => {
    expect(activeDays(days([1, 0, 2, 0, 3]))).toEqual({ active: 3, total: 5 });
  });

  it("an empty grid padding cell does not count as a day", () => {
    const grid: HeatCell[] = [...days([1, 0]), { day: null, tokens: 0, level: 0 }];
    expect(activeDays(grid)).toEqual({ active: 1, total: 2 });
  });
});

describe("periodWork", () => {
  it("sums agent actions and messages", () => {
    const t = periodWork([chat(), chat({ id: "b" })], "2026-09-01");
    expect(t.actions).toBe(14);
    expect(t.messages).toBe(8);
  });

  it("leaves out chats from before the period", () => {
    const t = periodWork(
      [chat(), chat({ id: "old", date: "2026-08-02T10:00:00.000Z" })],
      "2026-09-01"
    );
    expect(t.actions).toBe(7);
  });

  it("a broken number in frontmatter does not poison the total", () => {
    const t = periodWork(
      [chat({ toolCount: NaN as unknown as number })],
      "2026-09-01"
    );
    expect(t.actions).toBe(0);
    expect(t.messages).toBe(4);
  });
});

describe("topModels", () => {
  const since = "2026-09-01";

  it("sorts by tokens and computes each share", () => {
    const list = topModels(
      [
        chat({ id: "a", model: "gpt-5", tokensIn: 700, tokensOut: 0 }),
        chat({ id: "b", model: "claude-sonnet-4-6", tokensIn: 300, tokensOut: 0 }),
      ],
      since
    );
    expect(list.map((m) => m.model)).toEqual(["gpt-5", "claude-sonnet-4-6"]);
    expect(list.map((m) => m.pct)).toEqual([70, 30]);
  });

  it("the share is by tokens, not by chat count", () => {
    const list = topModels(
      [
        chat({ id: "a", model: "gpt-5", tokensIn: 10, tokensOut: 0 }),
        chat({ id: "b", model: "gpt-5", tokensIn: 10, tokensOut: 0 }),
        chat({ id: "c", model: "claude-sonnet-4-6", tokensIn: 980, tokensOut: 0 }),
      ],
      since
    );
    expect(list[0].model).toBe("claude-sonnet-4-6");
    expect(list[0].pct).toBe(98);
  });

  it("counts chats per model and keeps the provider for the logo", () => {
    const list = topModels(
      [
        chat({ id: "a", model: "gemini-2.5-flash", provider: "gemini" }),
        chat({ id: "b", model: "gemini-2.5-flash", provider: "gemini" }),
      ],
      since
    );
    expect(list[0].chats).toBe(2);
    expect(list[0].provider).toBe("gemini");
  });

  it("cuts at the requested limit", () => {
    const list = topModels(
      [
        chat({ id: "a", model: "m1", tokensIn: 400 }),
        chat({ id: "b", model: "m2", tokensIn: 300 }),
        chat({ id: "c", model: "m3", tokensIn: 200 }),
        chat({ id: "d", model: "m4", tokensIn: 100 }),
      ],
      since,
      3
    );
    expect(list).toHaveLength(3);
    expect(list.map((m) => m.model)).toEqual(["m1", "m2", "m3"]);
  });

  it("leaves out chats from before the period", () => {
    const list = topModels(
      [
        chat({ id: "a", model: "gpt-5" }),
        chat({ id: "b", model: "old", date: "2026-08-20T10:00:00.000Z" }),
      ],
      since
    );
    expect(list.map((m) => m.model)).toEqual(["gpt-5"]);
    expect(list[0].pct).toBe(100);
  });

  it("a model without a name does not become a row", () => {
    const list = topModels(
      [chat({ id: "a", model: "" }), chat({ id: "b", model: "gpt-5" })],
      since
    );
    expect(list).toHaveLength(1);
    expect(list[0].model).toBe("gpt-5");
  });

  it("a period with zero tokens does not divide by zero", () => {
    const list = topModels(
      [chat({ model: "gpt-5", tokensIn: 0, tokensOut: 0 })],
      since
    );
    expect(list[0].pct).toBe(0);
  });

  it("an empty period returns an empty list", () => {
    expect(topModels([], since)).toEqual([]);
  });
});
