import { describe, it, expect } from "vitest";
import {
  EMPTY_FILTER,
  toggleValue,
  applyFilter,
  filterOptions,
} from "../src/usage/filters";
import type { ChatSummary } from "../src/core/chatPersistence";

const chat = (over: Partial<ChatSummary> = {}): ChatSummary => ({
  id: "a",
  title: "t",
  date: new Date().toISOString(),
  mode: "chat",
  provider: "openai",
  model: "gpt-5",
  effort: "",
  tokensIn: 100,
  tokensOut: 50,
  messageCount: 2,
  toolCount: 0,
  filePath: "p",
  starred: false,
  preview: "",
  ...over,
});

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

describe("filterOptions", () => {
  const chats = [
    chat({ id: "a", provider: "openai" }),
    chat({ id: "b", provider: "openai" }),
    chat({ id: "c", provider: "anthropic" }),
  ];

  it("lists existing values from most to least used", () => {
    expect(filterOptions(chats, "provider")).toEqual([
      { id: "openai", count: 2 },
      { id: "anthropic", count: 1 },
    ]);
  });

  it("skips empty values", () => {
    expect(filterOptions([chat({ model: "" })], "model")).toEqual([]);
  });

  it("breaks ties by name for a stable order", () => {
    const tie = [chat({ id: "a", model: "zzz" }), chat({ id: "b", model: "aaa" })];
    expect(filterOptions(tie, "model").map((o) => o.id)).toEqual(["aaa", "zzz"]);
  });
});

describe("toggleValue", () => {
  it("adds a missing value and removes a present one", () => {
    expect(toggleValue([], "openai")).toEqual(["openai"]);
    expect(toggleValue(["openai"], "openai")).toEqual([]);
  });

  it("does not mutate the original array", () => {
    const before = ["openai"];
    toggleValue(before, "anthropic");
    expect(before).toEqual(["openai"]);
  });
});

describe("applyFilter", () => {
  const chats = [
    chat({ id: "a", provider: "openai", model: "gpt-5", mode: "chat" }),
    chat({ id: "b", provider: "anthropic", model: "claude-sonnet-4-6", mode: "agent" }),
    chat({ id: "c", provider: "openai", model: "gpt-4o", mode: "agent" }),
  ];

  it("lets everything through when empty lists mean no restriction", () => {
    expect(applyFilter(chats, EMPTY_FILTER)).toHaveLength(3);
  });

  it("filters by provider, model and mode", () => {
    expect(
      applyFilter(chats, { ...EMPTY_FILTER, providers: ["openai"] }).map((c) => c.id)
    ).toEqual(["a", "c"]);
    expect(
      applyFilter(chats, { ...EMPTY_FILTER, models: ["gpt-4o"] }).map((c) => c.id)
    ).toEqual(["c"]);
    expect(
      applyFilter(chats, { ...EMPTY_FILTER, modes: ["agent"] }).map((c) => c.id)
    ).toEqual(["b", "c"]);
  });

  it("combines two filters with AND", () => {
    const r = applyFilter(chats, {
      ...EMPTY_FILTER,
      providers: ["openai"],
      modes: ["agent"],
    });
    expect(r.map((c) => c.id)).toEqual(["c"]);
  });

  it("combines values in the same dimension with OR", () => {
    const r = applyFilter(chats, {
      ...EMPTY_FILTER,
      providers: ["openai", "anthropic"],
    });
    expect(r).toHaveLength(3);
  });

  it("cuts by time period", () => {
    const dated = [
      chat({ id: "recent", date: daysAgo(2) }),
      chat({ id: "old", date: daysAgo(40) }),
    ];
    expect(applyFilter(dated, { ...EMPTY_FILTER, days: 7 }).map((c) => c.id)).toEqual([
      "recent",
    ]);
  });

  it("leaves out unreadable dates when filtering by period", () => {
    const r = applyFilter([chat({ date: "not a date" })], { ...EMPTY_FILTER, days: 7 });
    expect(r).toHaveLength(0);
  });

  it("keeps unreadable dates without a period", () => {
    const r = applyFilter([chat({ date: "not a date" })], EMPTY_FILTER);
    expect(r).toHaveLength(1);
  });
});
