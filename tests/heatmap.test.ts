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

const AGORA = new Date(2026, 8, 16, 12).getTime();
const local = (a: number, m: number, d: number, h = 10) =>
  new Date(a, m - 1, d, h).toISOString();

describe("diaLocal", () => {
  it("é o dia do relógio de quem olha, não o de UTC", () => {

    expect(localDay(new Date(2026, 8, 16, 23, 50).getTime())).toBe("2026-09-16");
  });

  it("zero à esquerda no mês e no dia", () => {
    expect(localDay(new Date(2026, 0, 5, 8).getTime())).toBe("2026-01-05");
  });
});

describe("nivelDoDia", () => {
  it("dia sem uso não tem nível, e o pico é o mais forte", () => {
    expect(dayLevel(0, 1000)).toBe(0);
    expect(dayLevel(1000, 1000)).toBe(4);
  });

  it("as faixas são do PICO, não do ranking", () => {

    expect(dayLevel(100, 1000)).toBe(1);
    expect(dayLevel(300, 1000)).toBe(2);
    expect(dayLevel(600, 1000)).toBe(3);
    expect(dayLevel(800, 1000)).toBe(4);
  });

  it("sem pico não há escala", () => {
    expect(dayLevel(500, 0)).toBe(0);
  });
});

describe("heatmapDoMes", () => {
  it("a grade é retangular: 7 colunas por semana", () => {
    const h = monthHeatmap([], AGORA);
    expect(h.cells.length % 7).toBe(0);
    expect(h.cells).toHaveLength(h.rows * 7);
  });

  it("o mês começa na coluna do dia da semana dele", () => {

    const h = monthHeatmap([], AGORA);
    expect(h.cells[0].day).toBeNull();
    expect(h.cells[1].day).toBe("2026-09-01");
  });

  it("dia que ainda não chegou não é dia: fica sem data, não com zero", () => {

    const h = monthHeatmap([], AGORA);
    const dezesseis = h.cells.findIndex((c) => c.day === "2026-09-16");
    expect(dezesseis).toBeGreaterThan(0);
    expect(h.cells[dezesseis + 1].day).toBeNull();

    expect(h.cells[dezesseis + 1].future).toBe(true);
    expect(h.cells[0].future).toBeUndefined();
  });

  it("o mês anterior não entra — os quadrados são do mês VIGENTE", () => {
    const h = monthHeatmap([chat({ date: local(2026, 8, 30) })], AGORA);
    expect(h.total).toBe(0);
    expect(h.cells.every((c) => !c.day || c.day.startsWith("2026-09"))).toBe(
      true
    );
  });

  it("soma os tokens do dia, de todas as conversas", () => {
    const h = monthHeatmap(
      [
        chat({ id: "a", date: local(2026, 9, 15), tokensIn: 100, tokensOut: 50 }),
        chat({ id: "b", date: local(2026, 9, 15), tokensIn: 30, tokensOut: 20 }),
      ],
      AGORA
    );
    expect(h.cells.find((c) => c.day === "2026-09-15")?.tokens).toBe(200);
    expect(h.peak).toBe(200);
    expect(h.total).toBe(200);
  });

  it("data ilegível não entra nem quebra a grade", () => {
    const h = monthHeatmap([chat({ date: "ontem de manhã" })], AGORA);
    expect(h.total).toBe(0);
    expect(h.cells).toHaveLength(h.rows * 7);
  });

  it("o dia mais forte fica no nível 4 e o mais fraco no 1", () => {
    const h = monthHeatmap(
      [
        chat({ id: "a", date: local(2026, 9, 15), tokensIn: 1000, tokensOut: 0 }),
        chat({ id: "b", date: local(2026, 9, 14), tokensIn: 50, tokensOut: 0 }),
      ],
      AGORA
    );
    expect(h.cells.find((c) => c.day === "2026-09-15")?.level).toBe(4);
    expect(h.cells.find((c) => c.day === "2026-09-14")?.level).toBe(1);
  });

  it("mês que começa numa segunda não tem casa vazia na frente", () => {

    const h = monthHeatmap([], new Date(2026, 5, 10, 12).getTime());
    expect(h.cells[0].day).toBe("2026-06-01");
  });

  it("leva o nome do mês pro rótulo", () => {
    expect(monthHeatmap([], AGORA).label).toBe("September");
  });
});

describe("inicioDoMes", () => {
  it("é o corte que todos os números do cartão usam", () => {
    expect(monthStart(AGORA)).toBe("2026-09-01");
  });
});
