import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  VISIBLE_OPTIONS,
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

const balde = (over: Partial<UsageBucket> = {}): UsageBucket => ({
  chats: 1,
  tokensIn: 100,
  tokensOut: 50,
  cost: 0,
  hasUnknownCost: false,
  ...over,
});

const linha = (over: Partial<ChatUsageRow> = {}): ChatUsageRow => ({
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

function agregado(
  modelos: Record<string, UsageBucket>,
  chats: ChatUsageRow[] = []
): UsageAggregate {
  const total = Object.values(modelos).reduce(
    (t, b) => ({
      chats: t.chats + b.chats,
      tokensIn: t.tokensIn + b.tokensIn,
      tokensOut: t.tokensOut + b.tokensOut,
      cost: t.cost + b.cost,
      hasUnknownCost: t.hasUnknownCost || b.hasUnknownCost,
    }),
    balde({ chats: 0, tokensIn: 0, tokensOut: 0 })
  );
  return {
    total,
    byProvider: {},
    byModel: modelos,
    byMode: {},
    byDay: {},
    chats,
    periodStart: null,
    periodEnd: null,
  };
}

describe("a unidade da página", () => {
  it("dinheiro quando houve dinheiro, tokens quando não", () => {
    expect(metricOf(balde({ cost: 0.01 }))).toBe("cost");
    expect(metricOf(balde({ cost: 0 }))).toBe("tokens");

    expect(metricOf(balde({ cost: 0, hasUnknownCost: true }))).toBe("tokens");
  });

  it("zero não é uma coisa só: grátis ≠ sem preço público", () => {
    expect(priceKind(balde({ cost: 1 }))).toBe("paid");
    expect(priceKind(balde({ cost: 0 }))).toBe("free");
    expect(priceKind(balde({ cost: 0, hasUnknownCost: true }))).toBe("unpriced");
  });

  it("a média por conversa fala a unidade da página", () => {
    expect(averagePerChat(balde({ chats: 0, cost: 0 }))).toBeNull();
    expect(averagePerChat(balde({ chats: 4, cost: 2 }))).toBe(0.5);
    expect(
      averagePerChat(balde({ chats: 2, cost: 0, tokensIn: 300, tokensOut: 100 }))
    ).toBe(200);
  });
});

describe("By model", () => {
  it("do mais caro pro mais barato, com a fatia do DINHEIRO", () => {
    const r = pageModels(
      agregado({
        "gpt-5": balde({ cost: 1, tokensIn: 9000 }),
        "claude-sonnet-4-6": balde({ cost: 3, tokensIn: 100 }),
      })
    );
    expect(r.map((m) => m.id)).toEqual(["claude-sonnet-4-6", "gpt-5"]);

    expect(r.map((m) => m.pct)).toEqual([75, 25]);
  });

  it("sem dinheiro nenhum, a ordem e a fatia são do volume", () => {
    const r = pageModels(
      agregado({
        "llama3.2": balde({ tokensIn: 100, tokensOut: 0 }),
        "qwen2.5": balde({ tokensIn: 300, tokensOut: 0 }),
      })
    );
    expect(r.map((m) => [m.id, m.pct, m.price])).toEqual([
      ["qwen2.5", 75, "free"],
      ["llama3.2", 25, "free"],
    ]);
  });

  it("quem pesou alguma coisa nunca aparece com 0%", () => {
    const r = pageModels(
      agregado({
        grande: balde({ cost: 3.1 }),
        pequeno: balde({ cost: 0.0039 }),
      })
    );
    const p = r.find((m) => m.id === "pequeno")!;
    expect(p.nearZero).toBe(true);

    expect(p.pct).toBe(1);
    expect(r.find((m) => m.id === "grande")!.nearZero).toBe(false);
  });

  it("pago com conversa sem preço dentro é um PISO", () => {
    const [m] = pageModels(
      agregado({ x: balde({ cost: 1, hasUnknownCost: true }) })
    );
    expect(m.isFloor).toBe(true);
  });

  it("empate resolve por volume e depois pelo nome — a ordem não pula", () => {
    const r = pageModels(
      agregado({
        b: balde({ tokensIn: 10 }),
        a: balde({ tokensIn: 10 }),
        c: balde({ tokensIn: 20 }),
      })
    );
    expect(r.map((m) => m.id)).toEqual(["c", "a", "b"]);
  });
});

describe("o relatório de uma dimensão inteira (o See all)", () => {
  const ops = [
    { id: "gpt-5", count: 13 },
    { id: "claude-sonnet-4-6", count: 7 },
    { id: "gemini-2.5-flash", count: 1 },
  ];

  it("as usadas medidas e em ordem de peso; as paradas no fim", () => {
    const baldes = {
      "gpt-5": balde({ cost: 1 }),
      "claude-sonnet-4-6": balde({ cost: 3 }),
    };
    const total = agregado(baldes).total;
    const r = sliceReport(ops, baldes, total);
    expect(r.used.map((u) => [u.id, u.pct])).toEqual([
      ["claude-sonnet-4-6", 75],
      ["gpt-5", 25],
    ]);

    expect(r.idle.map((o) => o.id)).toEqual(["gemini-2.5-flash"]);
    expect(r.used.length + r.idle.length).toBe(ops.length);
  });

  it("só entra o que é da lista — a busca recorta o relatório", () => {
    const baldes = {
      "gpt-5": balde({ cost: 1 }),
      "claude-sonnet-4-6": balde({ cost: 3 }),
    };
    const r = sliceReport([ops[0]], baldes, agregado(baldes).total);
    expect(r.used.map((u) => u.id)).toEqual(["gpt-5"]);

    expect(r.used[0].pct).toBe(25);
    expect(r.idle).toEqual([]);
  });

  it("o recorte do relatório tira só o filtro da própria dimensão", () => {
    const f = { providers: ["openai"], models: ["gpt-5"], modes: ["agent"], days: 30 };
    expect(withoutDimension(f, "models")).toEqual({
      providers: ["openai"],
      models: [],
      modes: ["agent"],
      days: 30,
    });

    expect(f.models).toEqual(["gpt-5"]);
  });

  it("fatiasDe serve pra qualquer agrupamento — o By model é um caso dela", () => {
    const baldes = { a: balde({ cost: 1 }), b: balde({ cost: 1 }) };
    const agg = agregado(baldes);
    expect(slicesOf(baldes, agg.total)).toEqual(pageModels(agg));
  });
});

describe("a lista do topo", () => {
  const chats = [
    linha({ id: "cara", cost: 2, tokensIn: 10 }),
    linha({ id: "barata", cost: 1, tokensIn: 5000 }),
    linha({ id: "unpriced", cost: null, tokensIn: 90 }),
  ];

  it("com dinheiro, as mais CARAS (a ordem do aggregate)", () => {
    const agg = agregado({ m: balde({ cost: 3 }) }, chats);
    expect(topChats(agg, 10).map((c) => c.id)).toEqual([
      "cara",
      "barata",
      "unpriced",
    ]);
    expect(topChats(agg, 1)).toHaveLength(1);
  });

  it("sem dinheiro, as MAIORES", () => {
    const agg = agregado({ m: balde({ cost: 0 }) }, chats);
    expect(topChats(agg, 10).map((c) => c.id)).toEqual([
      "barata",
      "unpriced",
      "cara",
    ]);
  });
});

describe("a faixa de datas do recorte", () => {
  it("vazio sem conversa", () => {
    expect(dateRange(null, null)).toBe("");
  });

  it("um dia só é um dia", () => {
    expect(dateRange("2026-09-11", "2026-09-11")).toBe("Sep 11");
  });

  it("no mesmo ano, sem o ano", () => {
    expect(dateRange("2026-06-01", "2026-09-29")).toBe("Jun 1 – Sep 29");
  });

  it("atravessando a virada, o ano aparece no começo", () => {
    expect(dateRange("2025-12-03", "2026-01-15")).toBe(
      "Dec 3, 2025 – Jan 15"
    );
  });
});

describe("os filtros que valem a pena", () => {
  it("conta só os de lista — o período tem o seletor dele", () => {
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

  it("à vista ficam as TRÊS mais usadas — o resto é do See all", () => {
    expect(VISIBLE_OPTIONS).toBe(3);
    expect(visibleOptions(ops, []).map((o) => o.id)).toEqual([
      "gpt-5",
      "claude-sonnet-4-6",
      "gpt-4o",
    ]);

    expect(visibleOptions(ops.slice(0, 2), [])).toHaveLength(2);
  });

  it("marcada fora das três volta pra fileira, NA FRENTE", () => {

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

  it("a busca da lista acha pelo nome do app E pelo id", () => {
    const nome = (id: string) =>
      ({ "claude-sonnet-4-6": "Sonnet 4.6", "gpt-5": "GPT 5" })[id] ?? id;
    expect(searchOptions(ops, "sonnet 4.6", nome).map((o) => o.id)).toEqual([
      "claude-sonnet-4-6",
    ]);
    expect(searchOptions(ops, "CLAUDE", nome).map((o) => o.id)).toEqual([
      "claude-sonnet-4-6",
    ]);
    expect(searchOptions(ops, "  ", nome)).toHaveLength(ops.length);
    expect(searchOptions(ops, "mistral", nome)).toEqual([]);
  });

  it("uma opção só não filtra nada — a não ser que esteja marcada", () => {
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
const SEM_COMENTARIO = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
const VIEW = readFileSync(resolve(__dirname, "../src/ui/UsageView.tsx"), "utf8");
const CARD = readFileSync(resolve(__dirname, "../src/ui/UsageCard.tsx"), "utf8");

function bloco(agulha: string): string {
  const i = SEM_COMENTARIO.indexOf(agulha);
  expect(i, `seletor sumiu do CSS: ${agulha}`).toBeGreaterThan(-1);
  const abre = SEM_COMENTARIO.indexOf("{", i);
  return SEM_COMENTARIO.slice(abre + 1, SEM_COMENTARIO.indexOf("}", abre));
}

describe("o cartão de uso da home", () => {
  it("não some num mês vazio — mostra o mês novo zerado", () => {

    expect(CARD).not.toMatch(/total\.chats === 0\)\s*return/);
    expect(CARD).not.toMatch(/return <RagLine/);

    expect(CARD).toContain('className="corvus-usage-foot"');
  });
});

describe("o desenho da página de uso", () => {
  it("o relatório mora na barra — flutuando, ele cobria a lista", () => {
    expect(VIEW).not.toContain("corvus-fab");
    expect(VIEW).toContain("corvus-topbar-action");

    expect(CSS).toMatch(
      /button\.corvus-sheet-action,\s*\.corvus-root button\.corvus-topbar-action\s*\{/
    );
  });

  it("as pílulas dos filtros ficam do tamanho delas", () => {

    expect(bloco(".corvus-root .corvus-usage-dim button.corvus-choice {")).toContain(
      "flex: 0 0 auto"
    );
  });

  it("cada dimensão é UMA fileira, que rola de lado — nunca quebra", () => {

    const b = bloco(".corvus-root .corvus-usage-dim .corvus-choices {");
    expect(b).toContain("flex-wrap: nowrap");
    expect(b).toContain("overflow-x: auto");

    expect(b).toContain("margin: 0 calc(var(--corvus-gutter) * -1)");
    expect(b).toContain("padding: 0 var(--corvus-gutter)");

    expect(b).not.toMatch(/mask-image/);
  });

  it("o rótulo do quadro nunca corta — sem espaço, sai o ícone", () => {

    expect(bloco(".corvus-root .corvus-usage.is-hero .corvus-mod {")).toContain(
      "container-type: inline-size"
    );
    const i = SEM_COMENTARIO.search(/@container \(max-width: [\d.]+px\)/);
    expect(i, "a regra do quadro estreito sumiu").toBeGreaterThan(-1);

    const regra = SEM_COMENTARIO.slice(i, SEM_COMENTARIO.indexOf("}", i));
    expect(regra).toContain(".corvus-mod-title.has-icon .corvus-icon");
    expect(regra).toContain("display: none");
  });

  it("as listas esticam — o bloco de seção encolhe os filhos", () => {

    expect(CSS).toContain(
      ".corvus-root .corvus-home-block > .corvus-usage-list {"
    );
    expect(bloco(".corvus-root .corvus-home-block > .corvus-usage-list {")).toContain(
      "align-self: stretch"
    );
  });

  it("o ícone do módulo é medido pelo token, não pelo atributo", () => {

    expect(bloco(".corvus-root .corvus-mod-title.has-icon {")).toMatch(
      /--icon-size:\s*\d+px/
    );
  });

  it("recado em cima de cartão é muted, nunca faint", () => {
    for (const sel of [
      ".corvus-root .corvus-usage-line {",
      ".corvus-root .corvus-usage-sub {",
      ".corvus-root .corvus-usage-sep {",
      ".corvus-root .corvus-usage-approx {",
      ".corvus-root .corvus-usage-row-sub {",
      ".corvus-root .corvus-usage-row-pct {",
      ".corvus-root .corvus-usage-dim-label {",
    ]) {
      const b = bloco(sel);
      expect(b, sel).toContain("var(--text-muted)");
      expect(b, sel).not.toContain("var(--text-faint)");
    }
  });

  it("a fileira mostra as três; o See all abre a lista inteira numa folha", () => {
    expect(VIEW).toContain("visibleOptions(d.ops, f[d.key])");
    expect(VIEW).toMatch(/d\.ops\.length > VISIBLE_OPTIONS/);
    expect(VIEW).toContain('tr("See all {n}", { n: d.ops.length })');
    expect(VIEW).toMatch(/<Sheet\b/);
  });

  it("a lista do See all é RELATÓRIO, não seletor — nada com cara de toque", () => {

    expect(VIEW).not.toMatch(/<SheetRow\b/);
    expect(VIEW).toMatch(/<SliceRow\b[\s\S]*?m=\{listMetric\}/);
    expect(VIEW).toContain("sliceReport(");
    expect(VIEW).toContain("withoutDimension(f, listDim)");

    const linha = VIEW.slice(
      VIEW.indexOf("function SliceRow"),
      VIEW.indexOf("function IdleRow")
    );
    expect(linha).not.toContain("<button");
    expect(linha).not.toContain("onClick");
  });

  it("os grupos de filtro respiram mais entre si do que até as pílulas", () => {

    const entreGrupos = bloco(".corvus-root .corvus-home-block.corvus-usage-filters {");
    expect(entreGrupos).toContain("gap: var(--corvus-5)");
    expect(bloco(".corvus-root .corvus-usage-dim {")).toContain("gap: var(--corvus-2)");
    expect(bloco(".corvus-root .corvus-usage-dim .corvus-choices {")).toContain(
      "gap: 10px"
    );
  });

  it("modelo se chama pelo nome do APP, na página e no cartão", () => {
    expect(VIEW).toContain("prettyModelName");
    expect(CARD).toContain("prettyModelName(m.model)");
    expect(CARD).not.toMatch(/>\{m\.model\}</);
  });
});
