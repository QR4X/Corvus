import type CorvusPlugin from "../main";
import type { ChatSummary } from "../core/chatPersistence";
import { formatUsdRounded } from "../usage/pricing";
import { formatCompact } from "../usage/format";
import { aggregateFromSummaries } from "../usage/aggregate";
import { Icon } from "./Icon";
import { providerIcon } from "../core/providersMeta";
import { prettyModelName } from "../providers/modelDescriptions";
import { RagLine } from "./RagLine";
import { monthHeatmap, monthStart, type HeatCell } from "../usage/heatmap";
import {
  activeDays,
  topModels,
  dayStreak,
  periodWork,
  type ModelUsage,
} from "../usage/activity";
import { tr } from "../i18n/tr";

const TOP_MODELS = 3;

export function UsageCard({
  plugin,
  chats,
  onOpen,
}: {
  plugin: CorvusPlugin;
  chats: readonly ChatSummary[];
  onOpen: () => void;
}) {
  const heatmap = monthHeatmap(chats);
  const since = monthStart();
  const monthChats = chats.filter((c) => (c.date ?? "").slice(0, 10) >= since);
  const agg = aggregateFromSummaries(monthChats, 0);

  const models = topModels(chats, since, TOP_MODELS);
  const streak = dayStreak(chats);
  const days = activeDays(heatmap.cells);
  const work = periodWork(chats, since);

  return (
    <section
      className="corvus-usage is-clickable"
      role="button"
      tabIndex={0}
      aria-label={tr("Usage in {month} — open details", { month: heatmap.label })}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="corvus-usage-head">
        <div className="corvus-usage-badge">
          <Icon name="activity" size={14} />
          <span className="corvus-usage-title">{tr("Usage & Activity")}</span>
        </div>
        <span className="corvus-usage-month">{heatmap.label}</span>
      </div>

      <div className="corvus-usage-line">
        <div className="corvus-usage-meta">
          <span className="corvus-usage-big">{formatCompact(heatmap.total)}</span>
          <span className="corvus-usage-unit">{tr("tokens")}</span>
          <span className="corvus-usage-sep">·</span>
          <span>{agg.total.chats === 1 ? tr("1 chat") : tr("{n} chats", { n: agg.total.chats })}</span>
        </div>
        <div className="corvus-usage-cost">
          <span className="corvus-usage-cost-val">
            {formatUsdRounded(agg.total.cost)}
            {agg.total.hasUnknownCost && (
              <span
                className="corvus-usage-approx"
                title={tr("Some models have no public price — this is a floor")}
              >
                +
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Heatmap showing which days had activity */}
      <div className="corvus-usage-top-heatmap">
        <HeatCalendar cells={heatmap.cells} peak={heatmap.peak} />
      </div>

      {/* Mid section: models and statistics */}
      <div className="corvus-usage-mid">
        {models.length > 0 && (
          <div className="corvus-models">
            {models.map((m) => (
              <TopModelRow key={m.model} m={m} />
            ))}
          </div>
        )}

        <div className="corvus-mods">
          <Stat
            icon="flame"
            label={tr("Streak")}
            value={streak > 0 ? String(streak) : "—"}
            unit={streak === 1 ? tr("day") : tr("days")}
          />
          <Stat
            icon="calendar"
            label={tr("Active")}
            value={String(days.active)}
            unit={tr("of {n}d", { n: days.total })}
          />
          {work.actions > 0 ? (
            <Stat
              icon="list-checks"
              label={tr("Actions")}
              value={formatCompact(work.actions)}
              unit={tr("in vault")}
            />
          ) : (
            <Stat
              icon="send"
              label={tr("Messages")}
              value={formatCompact(work.messages)}
              unit={tr("sent")}
            />
          )}
        </div>
      </div>

      <div
        className="corvus-usage-foot"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <RagLine plugin={plugin} />
        <div className="corvus-usage-more" onClick={onOpen}>
          <span>{tr("Details")}</span>
          <Icon name="chevron-right" size={13} />
        </div>
      </div>
    </section>
  );
}

function HeatCalendar({ cells, peak }: { cells: HeatCell[]; peak: number }) {
  return (
    <div
      className="corvus-heat"
      role="img"
      aria-label={tr("Daily usage this month, busiest day {n} tokens", { n: formatCompact(peak) })}
    >
      {cells.map((c, i) => (
        <span
          key={i}
          className={
            c.day
              ? `corvus-heat-cell is-${c.level}`
              : c.future
                ? "corvus-heat-cell is-future"
                : "corvus-heat-cell is-void"
          }
          title={
            c.day ? tr("{day} · {n} tokens", { day: c.day, n: formatCompact(c.tokens) }) : undefined
          }
        />
      ))}
    </div>
  );
}

function TopModelRow({ m }: { m: ModelUsage }) {
  return (
    <div className="corvus-model-row" title={tr("{n} tokens", { n: formatCompact(m.tokens) })}>
      <Icon name={providerIcon(m.provider)} size={14} />
      <span className="corvus-model-name">{prettyModelName(m.model)}</span>
      <span className="corvus-model-bar" aria-hidden="true">
        <span className="corvus-model-bar-fill" style={{ width: `${m.pct}%` }} />
      </span>
      <span className="corvus-model-pct">{m.pct}%</span>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  unit,
}: {
  icon: string;
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="corvus-mod">
      <span className="corvus-mod-title has-icon">
        <Icon name={icon} size={12} />
        <span>{label}</span>
      </span>
      <span className="corvus-mod-row">
        <span className="corvus-mod-value">{value}</span>
        <span className="corvus-mod-unit">{unit}</span>
      </span>
    </div>
  );
}
