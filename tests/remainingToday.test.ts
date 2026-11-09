import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __setRequestUrl } from "obsidian";
import {
  faltaParaVirar,
  inicioDoDia,
  lancar,
  modelosDesde,
  podar,
  somarDesde,
  type LivroDoDia,
} from "../src/usage/dailyLedger";
import { definirAnotadorDeUso, definirGuardaDeGasto } from "../src/usage/recorder";
import { getProvider, providers } from "../src/providers";
import type { Provider } from "../src/providers/base";
import { estadoDaChave } from "../src/providers/openrouter";
import { embedItems } from "../src/rag/embeddings";
import {
  CHAVE_LIMITE_GASTO,
  emQuanto,
  nivel,
  remainingToday,
  type EntradaDoDia,
  type Medidor,
} from "../src/usage/remainingToday";
import { ehPago, gastoDesde, marcosCruzados, precoConhecido } from "../src/usage/dailySpend";

const H = 3_600_000;

describe("o dia de cada provider", () => {
  it("UTC: meia-noite UTC", () => {
    expect(inicioDoDia(new Date("2026-10-02T15:30:00Z"), "UTC").toISOString()).toBe("2026-10-02T00:00:00.000Z");
    expect(faltaParaVirar(new Date("2026-10-02T15:30:00Z"), "UTC")).toBe(8.5 * H);
  });

  it("Gemini: meia-noite do Pacífico (PDT −7 em outubro, PST −8 em dezembro)", () => {
    expect(inicioDoDia(new Date("2026-10-02T15:30:00Z"), "America/Los_Angeles").toISOString()).toBe(
      "2026-10-02T07:00:00.000Z"
    );

    expect(inicioDoDia(new Date("2026-10-02T05:00:00Z"), "America/Los_Angeles").toISOString()).toBe(
      "2026-10-01T07:00:00.000Z"
    );
    expect(inicioDoDia(new Date("2026-12-10T12:00:00Z"), "America/Los_Angeles").toISOString()).toBe(
      "2026-12-10T08:00:00.000Z"
    );
  });

  it("no dia em que o horário de verão acaba, o dia começou em PDT e o próximo começa em PST", () => {

    const agora = new Date("2026-11-01T20:00:00Z");
    expect(inicioDoDia(agora, "America/Los_Angeles").toISOString()).toBe("2026-11-01T07:00:00.000Z");

    expect(faltaParaVirar(agora, "America/Los_Angeles")).toBe(12 * H);
  });

  it("no dia em que o horário de verão começa, o dia começou em PST e tem 23 horas", () => {
    const agora = new Date("2026-03-08T19:00:00Z"); 
    expect(inicioDoDia(agora, "America/Los_Angeles").toISOString()).toBe("2026-03-08T08:00:00.000Z");
    expect(faltaParaVirar(agora, "America/Los_Angeles")).toBe(12 * H);
  });

  it("o fuso de quem usa (São Paulo, −3)", () => {
    expect(inicioDoDia(new Date("2026-10-02T02:00:00Z"), "America/Sao_Paulo").toISOString()).toBe(
      "2026-10-01T03:00:00.000Z"
    );
  });

  it("emQuanto: horas e minutos, sem segundos", () => {
    expect(emQuanto(8.5 * H)).toBe("8h 30m");
    expect(emQuanto(H)).toBe("1h");
    expect(emQuanto(42 * 60_000)).toBe("42m");
    expect(emQuanto(59_000)).toBe("<1m");
  });
});

describe("o livro do dia", () => {
  it("soma por hora, por modelo, e corta no começo do dia", () => {
    const livro: LivroDoDia = {};
    lancar(livro, new Date("2026-10-02T10:15:00Z"), "gemini", "gemini-2.5-flash", { r: 1, i: 100, o: 10 });
    lancar(livro, new Date("2026-10-02T10:45:00Z"), "gemini", "gemini-2.5-flash", { r: 1, i: 50, o: 5 });
    lancar(livro, new Date("2026-10-02T11:00:00Z"), "gemini", "gemini-2.5-pro", { r: 3 });
    lancar(livro, new Date("2026-10-02T06:00:00Z"), "gemini", "gemini-2.5-pro", { r: 9 });
    expect(livro["2026-10-02T10"]["gemini\u0001gemini-2.5-flash"]).toEqual({ r: 2, i: 150, o: 15 });

    const desde = new Date("2026-10-02T07:00:00Z");
    expect(somarDesde(livro, desde, (p) => p === "gemini")).toEqual({ r: 5, i: 150, o: 15 });
    expect(modelosDesde(livro, desde, "gemini").map((x) => [x.model, x.r])).toEqual([
      ["gemini-2.5-pro", 3],
      ["gemini-2.5-flash", 2],
    ]);
  });

  it("o id do modelo pode ter barra e dois-pontos (OpenRouter)", () => {
    const livro: LivroDoDia = {};
    lancar(livro, new Date("2026-10-02T10:00:00Z"), "openrouter", "meta-llama/llama-3.3-70b-instruct:free", { r: 1 });
    expect(modelosDesde(livro, new Date("2026-10-02T00:00:00Z"), "openrouter")[0].model).toBe(
      "meta-llama/llama-3.3-70b-instruct:free"
    );
  });

  it("podar joga fora o que passou de 50 horas — o livro não cresce", () => {
    const livro: LivroDoDia = {};
    lancar(livro, new Date("2026-09-29T00:00:00Z"), "nim", "x", { r: 1 });
    lancar(livro, new Date("2026-10-01T00:00:00Z"), "nim", "x", { r: 1 });
    podar(livro, new Date("2026-10-02T12:00:00Z"));
    expect(Object.keys(livro)).toEqual(["2026-10-01T00"]);
  });
});

describe("o registro: o que o provider gasta vai pro livro", () => {
  const anotados: Array<[string, string, unknown]> = [];
  beforeEach(() => {
    anotados.length = 0;
    definirAnotadorDeUso((p, m, d) => anotados.push([p, m, d]));
  });
  afterEach(() => {
    definirAnotadorDeUso(null);
    delete providers.falso;
  });

  const req = { model: "m-1", messages: [] } as unknown as Parameters<Provider["chat"]>[0];

  const falso = (over: Partial<Provider>): Provider =>
    ({
      id: "falso",
      name: "Falso",
      listModels: async () => ["m-1"],
      chat: async () => ({ content: "ok", usage: { input: 10, output: 5 } }),
      streamChat: async () => ({ content: "" }),
      ...over,
    }) as unknown as Provider;

  it("stream: um pedido, e o ÚLTIMO uso — o acumulado que vem duas vezes não soma em dobro", async () => {
    providers.falso = falso({
      streamChat: async (_r, _k, onToken, onUsage) => {
        onToken("a");
        onUsage?.({ input: 100, output: 1 });
        onUsage?.({ input: 100, output: 20 });
        return { content: "a" };
      },
    });
    await getProvider("falso").streamChat(req, "k", () => {});
    expect(anotados).toEqual([["falso", "m-1", { r: 1, i: 100, o: 20 }]]);
  });

  it("stream sem aviso de uso: vale o uso da resposta", async () => {
    providers.falso = falso({
      streamChat: async (_r, _k, onToken) => {
        onToken("a");
        return { content: "a", usage: { input: 7, output: 3 } };
      },
    });
    await getProvider("falso").streamChat(req, "k", () => {});
    expect(anotados).toEqual([["falso", "m-1", { r: 1, i: 7, o: 3 }]]);
  });

  it("parado no meio (Stop, queda) conta: o servidor já tinha aceitado", async () => {
    providers.falso = falso({
      streamChat: async (_r, _k, onToken) => {
        onToken("a");
        throw new Error("aborted");
      },
    });
    await expect(getProvider("falso").streamChat(req, "k", () => {})).rejects.toThrow("aborted");
    expect(anotados).toEqual([["falso", "m-1", { r: 1, i: 0, o: 0 }]]);
  });

  it("recusado antes de começar (429, chave errada) NÃO conta — a cota também não andou", async () => {
    providers.falso = falso({
      streamChat: async () => {
        throw new Error("429");
      },
      chat: async () => {
        throw new Error("401");
      },
    });
    await expect(getProvider("falso").streamChat(req, "k", () => {})).rejects.toThrow();
    await expect(getProvider("falso").chat(req, "k")).rejects.toThrow();
    expect(anotados).toEqual([]);
  });

  it("a guarda do limite de gasto barra ANTES de sair — e nada é anotado", async () => {
    let saiu = false;
    providers.falso = falso({
      chat: async () => {
        saiu = true;
        return { content: "x" };
      },
    });
    definirGuardaDeGasto(() => {
      throw new Error("limite batido");
    });
    try {
      await expect(getProvider("falso").chat(req, "k")).rejects.toThrow("limite batido");
      await expect(getProvider("falso").streamChat(req, "k", () => {})).rejects.toThrow("limite batido");
    } finally {
      definirGuardaDeGasto(null);
    }
    expect(saiu).toBe(false);
    expect(anotados).toEqual([]);
  });

  it("chat: um pedido com os tokens da resposta", async () => {
    providers.falso = falso({});
    await getProvider("falso").chat(req, "k");
    expect(anotados).toEqual([["falso", "m-1", { r: 1, i: 10, o: 5 }]]);
  });

  it("o resto passa direto, e trocar o objeto troca o embrulho", async () => {
    providers.falso = falso({});
    const w = getProvider("falso");
    expect(w).toBe(getProvider("falso"));
    expect(await w.listModels("k")).toEqual(["m-1"]);
    providers.falso = falso({ chat: async () => ({ content: "novo", usage: { input: 1, output: 1 } }) });
    expect((await getProvider("falso").chat(req, "k")).content).toBe("novo");
  });
});

describe("os embeddings também gastam a cota do dia", () => {
  const anotados: Array<[string, string, unknown]> = [];
  beforeEach(() => {
    anotados.length = 0;
    definirAnotadorDeUso((p, m, d) => anotados.push([p, m, d]));
    vi.stubGlobal("window", { setTimeout, clearTimeout });
  });
  afterEach(() => {
    definirAnotadorDeUso(null);
    __setRequestUrl(null);
    vi.unstubAllGlobals();
  });
  const creds = { openaiApiKey: "", openrouterApiKey: "", geminiApiKey: "g", nimApiKey: "" };

  it("um pedido por chamada que deu certo (Gemini)", async () => {
    __setRequestUrl(async () => ({
      status: 200,
      json: { data: [{ embedding: [0.1, 0.2], index: 0 }], usage: { prompt_tokens: 7, total_tokens: 7 } },
    }));
    await embedItems([{ kind: "text", text: "oi" }], creds, "gemini-embedding-001");
    expect(anotados).toEqual([["gemini", "gemini-embedding-001", { r: 1, i: 7 }]]);
  });

  it("recusado (429) não conta", async () => {
    __setRequestUrl(async () => ({ status: 429, json: {}, text: "" }));
    await expect(embedItems([{ kind: "text", text: "oi" }], creds, "gemini-embedding-001")).rejects.toThrow();
    expect(anotados).toEqual([]);
  });
});

describe("a chave do OpenRouter (/api/v1/key)", () => {
  it("os grátis do dia, o crédito, o gasto de hoje e quando o teto volta", () => {
    expect(
      estadoDaChave({
        data: {
          free_model_daily_requests: { used: 20, limit: 50, remaining: 30 },
          limit_remaining: 4.2,
          usage_daily: 0.31,
          limit_reset: "monthly",
        },
      })
    ).toEqual({
      gratis: { limite: 50, usados: 20, restantes: 30 },
      creditoRestante: 4.2,
      gastoHoje: 0.31,
      creditoVolta: "monthly",
    });
  });

  it("chave sem teto: crédito null; sem os campos, nada inventado", () => {
    expect(estadoDaChave({ data: { limit_remaining: null } })).toEqual({ creditoRestante: null });
    expect(estadoDaChave({ data: {} })).toEqual({});
    expect(estadoDaChave({ data: { is_free_tier: true } })).toEqual({ gratis: { limite: 50 } });
    expect(estadoDaChave(null)).toBeNull();
  });
});

describe("os cartões do Left today", () => {

  const agora = new Date("2026-10-02T15:30:00Z");
  const livro = (): LivroDoDia => {
    const l: LivroDoDia = {};

    lancar(l, new Date("2026-10-02T01:00:00Z"), "openai", "gpt-5", { r: 1, i: 1000, o: 500 });
    lancar(l, new Date("2026-10-01T23:00:00Z"), "openai", "gpt-5", { r: 1, i: 9999, o: 1 }); 
    lancar(l, new Date("2026-10-02T10:00:00Z"), "openai", "gpt-5-mini", { r: 1, i: 2000, o: 0 });
    lancar(l, new Date("2026-10-02T10:00:00Z"), "openai", "gpt-image-1", { r: 1, i: 50, o: 50 }); 

    lancar(l, new Date("2026-10-02T06:00:00Z"), "gemini", "gemini-2.5-flash", { r: 5 }); 
    lancar(l, new Date("2026-10-02T08:00:00Z"), "gemini", "gemini-2.5-flash", { r: 12 });
    lancar(l, new Date("2026-10-02T09:00:00Z"), "gemini", "gemini-2.5-flash-image", { r: 2 });

    lancar(l, new Date("2026-10-02T03:00:00Z"), "openrouter", "meta-llama/llama-3.3-70b-instruct:free", { r: 13 });
    lancar(l, new Date("2026-10-02T03:00:00Z"), "openrouter", "inclusionai/ling-3.1-flash", { r: 4 });

    lancar(l, new Date("2026-10-02T14:00:00Z"), "nim", "meta/llama-3.1-70b-instruct", { r: 23 });
    lancar(l, new Date("2026-10-02T02:00:00Z"), "nim", "meta/llama-3.1-70b-instruct", { r: 6 }); 
    return l;
  };
  const base = (over: Partial<EntradaDoDia> = {}): EntradaDoDia => ({
    livro: livro(),
    agora,
    comChave: () => true,
    openai: { dataSharing: true, tier: 1 },
    limites: {},
    cotaOpenRouter: { limit: 50 },
    fusoLocal: "America/Sao_Paulo",
    ...over,
  });
  const medidor = (cartoes: ReturnType<typeof remainingToday>, provider: string, id: string): Medidor =>
    cartoes.find((c) => c.provider === provider)!.medidores.find((m) => m.id === id)!;

  it("ordem fixa, e só quem tem chave ou usou hoje", () => {

    expect(remainingToday(base()).map((c) => c.provider)).toEqual(["spend", "openai", "gemini", "openrouter", "nim"]);
    expect(remainingToday(base({ livro: {}, comChave: () => false }))).toEqual([]);
    expect(remainingToday(base({ livro: {}, comChave: (p) => p === "gemini" })).map((c) => c.provider)).toEqual(["gemini"]);

    expect(remainingToday(base({ comChave: () => false })).map((c) => c.provider)).toEqual([
      "spend",
      "openai",
      "gemini",
      "openrouter",
      "nim",
    ]);
  });

  it("OpenAI: os dois baldes do dia UTC; imagem não entra", () => {
    const c = remainingToday(base());
    expect(medidor(c, "openai", "openai-big")).toMatchObject({ usado: 1500, limite: 250_000, restante: 248_500 });
    expect(medidor(c, "openai", "openai-mini")).toMatchObject({ usado: 2000, limite: 2_500_000, restante: 2_498_000 });
    expect(c.find((x) => x.provider === "openai")!.viraEm).toBe(8.5 * H);
    const t3 = remainingToday(base({ openai: { dataSharing: true, tier: 3 } }));
    expect(medidor(t3, "openai", "openai-big").limite).toBe(1_000_000);
  });

  it("OpenAI sem data-sharing: diz o porquê, sem medidor e sem relógio", () => {
    const o = remainingToday(base({ openai: { dataSharing: false, tier: 1 } })).find((x) => x.provider === "openai")!;
    expect(o.medidores).toEqual([]);
    expect(o.vazio).toMatch(/shares API data/);
    expect(o.viraEm).toBeNull();
    expect(
      remainingToday(base({ openai: { dataSharing: true, tier: 0 } })).find((x) => x.provider === "openai")!.vazio
    ).toMatch(/tier 1/);
  });

  it("Gemini: por modelo, no dia do Pacífico; o pago diz que é pago", () => {
    const c = remainingToday(base());
    const g = c.find((x) => x.provider === "gemini")!;
    expect(g.medidores.map((m) => [m.modelo, m.usado])).toEqual([
      ["gemini-2.5-flash", 12],
      ["gemini-2.5-flash-image", 2],
    ]);
    expect(g.medidores[0]).toMatchObject({ limite: undefined, restante: undefined, limiteEditavel: "gemini\u0001gemini-2.5-flash" });
    expect(g.medidores[1].nota).toMatch(/Paid only/);
    expect(g.viraEm).toBe(15.5 * H); 
    expect(g.link?.url).toBe("https://aistudio.google.com/rate-limit");
  });

  it("Gemini: o teto informado vira 'quanto sobra' — e modelo com teto aparece mesmo sem uso", () => {
    const c = remainingToday(
      base({
        limites: {
          "gemini\u0001gemini-2.5-flash": 250,
          "gemini\u0001gemini-2.5-pro": 100,
          "gemini\u0001lixo": 0, 
        },
      })
    );
    const g = c.find((x) => x.provider === "gemini")!;
    expect(g.medidores.map((m) => [m.modelo, m.usado, m.restante])).toEqual([
      ["gemini-2.5-flash", 12, 238],
      ["gemini-2.5-flash-image", 2, undefined],
      ["gemini-2.5-pro", 0, 100],
    ]);
  });

  it("OpenRouter sem resposta da chave: a conta deste aparelho, só dos :free", () => {
    const m = medidor(remainingToday(base()), "openrouter", "openrouter-free");
    expect(m).toMatchObject({ usado: 13, limite: 50, restante: 37, fonte: "local" });

    expect(remainingToday(base()).find((x) => x.provider === "openrouter")!.nota).toMatch(/^Counted on this device/);
  });

  it("OpenRouter com a chave respondendo: vale o número dela, e o crédito vem junto", () => {
    const viva = estadoDaChave({
      data: {
        free_model_daily_requests: { used: 20, limit: 50, remaining: 30 },
        limit_remaining: 4.2,
        usage_daily: 0.31,
        limit_reset: "monthly",
      },
    });
    const c = remainingToday(base({ chaveOpenRouter: viva }));
    expect(medidor(c, "openrouter", "openrouter-free")).toMatchObject({ usado: 20, limite: 50, restante: 30, fonte: "live" });
    expect(c.find((x) => x.provider === "openrouter")!.credito).toEqual({ restante: 4.2, gastoHoje: 0.31, volta: "monthly" });
    expect(c.find((x) => x.provider === "openrouter")!.nota).toMatch(/^Counted by OpenRouter for this key/);
  });

  it("OpenRouter: a chave só diz o tier (sem used/remaining) — o teto é dela, a conta é daqui", () => {
    const c = remainingToday(base({ chaveOpenRouter: estadoDaChave({ data: { is_free_tier: false } }) }));
    expect(medidor(c, "openrouter", "openrouter-free")).toMatchObject({ usado: 13, limite: 1000, restante: 987, fonte: "local" });
  });

  it("NIM: o dia de quem usa, sem teto diário", () => {
    const n = remainingToday(base()).find((x) => x.provider === "nim")!;
    expect(n.medidores[0].usado).toBe(23);
    expect(n.medidores[0].limite).toBeUndefined();
    expect(n.viraEm).toBeNull();
    expect(n.semDia).toBe("no daily cap");
    expect(n.nota).toMatch(/40 requests a minute/);
  });

  it("o nível do medidor: acabou, quase, ok", () => {
    const m = (restante: number, limite = 100): Medidor => ({
      id: "x",
      rotulo: "x",
      usado: limite - restante,
      limite,
      restante,
      unidade: "requests",
      fonte: "local",
    });
    expect(nivel(m(0))).toBe("fim");
    expect(nivel(m(10))).toBe("baixo");
    expect(nivel(m(50))).toBe("ok");
    expect(nivel({ ...m(5), limite: undefined, restante: undefined })).toBeNull();
  });
});

describe("o gasto do dia e o limite", () => {
  const agora = new Date("2026-10-02T15:30:00Z");
  const livro = (): LivroDoDia => {
    const l: LivroDoDia = {};

    lancar(l, new Date("2026-10-02T12:00:00Z"), "openai", "gpt-5-nano", { r: 2, i: 1_000_000, o: 1_000_000 });

    lancar(l, new Date("2026-10-02T02:00:00Z"), "openai", "gpt-5-nano", { r: 1, i: 9_000_000, o: 0 });

    lancar(l, new Date("2026-10-02T12:00:00Z"), "openrouter", "x/y:free", { r: 4, i: 500_000, o: 500_000 });
    lancar(l, new Date("2026-10-02T12:00:00Z"), "ollama", "llama3.2", { r: 3, i: 900_000, o: 900_000 });

    lancar(l, new Date("2026-10-02T12:00:00Z"), "nim", "algum/modelo-sem-preco", { r: 5, i: 10, o: 10 });
    return l;
  };

  it("soma pelo preço público, no dia de quem usa; sem preço fica de fora (e contado)", () => {
    const g = gastoDesde(livro(), inicioDoDia(agora, "America/Sao_Paulo"));
    const p = precoConhecido("openai", "gpt-5-nano")!;
    expect(g.total).toBeCloseTo(p.entrada + p.saida, 6);
    expect(g.semPreco).toBe(5);
    expect(precoConhecido("ollama", "qualquer")).toEqual({ entrada: 0, saida: 0 });
    expect(ehPago("openrouter", "x/y:free")).toBe(false);
    expect(ehPago("openai", "gpt-5-nano")).toBe(true);
    expect(ehPago("nim", "algum/modelo-sem-preco")).toBe(false);
  });

  it("os marcos: 80% e 100%, uma vez cada, só ao cruzar", () => {
    expect(marcosCruzados(0.5, 0.85, 1)).toEqual([80]);
    expect(marcosCruzados(0.85, 1.2, 1)).toEqual([100]);
    expect(marcosCruzados(0.1, 1.5, 1)).toEqual([80, 100]);
    expect(marcosCruzados(0.85, 0.9, 1)).toEqual([]);
    expect(marcosCruzados(0, 5, 0)).toEqual([]);
  });

  it("o cartão Paid models: bateria contra o limite, limite editável, a nota diz o que fica de fora", () => {
    const base = {
      livro: livro(),
      agora,
      comChave: () => false,
      openai: { dataSharing: false, tier: 1 },
      limites: {},
      fusoLocal: "America/Sao_Paulo",
    };
    const p = precoConhecido("openai", "gpt-5-nano")!;
    const total = p.entrada + p.saida;
    const com = remainingToday({ ...base, limiteGasto: 2, travarNoLimite: true })[0];
    expect(com.provider).toBe("spend");
    expect(com.medidores[0]).toMatchObject({ unidade: "usd", limite: 2, limiteEditavel: CHAVE_LIMITE_GASTO });
    expect(com.medidores[0].restante).toBeCloseTo(2 - total, 6);
    expect(com.nota).toMatch(/5 requests on models without a public price aren't included/);
    expect(com.nota).toMatch(/paid models pause until midnight/);

    expect(remainingToday({ ...base, livro: {}, limiteGasto: 0 }).map((c) => c.provider)).not.toContain("spend");

    const sem = remainingToday({ ...base, limiteGasto: 0 })[0];
    expect(sem.medidores[0].limite).toBeUndefined();
    expect(sem.nota).toMatch(/Set a limit/);
  });
});
