import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  diaCurto,
  diasEntre,
  janelaDoGrafico,
  passoDe,
  picoDa,
  serieDoTempo,
} from "../src/usage/timeline";
import type { UsageBucket } from "../src/usage/aggregate";

// A SÉRIE NO TEMPO do gráfico da página de uso: em que passo o tempo é
// contado, que janela ele cobre, e o que cada coluna soma.

const b = (tokensIn: number, tokensOut: number, chats = 1): UsageBucket => ({
  chats,
  tokensIn,
  tokensOut,
  cost: 0,
  hasUnknownCost: false,
});

describe("o passo do tempo", () => {
  it("dia até um mês, semana até meio ano, mês daí pra frente", () => {
    // Os cortes são de LARGURA: mais de ~31 colunas num telefone são fios.
    expect(passoDe(1)).toBe("day");
    expect(passoDe(30)).toBe("day");
    expect(passoDe(31)).toBe("day");
    expect(passoDe(32)).toBe("week");
    expect(passoDe(182)).toBe("week");
    expect(passoDe(183)).toBe("month");
    expect(passoDe(3650)).toBe("month");
  });

  it("conta os dois extremos", () => {
    expect(diasEntre("2026-09-11", "2026-09-11")).toBe(1);
    expect(diasEntre("2026-09-01", "2026-09-30")).toBe(30);
    // Atravessando a virada do ano (e um ano bissexto no meio).
    expect(diasEntre("2025-12-31", "2026-01-01")).toBe(2);
  });
});

describe("a janela do gráfico", () => {
  const byDay = {
    "2026-09-01": b(10, 5),
    "2026-09-20": b(10, 5),
  };
  // 2026-09-25T12:00Z
  const agora = Date.parse("2026-09-25T12:00:00Z");

  it("sem conversa nenhuma não há janela — nem gráfico", () => {
    expect(janelaDoGrafico(0, {}, agora)).toBeNull();
  });

  it("All time vai da primeira à última conversa", () => {
    expect(janelaDoGrafico(0, byDay, agora)).toEqual({
      de: "2026-09-01",
      ate: "2026-09-20",
    });
  });

  it("uma janela de N dias termina HOJE, com os dias vazios dentro", () => {
    // Não usar também é o que o desenho conta: sem os dias vazios, dois picos
    // distantes ficam encostados e o ritmo fica mentiroso.
    expect(janelaDoGrafico(7, { "2026-09-24": b(10, 5) }, agora)).toEqual({
      de: "2026-09-19",
      ate: "2026-09-25",
    });
  });

  it("ela se ESTICA pra caber todo dia que a agregação trouxe", () => {
    // O filtro de período corta por instante (agora − N×24h) e o byDay indexa
    // por dia em UTC: uma conversa passa no filtro e cai um dia antes do
    // começo da janela. Sem esticar, ela sumia do gráfico e ficava no total.
    expect(janelaDoGrafico(7, byDay, agora)).toEqual({
      de: "2026-09-01",
      ate: "2026-09-25",
    });
  });
});

describe("as colunas", () => {
  it("uma por dia, inclusive as vazias, na ordem", () => {
    const s = serieDoTempo(
      { "2026-09-02": b(100, 40) },
      "2026-09-01",
      "2026-09-03",
      "day"
    );
    expect(s.map((c) => c.inicio)).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
    ]);
    expect(s.map((c) => c.total)).toEqual([0, 140, 0]);
    expect(s[1]).toMatchObject({ entrada: 100, saida: 40, chats: 1 });
  });

  it("a semana começa na SEGUNDA, como o calendário do cartão da home", () => {
    // 2026-09-11 é uma sexta; a semana dela abre no dia 7.
    const s = serieDoTempo(
      { "2026-09-11": b(10, 1), "2026-09-13": b(20, 2) },
      "2026-09-11",
      "2026-09-13",
      "week"
    );
    expect(s).toHaveLength(1);
    // Os dois dias caem na MESMA coluna e somam.
    expect(s[0]).toMatchObject({ inicio: "2026-09-07", entrada: 30, saida: 3 });
  });

  it("o mês junta o mês inteiro", () => {
    const s = serieDoTempo(
      { "2026-08-31": b(5, 1), "2026-09-01": b(10, 2), "2026-09-30": b(20, 4) },
      "2026-08-31",
      "2026-09-30",
      "month"
    );
    expect(s.map((c) => [c.inicio, c.entrada, c.saida])).toEqual([
      ["2026-08-01", 5, 1],
      ["2026-09-01", 30, 6],
    ]);
  });

  it("o pedaço nunca anuncia dia que ainda não aconteceu", () => {
    // Uma semana cortada no meio pela ponta da janela se apresenta até onde a
    // janela vai — senão o rótulo fala do futuro.
    const s = serieDoTempo({}, "2026-09-07", "2026-09-09", "week");
    expect(s[0].titulo).toBe("Sep 7 – Sep 9, 2026");
  });

  it("nada fora da janela entra, nem data ilegível", () => {
    const s = serieDoTempo(
      { "2026-08-01": b(999, 999), "(sem data)": b(7, 7), "2026-09-02": b(1, 1) },
      "2026-09-01",
      "2026-09-03",
      "day"
    );
    expect(s.reduce((t, c) => t + c.total, 0)).toBe(2);
  });

  it("janela de trás pra frente não desenha nada", () => {
    expect(serieDoTempo({}, "2026-09-10", "2026-09-01", "day")).toEqual([]);
  });

  it("o pico é a coluna mais alta — é dele que sai a escala", () => {
    const s = serieDoTempo(
      { "2026-09-01": b(10, 5), "2026-09-03": b(100, 50) },
      "2026-09-01",
      "2026-09-03",
      "day"
    );
    expect(picoDa(s)).toBe(150);
    expect(picoDa([])).toBe(0);
  });
});

describe("os rótulos", () => {
  it("curtos pro eixo, inteiros pra quem foi ler", () => {
    const [dia] = serieDoTempo({}, "2026-09-11", "2026-09-11", "day");
    expect(dia.rotulo).toBe("Sep 11");
    expect(dia.titulo).toBe("Sep 11, 2026");

    const [semana] = serieDoTempo({}, "2026-09-07", "2026-09-13", "week");
    expect(semana.rotulo).toBe("Sep 7");
    expect(semana.titulo).toBe("Sep 7 – Sep 13, 2026");

    // Mês curto, como o resto da tela ("Jun 1 – Sep 29"): um segundo jeito de
    // dizer setembro na mesma página seria uma diferença sem motivo.
    const [mes] = serieDoTempo({}, "2026-09-01", "2026-09-30", "month");
    expect(mes.rotulo).toBe("Sep");
    expect(mes.titulo).toBe("Sep 2026");
  });

  it("diaCurto é o MESMO formatador da faixa do cabeçalho", () => {
    expect(diaCurto("2026-09-11")).toBe("Sep 11");
    expect(diaCurto("2026-09-11", true)).toBe("Sep 11, 2026");
    expect(diaCurto("nada")).toBe("nada");
  });
});

// ── o desenho ───────────────────────────────────────────────────────────

const CSS = readFileSync(resolve(__dirname, "../styles/main.css"), "utf8");
const SEM_COMENTARIO = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
const VIEW = readFileSync(resolve(__dirname, "../src/ui/UsageView.tsx"), "utf8");

/**
 * O corpo da regra desse seletor — dele SOZINHO.
 *
 * Um `indexOf` cru pegava a regra COMPARTILHADA (`.corvus-chart-air,
 * .corvus-chart-bar {`), que é outra: o teste passava a ler as declarações
 * erradas. Aqui o seletor tem que vir logo depois do fim da regra anterior
 * (`}`) e não depois de uma vírgula.
 */
function bloco(agulha: string): string {
  const sel = agulha.replace(/\{$/, "").trim();
  const re = new RegExp(
    `(?:^|\\})\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`
  );
  const m = SEM_COMENTARIO.match(re);
  expect(m, `seletor sumiu do CSS (ou não está sozinho): ${sel}`).not.toBeNull();
  return m![1];
}

describe("o desenho do gráfico", () => {
  it("as duas séries são dois tons da MESMA cor do app", () => {
    // Uma segunda cor fixa colidiria com o acento no dia em que a pessoa
    // escolhesse justamente ela — e tom é o canal que qualquer daltonismo
    // enxerga.
    const b = bloco(".corvus-root .corvus-chart {");
    expect(b).toContain("--corvus-serie-in: var(--interactive-accent)");
    expect(b).toMatch(/--corvus-serie-out:\s*color-mix\(/);
    // Puxada pro TEXTO do tema, não pro fundo: medido no escuro, mistura com
    // o fundo dava 1,03:1 contra o cartão — a barra sumia.
    const fora = b.slice(b.indexOf("--corvus-serie-out"));
    expect(fora).toContain("var(--text-normal)");
    expect(fora).not.toContain("var(--background-primary)");
  });

  it("a legenda existe sempre — só ela diz qual tom é qual", () => {
    expect(VIEW).toContain("corvus-chart-legend");
    expect(VIEW).toContain("corvus-chart-swatch is-in");
    expect(VIEW).toContain("corvus-chart-swatch is-out");
    // E a escala tem topo anunciado: sem ele, altura só compara consigo mesma.
    expect(VIEW).toContain("peak ");
  });

  it("a coluna escolhida se marca por um TRAÇO, não pintando a faixa", () => {
    // Retângulo da altura do quadro lia como mais uma barra — a mais alta.
    const b = bloco(".corvus-root button.corvus-chart-col.is-on {");
    expect(b).toContain("inset 0 -2px 0 var(--interactive-accent)");
    expect(b).not.toContain("background-color");
  });

  it("o cartão do gráfico não muda de largura com o que está escrito nele", () => {
    // O bloco de seção encolhe os filhos pro conteúdo: sem esticar, escolher
    // uma semana vazia encolhia o gráfico inteiro.
    expect(bloco(".corvus-root .corvus-chart {")).toContain("align-self: stretch");
  });

  it("a barra tem teto de largura e piso de altura", () => {
    // Teto: com sete colunas num painel largo ela viraria um bloco.
    expect(bloco(".corvus-root .corvus-chart-stack {")).toContain(
      "width: min(100%, 24px)"
    );
    // Piso: zero e quase-zero são coisas diferentes.
    expect(bloco(".corvus-root .corvus-chart-bar {")).toContain("min-height: 2px");
  });

  it("o vão entre as partes e entre as colunas é a cor do cartão, não um risco", () => {
    expect(bloco(".corvus-root .corvus-chart-plot {")).toContain("gap: 2px");
    // O vão só existe quando HÁ barra de entrada embaixo. Era um
    // `:has(+ .is-in)`; virou a classe `has-in`, decidida no render — quem
    // sabe se a outra barra existe é ele, e saber ali não custa invalidação
    // de seletor no navegador.
    expect(bloco(".corvus-root .corvus-chart-bar.is-out.has-in {")).toContain(
      "margin-bottom: 2px"
    );
    expect(VIEW).toContain('"corvus-chart-bar is-out has-in"');
    expect(bloco(".corvus-root .corvus-chart-bar {")).not.toContain("border:");
  });

  it("o número não depende de mouse: vai no title E no rótulo acessível", () => {
    // No celular não há hover; o toque leva o valor pra linha de leitura.
    expect(VIEW).toMatch(
      /aria-label=\{tr\("\{when\}[^"]*\{sent\} sent[^"]*",\s*\{\s*when: c\.titulo,\s*sent: formatCompact\(c\.entrada\)/
    );
    expect(VIEW).toMatch(
      /title=\{tr\("\{when\}[^"]*\{sent\} sent[^"]*",\s*\{\s*when: c\.titulo,\s*sent: formatCompact\(c\.entrada\)/
    );
    expect(VIEW).toContain("corvus-chart-readout");
  });

  it("com uma coluna só não há série — seria o total desenhado de novo", () => {
    expect(VIEW).toMatch(/serie\.colunas\.length > 1/);
  });
});

describe("o gráfico VAZIO", () => {
  it("o lugar do gráfico não some: sem série, entra o vazio dele", () => {
    // Sumindo, a página se remonta quando o recorte muda e quem mexeu no
    // filtro nem descobre que existe um gráfico ali.
    expect(VIEW).toMatch(
      /serie\.colunas\.length > 1[\s\S]{0,120}\?\s*\(?\s*<GraficoNoTempo/
    );
    expect(VIEW).toContain("<GraficoVazio");
  });

  it("diz POR QUE está vazio — e cada motivo é um motivo diferente", () => {
    for (const frase of [
      "Your tokens land here as you chat.",
      "Nothing to plot yet.",
      "No tokens recorded in these chats.",
      "Just one day so far",
    ]) {
      expect(VIEW, frase).toContain(frase);
    }
    // Nenhum repete o vazio da PÁGINA, que fica logo abaixo e dá a saída:
    // a mesma frase duas vezes na mesma tela ensina a não ler nenhuma.
    const daPagina = "Nothing in this slice.";
    expect(VIEW).toContain(daPagina);
    expect(VIEW.split(daPagina)).toHaveLength(2);
  });

  it("as colunas de mentira nunca usam as cores das séries", () => {
    // Fantasma na cor do dado seria dado inventado.
    const b = bloco(".corvus-root .corvus-chart-bar.is-ghost {");
    expect(b).toMatch(/color-mix\(in srgb, var\(--text-normal\) \d+%/);
    expect(b).not.toContain("--corvus-serie");
  });

  it("as alturas de mentira são FIXAS — sorteio faria a tela piscar", () => {
    const m = VIEW.match(/const FANTASMA = \[([^\]]+)\]/);
    expect(m, "as alturas do fantasma sumiram").not.toBeNull();
    const hs = m![1].split(",").map((n) => Number(n.trim()));
    expect(hs.length).toBeGreaterThan(6);
    expect(VIEW).not.toMatch(/FANTASMA[\s\S]{0,200}Math\.random/);
    // Nem sobem nem descem: uma escadinha leria como tendência, e não há
    // tendência nenhuma pra ler.
    const subindo = hs.every((h, i) => i === 0 || h >= hs[i - 1]);
    const descendo = hs.every((h, i) => i === 0 || h <= hs[i - 1]);
    expect(subindo || descendo).toBe(false);
  });

  it("sem dado não há piso: o fio do eixo sai", () => {
    // Ele prometeria uma escala que não está medindo nada.
    expect(bloco(".corvus-root .corvus-chart.is-empty .corvus-chart-plot {")).toContain(
      "border-bottom-color: transparent"
    );
  });

  it("a faixa da coluna serve ao botão E ao span do vazio", () => {
    // A regra estava presa em `button.corvus-chart-col`, e o fantasma é span:
    // sem isto ele nasceria sem largura nenhuma.
    const b = bloco(".corvus-root .corvus-chart-col {");
    expect(b).toContain("flex: 1 1 0");
    expect(b).toContain("height: 100%");
    expect(bloco(".corvus-root button.corvus-chart-col {")).toContain(
      "cursor: pointer"
    );
  });
});
