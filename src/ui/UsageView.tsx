import { useMemo, useState, type CSSProperties } from "react";
import { Notice } from "obsidian";
import type CorvusPlugin from "../main";
import type { ChatSession } from "../core/session";
import { useChatSummaries, providerIcon } from "./ChatList";
import { Icon } from "./Icon";
import { Segmented } from "./Segmented";
import { aggregateFromSummaries, type ChatUsageRow } from "../usage/aggregate";
import { formatUsd, formatUsdRounded } from "../usage/pricing";
import { formatCompact } from "../usage/format";
import { saveUsageMarkdown } from "../usage/export";
import {
  FILTRO_VAZIO,
  alternar,
  aplicar,
  opcoes,
  type Opcao,
  type UsageFilter,
} from "../usage/filters";
import {
  A_VISTA,
  buscarOpcoes,
  conversasDoTopo,
  faixaDeDatas,
  marcados,
  mediaPorConversa,
  metricaDa,
  modelosDaPagina,
  opcoesAVista,
  relatorioDe,
  semADimensao,
  valeFiltrar,
  type Fatia,
  type Metrica,
} from "../usage/page";
import {
  janelaDoGrafico,
  passoDe,
  picoDa,
  serieDoTempo,
  diasEntre,
  type Coluna,
  type Passo,
} from "../usage/timeline";
import { Sheet, SheetNote, SheetSearch } from "./Sheet";
import { moduleIcon, moduleLabel, relativeShort } from "./modules";
import { PROVIDERS } from "../core/providersMeta";
import { prettyModelName } from "../providers/modelDescriptions";
import { modelLogo } from "../providers/modelLogo";
import { LeftToday } from "./LeftToday";
import { mark, tr } from "../i18n/tr";

const PERIODOS = [
  { id: "0", label: mark("All time") },
  { id: "7", label: mark("7 days") },
  { id: "30", label: mark("30 days") },
  { id: "90", label: mark("90 days") },
];

const TOPO = 10;

const BUSCA_A_PARTIR = 8;

const PASSO: Record<Passo, string> = {
  day: mark("Daily"),
  week: mark("Weekly"),
  month: mark("Monthly"),
};

type Dimensao = "providers" | "models" | "modes";

export function UsageView({
  plugin,
  session,
  filtro: f,
  onFiltro: setF,
  onBack,
  onOpenChat,
}: {
  plugin: CorvusPlugin;
  session: ChatSession;

  filtro: UsageFilter;
  onFiltro: (f: UsageFilter) => void;
  onBack: () => void;

  onOpenChat: () => void;
}) {
  const chats = useChatSummaries(plugin);
  const [salvando, setSalvando] = useState(false);

  const [lista, setLista] = useState<Dimensao>("models");
  const [listaAberta, setListaAberta] = useState(false);
  const [buscaLista, setBuscaLista] = useState("");

  const porProvider = useMemo(() => opcoes(chats, "provider"), [chats]);
  const porModelo = useMemo(() => opcoes(chats, "model"), [chats]);
  const porModo = useMemo(() => opcoes(chats, "mode"), [chats]);

  const recorte = useMemo(() => aplicar(chats, f), [chats, f]);
  const agg = useMemo(() => aggregateFromSummaries(recorte, 0), [recorte]);
  const m = metricaDa(agg.total);
  const modelos = useMemo(() => modelosDaPagina(agg), [agg]);
  const topo = useMemo(() => conversasDoTopo(agg, TOPO), [agg]);
  const media = mediaPorConversa(agg.total);

  const dimensoes: Array<{
    chave: Dimensao;
    titulo: string;

    plural: string;

    busca: string;
    ops: Opcao[];
    nome: (id: string) => string;
    icone: (id: string) => string;
  }> = [
    {
      chave: "providers",
      titulo: tr("Provider"),
      plural: tr("Providers"),
      busca: tr("Search providers"),
      ops: porProvider,
      nome: (id) => PROVIDERS.find((p) => p.id === id)?.name ?? id,
      icone: providerIcon,
    },

    {
      chave: "models",
      titulo: tr("Model"),
      plural: tr("Models"),
      busca: tr("Search models"),
      ops: porModelo,
      nome: prettyModelName,
      icone: modelLogo,
    },
    {
      chave: "modes",
      titulo: tr("Mode"),
      plural: tr("Modes"),
      busca: tr("Search modes"),
      ops: porModo,
      nome: moduleLabel,
      icone: moduleIcon,
    },
  ];
  const visiveis = dimensoes.filter((d) => valeFiltrar(d.ops, f[d.chave]));
  const naLista = dimensoes.find((d) => d.chave === lista) ?? dimensoes[1];

  const aggLista = useMemo(
    () => aggregateFromSummaries(aplicar(chats, semADimensao(f, lista)), 0),
    [chats, f, lista]
  );
  const mLista = metricaDa(aggLista.total);

  const serie = useMemo((): { colunas: Coluna[]; passo: Passo } => {
    const j = janelaDoGrafico(f.days, agg.byDay);
    if (!j) return { colunas: [], passo: "day" };
    const passo = passoDe(diasEntre(j.de, j.ate));
    return { colunas: serieDoTempo(agg.byDay, j.de, j.ate, passo), passo };
  }, [agg, f.days]);
  const achadas = buscarOpcoes(naLista.ops, buscaLista, naLista.nome);
  const relatorio = relatorioDe(
    achadas,
    lista === "providers"
      ? aggLista.byProvider
      : lista === "models"
        ? aggLista.byModel
        : aggLista.byMode,
    aggLista.total
  );

  const escopo = [
    f.days === 0 ? tr("All time") : tr("Last {n} days", { n: f.days }),
    ...dimensoes
      .filter((d) => d.chave !== lista)
      .flatMap((d) => f[d.chave].map(d.nome)),
    contagem(aggLista.total.chats),
    mLista === "cost"
      ? formatUsdRounded(aggLista.total.cost)
      : tr("{n} tokens", {
          n: formatCompact(aggLista.total.tokensIn + aggLista.total.tokensOut),
        }),
  ];

  const verTodos = (d: Dimensao) => {
    setLista(d);
    setBuscaLista("");
    setListaAberta(true);
  };

  const salvarRelatorio = async () => {
    setSalvando(true);
    try {

      const r = await saveUsageMarkdown(
        plugin.app,
        agg,
        f.days,
        plugin.settings.chatsPath
      );
      new Notice(tr("Report saved: {path}", { path: r.path }));
    } catch (err) {
      console.error("[corvus] failed to save report:", err);
      new Notice(
        tr("Could not save the report: {error}", {
          error: err instanceof Error ? err.message : String(err),
        })
      );
    } finally {
      setSalvando(false);
    }
  };

  const abrir = (c: ChatUsageRow) => {
    void session.load(c);
    onOpenChat();
  };

  const vazio = agg.total.chats === 0;

  return (
    <div className="corvus-chat">
      <header className="corvus-topbar is-bare">
        <button
          type="button"
          className="corvus-icon-btn"
          aria-label={tr("Back")}
          onClick={onBack}
        >
          <Icon name="arrow-left" />
        </button>
        <span className="corvus-brand corvus-topbar-brand">{tr("Usage")}</span>
        {}
        <button
          type="button"
          className="corvus-topbar-action corvus-topbar-end"
          aria-label={tr("Save this report as a note")}
          title={tr("Save this report as a note")}
          disabled={salvando || vazio}
          onClick={() => void salvarRelatorio()}
        >
          <Icon name={salvando ? "loader" : "file-down"} size={18} />
          <span>{salvando ? tr("Saving…") : tr("Report")}</span>
        </button>
      </header>

      <div className="corvus-messages corvus-home corvus-usage-page">
        {}
        <LeftToday plugin={plugin} />

        {}
        <Segmented
          options={PERIODOS.map((p) => ({ ...p, label: tr(p.label) }))}
          value={String(f.days)}
          label={tr("Period")}

          onChange={(id) => setF({ ...f, days: Number(id) })}
        />

        {}
        <section className="corvus-usage is-hero" aria-label={tr("Totals")}>
          <span className="corvus-usage-meta">
            <span className="corvus-usage-big">
              {m === "cost"
                ? formatUsdRounded(agg.total.cost)
                : formatCompact(agg.total.tokensIn + agg.total.tokensOut)}
            </span>
            <span className="corvus-usage-unit">
              {m === "cost" ? tr("spent") : tr("tokens")}
            </span>
            {m === "cost" && agg.total.hasUnknownCost && (
              <span
                className="corvus-usage-approx"
                title={tr("Some models have no public price — this is a floor")}
              >
                +
              </span>
            )}
          </span>
          {}
          <span className="corvus-usage-sub">
            {contagem(agg.total.chats)}
            {!vazio && (
              <>
                <span className="corvus-usage-sep">·</span>
                {faixaDeDatas(agg.periodStart, agg.periodEnd)}
              </>
            )}
          </span>
          <div className="corvus-mods">
            {}
            <Modulo
              icone="arrow-up-from-line"
              rotulo={tr("Sent")}
              valor={formatCompact(agg.total.tokensIn)}
              unidade={tr("tokens")}
            />
            <Modulo
              icone="arrow-down-to-line"
              rotulo={tr("Received")}
              valor={formatCompact(agg.total.tokensOut)}
              unidade={tr("tokens")}
            />
            <Modulo
              icone="message-circle"
              rotulo={tr("Per chat")}
              valor={
                media == null
                  ? "—"
                  : m === "cost"
                    ? formatUsdRounded(media)
                    : formatCompact(Math.round(media))
              }
              unidade={m === "cost" ? tr("avg") : tr("tokens")}
            />
          </div>
        </section>

        {}
        {serie.colunas.length > 1 && picoDa(serie.colunas) > 0 ? (
          <GraficoNoTempo colunas={serie.colunas} passo={serie.passo} />
        ) : (

          <GraficoVazio
            motivo={

              chats.length === 0
                ? tr("Your tokens land here as you chat.")
                : agg.total.chats === 0
                  ? tr("Nothing to plot yet.")
                  : picoDa(serie.colunas) === 0
                    ? tr("No tokens recorded in these chats.")
                    : tr("Just one day so far — the shape fills in as you go.")
            }
          />
        )}

        {visiveis.length > 0 && (
          <section className="corvus-home-block corvus-usage-filters">
            <div className="corvus-home-headrow">
              <span className="corvus-section-label">{tr("Filter")}</span>
              {}
              {marcados(f) > 0 && (
                <button
                  type="button"
                  className="corvus-home-filter is-accent"
                  onClick={() => setF({ ...FILTRO_VAZIO, days: f.days })}
                >
                  <Icon name="x" size={16} />
                  <span>{tr("Clear")}</span>
                </button>
              )}
            </div>
            {visiveis.map((d) => (
              <div key={d.chave} className="corvus-usage-dim">
                {}
                <div className="corvus-usage-dim-head">
                  <span className="corvus-usage-dim-label">{d.titulo}</span>
                  {d.ops.length > A_VISTA && (
                    <button
                      type="button"
                      className="corvus-home-filter is-accent"
                      onClick={() => verTodos(d.chave)}
                    >
                      <span>{tr("See all {n}", { n: d.ops.length })}</span>
                      <Icon name="chevron-right" size={16} />
                    </button>
                  )}
                </div>
                <div className="corvus-choices" role="group" aria-label={d.titulo}>
                  {opcoesAVista(d.ops, f[d.chave]).map((o) => {
                    const on = f[d.chave].includes(o.id);
                    const nome = d.nome(o.id);
                    return (
                      <button
                        key={o.id}
                        type="button"
                        className={on ? "corvus-choice is-on" : "corvus-choice"}
                        aria-pressed={on}

                        aria-label={`${nome}, ${contagem(o.count)}`}
                        onClick={() =>
                          setF({ ...f, [d.chave]: alternar(f[d.chave], o.id) })
                        }
                      >
                        <Icon name={d.icone(o.id)} size={16} />
                        <span>{nome}</span>
                        <sup className="corvus-choice-count" aria-hidden="true">
                          {o.count}
                        </sup>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        )}

        {vazio ? (
          <div className="corvus-home-empty">
            <Icon name="chart-no-axes-column" size={42} />
            <p>
              {chats.length === 0
                ? tr("No usage yet. Every chat is counted here as you go.")
                : tr("Nothing in this slice. Try a longer period or fewer filters.")}
            </p>
          </div>
        ) : (
          <>
            {}
            <section className="corvus-home-block">
              <span className="corvus-section-label">{tr("By model")}</span>
              <div className="corvus-usage-list">
                {modelos.map((r) => (
                  <LinhaDeFatia
                    key={r.id}
                    r={r}
                    m={m}
                    nome={prettyModelName(r.id)}
                    icone={modelLogo(r.id)}
                  />
                ))}
              </div>
            </section>

            <section className="corvus-home-block">
              <span className="corvus-section-label">
                {m === "cost" ? tr("Most expensive chats") : tr("Biggest chats")}
              </span>
              <div className="corvus-usage-list">
                {topo.map((c) => (
                  <LinhaDeConversa
                    key={c.id}
                    c={c}
                    m={m}
                    onOpen={() => abrir(c)}
                  />
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      {}
      <Sheet
        title={naLista.plural}
        open={listaAberta}
        onClose={() => setListaAberta(false)}
      >
        {naLista.ops.length > BUSCA_A_PARTIR && (
          <SheetSearch
            value={buscaLista}
            placeholder={naLista.busca}
            found={achadas.length}
            onChange={setBuscaLista}
          />
        )}
        <p className="corvus-usage-report-head">
          {escopo.map((parte, i) => (
            <span key={i}>
              {i > 0 && <span className="corvus-usage-sep">·</span>}
              {parte}
            </span>
          ))}
        </p>
        {achadas.length === 0 ? (
          <SheetNote>{tr("Nothing matches that search.")}</SheetNote>
        ) : (
          <div className="corvus-usage-list">
            {relatorio.usadas.map((r) => (
              <LinhaDeFatia
                key={r.id}
                r={r}
                m={mLista}
                nome={naLista.nome(r.id)}
                icone={naLista.icone(r.id)}
              />
            ))}
            {relatorio.paradas.map((o) => (
              <LinhaParada
                key={o.id}
                nome={naLista.nome(o.id)}
                icone={naLista.icone(o.id)}
              />
            ))}
          </div>
        )}
      </Sheet>
    </div>
  );
}

function contagem(n: number): string {
  return n === 1 ? tr("1 chat") : tr("{n} chats", { n });
}

function GraficoNoTempo({
  colunas,
  passo,
}: {
  colunas: Coluna[];
  passo: Passo;
}) {

  const [escolhida, setEscolhida] = useState<string | null>(null);
  const pico = picoDa(colunas);
  const alta = colunas.reduce((a, b) => (b.total > a.total ? b : a));
  const alvo = colunas.find((c) => c.inicio === escolhida) ?? alta;

  return (
    <section className="corvus-home-block" aria-label={tr("Tokens over time")}>
      <div className="corvus-home-headrow">
        <span className="corvus-section-label">{tr("Over time")}</span>
        <span className="corvus-chart-step">{tr(PASSO[passo])}</span>
      </div>
      <div className="corvus-chart">
        {}
        <div className="corvus-chart-legend">
          <span className="corvus-chart-key">
            <span className="corvus-chart-swatch is-in" aria-hidden="true" />
            {tr("Sent")}
          </span>
          <span className="corvus-chart-key">
            <span className="corvus-chart-swatch is-out" aria-hidden="true" />
            {tr("Received")}
          </span>
          {}
          <span className="corvus-chart-peak">
            {tr("peak {n}", { n: formatCompact(pico) })}
          </span>
        </div>
        <div
          className="corvus-chart-plot"
          role="group"
          aria-label={
            passo === "day"
              ? tr("Tokens per day")
              : passo === "week"
                ? tr("Tokens per week")
                : tr("Tokens per month")
          }
        >
          {colunas.map((c) => (
            <button
              key={c.inicio}
              type="button"
              className={
                c.inicio === alvo.inicio
                  ? "corvus-chart-col is-on"
                  : "corvus-chart-col"
              }
              aria-pressed={c.inicio === alvo.inicio}

              aria-label={tr("{when}: {sent} sent, {received} received", {
                when: c.titulo,
                sent: formatCompact(c.entrada),
                received: formatCompact(c.saida),
              })}
              title={tr("{when} · {sent} sent · {received} received", {
                when: c.titulo,
                sent: formatCompact(c.entrada),
                received: formatCompact(c.saida),
              })}
              onClick={() => setEscolhida(c.inicio)}
            >
              {}
              <span className="corvus-chart-stack">
                <span
                  className="corvus-chart-air"
                  style={{ flexGrow: Math.max(pico - c.total, 0) }}
                />
                {c.saida > 0 && (
                  <span

                    className={
                      c.entrada > 0
                        ? "corvus-chart-bar is-out has-in"
                        : "corvus-chart-bar is-out"
                    }
                    style={{ flexGrow: c.saida }}
                  />
                )}
                {c.entrada > 0 && (
                  <span
                    className="corvus-chart-bar is-in"
                    style={{ flexGrow: c.entrada }}
                  />
                )}
              </span>
            </button>
          ))}
        </div>
        {}
        <div className="corvus-chart-axis">
          <span>{colunas[0].rotulo}</span>
          <span>{colunas[colunas.length - 1].rotulo}</span>
        </div>
        <p className="corvus-chart-readout">
          <span className="corvus-chart-when">{alvo.titulo}</span>
          <span className="corvus-usage-sep">·</span>
          {tr("{n} sent", { n: formatCompact(alvo.entrada) })}
          <span className="corvus-usage-sep">·</span>
          {tr("{n} received", { n: formatCompact(alvo.saida) })}
        </p>
      </div>
    </section>
  );
}

function LinhaDeFatia({
  r,
  m,
  nome,
  icone,
}: {
  r: Fatia;
  m: Metrica;

  nome: string;
  icone: string;
}) {
  const chats = contagem(r.chats);
  const preco =
    r.preco === "gratis" ? tr("Free") : r.preco === "sem-preco" ? "—" : formatUsd(r.cost);
  return (
    <div className="corvus-usage-row">
      <span
        className="corvus-share"
        style={{ "--corvus-pct": r.pct } as CSSProperties}
        aria-hidden="true"
      >
        <span className="corvus-donut" />
        <Icon name={icone} size={16} />
      </span>
      <span className="corvus-usage-row-text">
        <span className="corvus-usage-row-name">{nome}</span>
        <span className="corvus-usage-row-sub">
          {chats}
          <span className="corvus-usage-sep">·</span>
          {m === "cost"
            ? tr("{n} tokens", { n: formatCompact(r.tokens) })
            : r.preco === "sem-preco"
              ? tr("no public price")
              : tr("free")}
        </span>
      </span>
      <span className="corvus-usage-row-end">
        <span
          className="corvus-usage-row-value"
          title={r.preco === "sem-preco" ? tr("No public price") : undefined}
        >
          {m === "cost" ? preco : formatCompact(r.tokens)}
          {r.piso && <span className="corvus-usage-approx">+</span>}
        </span>
        <span className="corvus-usage-row-pct">
          {r.quase ? "<1%" : `${r.pct}%`}
        </span>
      </span>
    </div>
  );
}

const FANTASMA = [22, 34, 26, 42, 30, 47, 26, 38, 30, 44, 25, 35];

function GraficoVazio({ motivo }: { motivo: string }) {
  return (
    <section className="corvus-home-block" aria-label={tr("Tokens over time")}>
      <div className="corvus-home-headrow">
        <span className="corvus-section-label">{tr("Over time")}</span>
      </div>
      <div className="corvus-chart is-empty">
        {}
        <div className="corvus-chart-legend">
          <span className="corvus-chart-key">
            <span className="corvus-chart-swatch is-in" aria-hidden="true" />
            {tr("Sent")}
          </span>
          <span className="corvus-chart-key">
            <span className="corvus-chart-swatch is-out" aria-hidden="true" />
            {tr("Received")}
          </span>
        </div>
        <div className="corvus-chart-plot">
          {FANTASMA.map((h, i) => (
            <span key={i} className="corvus-chart-col" aria-hidden="true">
              <span className="corvus-chart-stack">
                <span className="corvus-chart-air" style={{ flexGrow: 100 - h }} />
                <span className="corvus-chart-bar is-ghost" style={{ flexGrow: h }} />
              </span>
            </span>
          ))}
          <p className="corvus-chart-motivo">{motivo}</p>
        </div>
      </div>
    </section>
  );
}

function LinhaParada({ nome, icone }: { nome: string; icone: string }) {
  return (
    <div className="corvus-usage-row is-idle">
      <span
        className="corvus-share"
        style={{ "--corvus-pct": 0 } as CSSProperties}
        aria-hidden="true"
      >
        <span className="corvus-donut" />
        <Icon name={icone} size={16} />
      </span>
      <span className="corvus-usage-row-text">
        <span className="corvus-usage-row-name">{nome}</span>
        <span className="corvus-usage-row-sub">{tr("No chats in this slice")}</span>
      </span>
      <span className="corvus-usage-row-end">
        <span className="corvus-usage-row-value">—</span>
      </span>
    </div>
  );
}

function LinhaDeConversa({
  c,
  m,
  onOpen,
}: {
  c: ChatUsageRow;
  m: Metrica;
  onOpen: () => void;
}) {
  return (
    <button type="button" className="corvus-usage-row" onClick={onOpen}>
      <span className="corvus-card-mark" aria-hidden="true">
        <Icon name={providerIcon(c.provider)} size={20} />
      </span>
      <span className="corvus-usage-row-text">
        <span className="corvus-usage-row-name">{c.title || tr("Untitled")}</span>
        <span className="corvus-usage-row-sub">
          {prettyModelName(c.model)}
          <span className="corvus-usage-sep">·</span>
          {moduleLabel(c.mode)}
        </span>
      </span>
      <span className="corvus-usage-row-end">
        <span className="corvus-usage-row-value">
          {m === "tokens"
            ? formatCompact(c.tokensIn + c.tokensOut)
            : c.cost === 0
              ? tr("Free")
              : formatUsd(c.cost)}
        </span>
        <span className="corvus-usage-row-pct">{relativeShort(c.date)}</span>
      </span>
    </button>
  );
}

function Modulo({
  icone,
  rotulo,
  valor,
  unidade,
}: {
  icone: string;
  rotulo: string;
  valor: string;
  unidade: string;
}) {
  return (
    <div className="corvus-mod">
      <span className="corvus-mod-title has-icon">
        <Icon name={icone} size={12} />
        <span>{rotulo}</span>
      </span>
      <span className="corvus-mod-row">
        <span className="corvus-mod-value">{valor}</span>
        <span className="corvus-mod-unit">{unidade}</span>
      </span>
    </div>
  );
}
