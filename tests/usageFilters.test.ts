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

const dias = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

describe("opcoes", () => {
  const chats = [
    chat({ id: "a", provider: "openai" }),
    chat({ id: "b", provider: "openai" }),
    chat({ id: "c", provider: "anthropic" }),
  ];

  it("lista o que existe, do mais usado pro menos", () => {
    expect(filterOptions(chats, "provider")).toEqual([
      { id: "openai", count: 2 },
      { id: "anthropic", count: 1 },
    ]);
  });

  it("valor vazio não vira opção", () => {

    expect(filterOptions([chat({ model: "" })], "model")).toEqual([]);
  });

  it("empate resolve pelo nome — ordem estável", () => {

    const empate = [chat({ id: "a", model: "zzz" }), chat({ id: "b", model: "aaa" })];
    expect(filterOptions(empate, "model").map((o) => o.id)).toEqual(["aaa", "zzz"]);
  });
});

describe("alternar", () => {
  it("liga o que estava fora e desliga o que estava dentro", () => {
    expect(toggleValue([], "openai")).toEqual(["openai"]);
    expect(toggleValue(["openai"], "openai")).toEqual([]);
  });

  it("não mexe no array original", () => {
    const antes = ["openai"];
    toggleValue(antes, "anthropic");
    expect(antes).toEqual(["openai"]);
  });
});

describe("aplicar", () => {
  const chats = [
    chat({ id: "a", provider: "openai", model: "gpt-5", mode: "chat" }),
    chat({ id: "b", provider: "anthropic", model: "claude-sonnet-4-6", mode: "agent" }),
    chat({ id: "c", provider: "openai", model: "gpt-4o", mode: "agent" }),
  ];

  it("sem filtro, passa tudo", () => {
    expect(applyFilter(chats, EMPTY_FILTER)).toHaveLength(3);
  });

  it("lista vazia é 'sem restrição', não 'nenhum'", () => {

    expect(applyFilter(chats, { ...EMPTY_FILTER, providers: [] })).toHaveLength(3);
  });

  it("filtra por provider, modelo e modo", () => {
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

  it("dois filtros se somam (E, não OU)", () => {
    const r = applyFilter(chats, {
      ...EMPTY_FILTER,
      providers: ["openai"],
      modes: ["agent"],
    });
    expect(r.map((c) => c.id)).toEqual(["c"]);
  });

  it("vários valores na mesma dimensão são OU", () => {
    const r = applyFilter(chats, {
      ...EMPTY_FILTER,
      providers: ["openai", "anthropic"],
    });
    expect(r).toHaveLength(3);
  });

  it("período corta pelo tempo", () => {
    const velhas = [
      chat({ id: "nova", date: dias(2) }),
      chat({ id: "velha", date: dias(40) }),
    ];
    expect(applyFilter(velhas, { ...EMPTY_FILTER, days: 7 }).map((c) => c.id)).toEqual([
      "nova",
    ]);
  });

  it("data ilegível fica de fora de um filtro por período", () => {

    const r = applyFilter([chat({ date: "sei lá" })], { ...EMPTY_FILTER, days: 7 });
    expect(r).toHaveLength(0);
  });

  it("sem período, a data ilegível continua passando", () => {

    const r = applyFilter([chat({ date: "sei lá" })], EMPTY_FILTER);
    expect(r).toHaveLength(1);
  });
});

