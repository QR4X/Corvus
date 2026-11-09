// src/ui/UsageCard.tsx
// O cartão de uso no topo da home, no espírito do painel que o app do Claude
// mostra ao abrir uma sessão nova: quanto já rodou, COMO tem rodado, e com o
// quê.
//
// Ele existe pela mesma razão do resto do painel — responder antes de
// perguntar. Gasto e volume são as únicas coisas do app que correm sozinhas
// enquanto você usa; até aqui só dava pra saber delas indo atrás de um
// relatório.
//
// Tudo aqui é o MÊS VIGENTE e sai do que o app já grava por conversa. Nenhum
// número depende de você configurar coisa nenhuma: uma barra de progresso
// precisaria de um limite, e o limite teria que ser inventado — cobrança por
// token não tem teto. Barra assim mede a régua, não o uso.
//
// Cada pedaço responde uma pergunta que os outros não respondem:
//   • o TOTAL responde "quanto?";
//   • o CALENDÁRIO responde "como tem sido?" — se é todo dia um pouco, se
//     sumiu uma semana, se o mês inteiro coube em duas madrugadas;
//   • os MODELOS respondem "com o quê?", e em que proporção;
//   • os MÓDULOS põem número no que o calendário só insinua: sequência, dias
//     ativos e o trabalho que o agente fez no vault.

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

/** Quantos modelos cabem na lista sem ela virar um relatório. */
const MODELOS = 3;

export function UsageCard({
  plugin,
  chats,
  onOpen,
}: {
  plugin: CorvusPlugin;
  chats: readonly ChatSummary[];
  /** Abre a página de uso — o cartão inteiro é a porta dela. */
  onOpen: () => void;
}) {
  const mapa = heatmapDoMes(chats);
  // UM corte pra tudo: número que discorda do desenho logo acima dele é a
  // maneira mais rápida de o cartão perder a credibilidade.
  const desde = inicioDoMes();
  const doMes = chats.filter((c) => (c.date ?? "").slice(0, 10) >= desde);
  const agg = aggregateFromSummaries(doMes, 0);

  const modelos = modelosMaisUsados(chats, desde, MODELOS);
  // A sequência é a única que olha ALÉM do mês: hábito não recomeça no dia 1
  // só porque o desenho recomeça.
  const sequencia = sequenciaDeDias(chats);
  const ativos = diasAtivos(mapa.celulas);
  const trabalho = trabalhoDoPeriodo(chats, desde);

  // O cartão NÃO sai de cena num mês vazio (0.9.17). Até aqui ele sumia
  // quando o mês não tinha conversa — e o mês sem conversa mais comum é o que
  // acabou de virar: no dia 1º de manhã o cartão desaparecia da home, e o que
  // se lia era "quebrou", não "mês novo". Zerado, ele diz isso com todas as
  // letras: o nome do mês, o calendário em branco esperando, e a sequência,
  // que olha além do mês e não zera com ele.
  return (
    // O cartão INTEIRO abre a página: ele já é um resumo, e todo resumo
    // convida a mesma pergunta ("e daí?"). Um botãozinho "ver mais" num canto
    // seria um alvo pequeno pra uma intenção grande.
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
        {/* O mês dá nome ao que está sendo contado. Sem ele o cartão parece
            falar do começo dos tempos. */}
        <span className="corvus-usage-month">{mapa.rotulo}</span>
      </div>

      {/* Calendário e modelos LADO A LADO: o mês é um quadrado estreito, e a
          largura que sobrava dele não servia pra mais nada. */}
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
        {/* A sequência primeiro: é a única que muda de valor por você abrir o
            app hoje, e a única que se PERDE. */}
        <Modulo
          rotulo={tr("Streak")}
          valor={sequencia > 0 ? String(sequencia) : "—"}
          unidade={sequencia === 1 ? tr("day") : tr("days")}
        />
        {/* "Active days" quebrava em duas linhas num quadro estreito e
            esticava a fileira: o rótulo é uma palavra só, e quem diz que são
            dias é o vizinho da esquerda. */}
        <Modulo
          rotulo={tr("Active")}
          valor={String(ativos.ativos)}
          unidade={tr("of {n}", { n: ativos.total })}
        />
        {/* Ações é o número mais Corvus de todos: é o equivalente daqui às
            linhas de código do painel do Claude Code. Token mede consumo;
            ação mede TRABALHO feito no vault. Sem nenhuma — quem nunca usou o
            Agent —, o lugar vai pras mensagens em vez de exibir um zero. */}
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

      {/* O índice entra COMO RODAPÉ do cartão, e não como uma linha solta
          embaixo dele. Os dois falam da mesma coisa por dois lados: o cartão
          conta o que SAIU daqui pros modelos, o índice conta o que FICA aqui.
          Separados, o de baixo parecia legenda do de cima.

          A propagação para nesta faixa: ela tem os toques dela (o texto abre
          as settings do índice, o ↻ reindexa), e herdar o "abrir o uso" do
          cartão faria dois destinos no mesmo lugar. */}
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

/** O calendário do mês: colunas são dias da semana, linhas são semanas. */
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
          // O título é o que dá o número exato de um dia sem gastar linha:
          // no desktop sai no hover, no celular é inofensivo.
          title={
            c.dia ? tr("{day} · {n} tokens", { day: c.dia, n: formatCompact(c.tokens) }) : undefined
          }
        />
      ))}
    </div>
  );
}

/**
 * Uma linha de modelo: o anel com a fatia, o logo do provider e o nome.
 *
 * O anel é um `conic-gradient` com um furo de máscara, não um SVG: é uma
 * declaração de CSS no lugar de uma árvore de elementos, e o furo precisa ser
 * máscara pra valer sobre QUALQUER fundo — um círculo interno pintado teria
 * que adivinhar a cor do cartão, que é translúcida.
 */
function LinhaDeModelo({ m }: { m: ModeloUsado }) {
  return (
    <div className="corvus-model-row" title={tr("{n} tokens", { n: formatCompact(m.tokens) })}>
      <span
        className="corvus-donut"
        style={{ "--corvus-pct": m.pct } as CSSProperties}
        aria-hidden="true"
      />
      <Icon name={providerIcon(m.provider)} size={14} />
      {/* O nome do APP, como no seletor e na página de uso: o id da API
          ("claude-sonnet-4-6") é o jeito do provider chamar, não o nosso. */}
      <span className="corvus-model-name">{prettyModelName(m.model)}</span>
      <span className="corvus-model-pct">{m.pct}%</span>
    </div>
  );
}

/**
 * Um módulo: rótulo miúdo em cima, o número embaixo, e a unidade ao lado dele.
 *
 * O número é o que se lê de relance; a unidade existe pra ele não virar um
 * inteiro solto sem significado ("38" do quê?).
 */
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
