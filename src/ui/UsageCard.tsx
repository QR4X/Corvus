import type { CSSProperties } from "react";
import type CorvusPlugin from "../main";
import type { ChatSummary } from "../core/chatPersistence";
import { formatUsdRounded } from "../usage/pricing";
import { formatCompact } from "../usage/format";
import { aggregateFromSummaries } from "../usage/aggregate";
import { Icon } from "./Icon";
import { providerIcon } from "./ChatList";
import { prettyModelName } from "../providers/modelDescriptions";
import { RagLine } from "./RagLine";
import { heatmapDoMes, inicioDoMes, type Celula } from "./heatmap";
import {
  diasAtivos,
  modelosMaisUsados,
  sequenciaDeDias,
  trabalhoDoPeriodo,
  type ModeloUsado,
} from "./homeModules";
import { tr } from "../i18n/tr";

const MODELOS = 3;

export function UsageCard({
  plugin,
  chats,
  onOpen,
}: {
  plugin: CorvusPlugin;
  chats: readonly ChatSummary[];

  onOpen: () => void;
}) {
  const mapa = heatmapDoMes(chats);

  const desde = inicioDoMes();
  const doMes = chats.filter((c) => (c.date ?? "").slice(0, 10) >= desde);
  const agg = aggregateFromSummaries(doMes, 0);

  const modelos = modelosMaisUsados(chats, desde, MODELOS);

  const sequencia = sequenciaDeDias(chats);
  const ativos = diasAtivos(mapa.celulas);
  const trabalho = trabalhoDoPeriodo(chats, desde);

  return (

    <section
      className="corvus-usage is-clickable"
      role="button"
      tabIndex={0}
      aria-label={tr("Usage in {month} — open details", { month: mapa.rotulo })}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="corvus-usage-line">
        <span className="corvus-usage-meta">
          <span className="corvus-usage-big">{formatCompact(mapa.total)}</span>
          <span className="corvus-usage-unit">{tr("tokens")}</span>
          <span className="corvus-usage-sep">·</span>
          {agg.total.chats === 1 ? tr("1 chat") : tr("{n} chats", { n: agg.total.chats })}
          {agg.total.cost > 0 && (
            <>
              <span className="corvus-usage-sep">·</span>
              {formatUsdRounded(agg.total.cost)}
              {agg.total.hasUnknownCost && (
                <span
                  className="corvus-usage-approx"
                  title={tr("Some models have no public price — this is a floor")}
                >
                  +
                </span>
              )}
            </>
          )}
        </span>
        {}
        <span className="corvus-usage-month">{mapa.rotulo}</span>
      </div>

      {}
      <div className="corvus-usage-mid">
        <Calendario celulas={mapa.celulas} pico={mapa.pico} />
        {modelos.length > 0 && (
          <div className="corvus-models">
            {modelos.map((m) => (
              <LinhaDeModelo key={m.model} m={m} />
            ))}
          </div>
        )}
      </div>

      <div className="corvus-mods">
        {}
        <Modulo
          rotulo={tr("Streak")}
          valor={sequencia > 0 ? String(sequencia) : "—"}
          unidade={sequencia === 1 ? tr("day") : tr("days")}
        />
        {}
        <Modulo
          rotulo={tr("Active")}
          valor={String(ativos.ativos)}
          unidade={tr("of {n}", { n: ativos.total })}
        />
        {}
        {trabalho.acoes > 0 ? (
          <Modulo
            rotulo={tr("Actions")}
            valor={formatCompact(trabalho.acoes)}
            unidade={tr("in vault")}
          />
        ) : (
          <Modulo
            rotulo={tr("Messages")}
            valor={formatCompact(trabalho.mensagens)}
            unidade={tr("sent")}
          />
        )}
      </div>

      {}
      <div
        className="corvus-usage-foot"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <RagLine plugin={plugin} />
      </div>
    </section>
  );
}

function Calendario({ celulas, pico }: { celulas: Celula[]; pico: number }) {
  return (
    <div
      className="corvus-heat"
      role="img"
      aria-label={tr("Daily usage this month, busiest day {n} tokens", { n: formatCompact(pico) })}
    >
      {celulas.map((c, i) => (
        <span
          key={i}
          className={
            c.dia
              ? `corvus-heat-cell is-${c.nivel}`
              : c.futuro
                ? "corvus-heat-cell is-future"
                : "corvus-heat-cell is-void"
          }

          title={
            c.dia ? tr("{day} · {n} tokens", { day: c.dia, n: formatCompact(c.tokens) }) : undefined
          }
        />
      ))}
    </div>
  );
}

function LinhaDeModelo({ m }: { m: ModeloUsado }) {
  return (
    <div className="corvus-model-row" title={tr("{n} tokens", { n: formatCompact(m.tokens) })}>
      <span
        className="corvus-donut"
        style={{ "--corvus-pct": m.pct } as CSSProperties}
        aria-hidden="true"
      />
      <Icon name={providerIcon(m.provider)} size={14} />
      {}
      <span className="corvus-model-name">{prettyModelName(m.model)}</span>
      <span className="corvus-model-pct">{m.pct}%</span>
    </div>
  );
}

function Modulo({
  rotulo,
  valor,
  unidade,
}: {
  rotulo: string;
  valor: string;
  unidade: string;
}) {
  return (
    <div className="corvus-mod">
      <span className="corvus-mod-title">{rotulo}</span>
      <span className="corvus-mod-row">
        <span className="corvus-mod-value">{valor}</span>
        <span className="corvus-mod-unit">{unidade}</span>
      </span>
    </div>
  );
}
