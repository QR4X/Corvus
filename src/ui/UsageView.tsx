import { useMemo, useState, type CSSProperties } from "react";
import { Notice } from "obsidian";
import type CorvusPlugin from "../main";
import type { ChatSession } from "../core/session";
import { useChatSummaries } from "./chatHooks";
import { providerIcon } from "../core/providersMeta";
import { Icon } from "./Icon";
import { Segmented } from "./Segmented";
import { aggregateFromSummaries, type ChatUsageRow } from "../usage/aggregate";
import { formatUsd, formatUsdRounded } from "../usage/pricing";
import { formatCompact } from "../usage/format";
import { saveUsageMarkdown } from "../usage/export";
import {
  EMPTY_FILTER,
  toggleValue,
  applyFilter,
  filterOptions,
  type FilterOption,
  type UsageFilter,
} from "../usage/filters";
import {
  VISIBLE_OPTIONS,
  searchOptions,
  topChats,
  dateRange,
  selectedCount,
  averagePerChat,
  metricOf,
  pageModels,
  visibleOptions,
  sliceReport,
  withoutDimension,
  worthFiltering,
  type Slice,
  type Metric,
} from "../usage/page";
import {
  chartWindow,
  stepFor,
  peakOf,
  timeSeries,
  daysBetween,
  type Column,
  type ChartStep,
} from "../usage/timeline";
import { Sheet, SheetNote, SheetSearch } from "./Sheet";
import { moduleIcon, moduleLabel, relativeShort } from "./modules";
import { PROVIDERS } from "../core/providersMeta";
import { prettyModelName } from "../providers/modelDescriptions";
import { modelLogo } from "../providers/modelLogo";
import { LeftToday } from "./LeftToday";
import { mark, tr } from "../i18n/tr";

const PERIOD_OPTIONS = [
  { id: "0", label: mark("All time") },
  { id: "7", label: mark("7 days") },
  { id: "30", label: mark("30 days") },
  { id: "90", label: mark("90 days") },
];

const TOP_CHATS = 10;

const SEARCH_THRESHOLD = 8;

const STEP_LABELS: Record<ChartStep, string> = {
  day: mark("Daily"),
  week: mark("Weekly"),
  month: mark("Monthly"),
};

type Dimension = "providers" | "models" | "modes";

export function UsageView({
  plugin,
  session,
  filter: f,
  onFilter: setF,
  onBack,
  onOpenChat,
}: {
  plugin: CorvusPlugin;
  session: ChatSession;

  filter: UsageFilter;
  onFilter: (f: UsageFilter) => void;
  onBack: () => void;

  onOpenChat: () => void;
}) {
  const chats = useChatSummaries(plugin);
  const [saving, setSaving] = useState(false);

  const [listDim, setListDim] = useState<Dimension>("models");
  const [listOpen, setListOpen] = useState(false);
  const [listQuery, setListQuery] = useState("");

  const providerOptions = useMemo(() => filterOptions(chats, "provider"), [chats]);
  const modelOptions = useMemo(() => filterOptions(chats, "model"), [chats]);
  const modeOptions = useMemo(() => filterOptions(chats, "mode"), [chats]);

  const filtered = useMemo(() => applyFilter(chats, f), [chats, f]);
  const agg = useMemo(() => aggregateFromSummaries(filtered, 0), [filtered]);
  const m = metricOf(agg.total);
  const models = useMemo(() => pageModels(agg), [agg]);
  const top = useMemo(() => topChats(agg, TOP_CHATS), [agg]);
  const average = averagePerChat(agg.total);

  const dimensions: Array<{
    key: Dimension;
    title: string;

    plural: string;

    searchLabel: string;
    ops: FilterOption[];
    nameOf: (id: string) => string;
    iconOf: (id: string) => string;
  }> = [
    {
      key: "providers",
      title: tr("Provider"),
      plural: tr("Providers"),
      searchLabel: tr("Search providers"),
      ops: providerOptions,
      nameOf: (id) => PROVIDERS.find((p) => p.id === id)?.name ?? id,
      iconOf: providerIcon,
    },

    {
      key: "models",
      title: tr("Model"),
      plural: tr("Models"),
      searchLabel: tr("Search models"),
      ops: modelOptions,
      nameOf: prettyModelName,
      iconOf: modelLogo,
    },
    {
      key: "modes",
      title: tr("Mode"),
      plural: tr("Modes"),
      searchLabel: tr("Search modes"),
      ops: modeOptions,
      nameOf: moduleLabel,
      iconOf: moduleIcon,
    },
  ];
  const visibleDims = dimensions.filter((d) => worthFiltering(d.ops, f[d.key]));
  const listed = dimensions.find((d) => d.key === listDim) ?? dimensions[1];

  const listAgg = useMemo(
    () => aggregateFromSummaries(applyFilter(chats, withoutDimension(f, listDim)), 0),
    [chats, f, listDim]
  );
  const listMetric = metricOf(listAgg.total);

  const series = useMemo((): { columns: Column[]; step: ChartStep } => {
    const j = chartWindow(f.days, agg.byDay);
    if (!j) return { columns: [], step: "day" };
    const step = stepFor(daysBetween(j.from, j.to));
    return { columns: timeSeries(agg.byDay, j.from, j.to, step), step };
  }, [agg, f.days]);
  const matches = searchOptions(listed.ops, listQuery, listed.nameOf);
  const report = sliceReport(
    matches,
    listDim === "providers"
      ? listAgg.byProvider
      : listDim === "models"
        ? listAgg.byModel
        : listAgg.byMode,
    listAgg.total
  );

  const scope = [
    f.days === 0 ? tr("All time") : tr("Last {n} days", { n: f.days }),
    ...dimensions
      .filter((d) => d.key !== listDim)
      .flatMap((d) => f[d.key].map(d.nameOf)),
    chatCount(listAgg.total.chats),
    listMetric === "cost"
      ? formatUsdRounded(listAgg.total.cost)
      : tr("{n} tokens", {
          n: formatCompact(listAgg.total.tokensIn + listAgg.total.tokensOut),
        }),
  ];

  const showAll = (d: Dimension) => {
    setListDim(d);
    setListQuery("");
    setListOpen(true);
  };

  const saveReport = async () => {
    setSaving(true);
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
      setSaving(false);
    }
  };

  const openChat = (c: ChatUsageRow) => {
    void session.load(c);
    onOpenChat();
  };

  const isEmpty = agg.total.chats === 0;

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
          disabled={saving || isEmpty}
          onClick={() => void saveReport()}
        >
          <Icon name={saving ? "loader" : "file-down"} size={18} />
          <span>{saving ? tr("Saving…") : tr("Report")}</span>
        </button>
      </header>

      <div className="corvus-messages corvus-home corvus-usage-page">
        {}
        <LeftToday plugin={plugin} />

        {}
        <Segmented
          options={PERIOD_OPTIONS.map((p) => ({ ...p, label: tr(p.label) }))}
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
            {chatCount(agg.total.chats)}
            {!isEmpty && (
              <>
                <span className="corvus-usage-sep">·</span>
                {dateRange(agg.periodStart, agg.periodEnd)}
              </>
            )}
          </span>
          <div className="corvus-mods">
            {}
            <Stat
              icon="arrow-up-from-line"
              label={tr("Sent")}
              value={formatCompact(agg.total.tokensIn)}
              unit={tr("tokens")}
            />
            <Stat
              icon="arrow-down-to-line"
              label={tr("Received")}
              value={formatCompact(agg.total.tokensOut)}
              unit={tr("tokens")}
            />
            <Stat
              icon="message-circle"
              label={tr("Per chat")}
              value={
                average == null
                  ? "—"
                  : m === "cost"
                    ? formatUsdRounded(average)
                    : formatCompact(Math.round(average))
              }
              unit={m === "cost" ? tr("avg") : tr("tokens")}
            />
          </div>
        </section>

        {}
        {series.columns.length > 1 && peakOf(series.columns) > 0 ? (
          <TimeChart columns={series.columns} step={series.step} />
        ) : (

          <EmptyChart
            reason={

              chats.length === 0
                ? tr("Your tokens land here as you chat.")
                : agg.total.chats === 0
                  ? tr("Nothing to plot yet.")
                  : peakOf(series.columns) === 0
                    ? tr("No tokens recorded in these chats.")
                    : tr("Just one day so far — the shape fills in as you go.")
            }
          />
        )}

        {visibleDims.length > 0 && (
          <section className="corvus-home-block corvus-usage-filters">
            <div className="corvus-home-headrow">
              <span className="corvus-section-label">{tr("Filter")}</span>
              {}
              {selectedCount(f) > 0 && (
                <button
                  type="button"
                  className="corvus-home-filter is-accent"
                  onClick={() => setF({ ...EMPTY_FILTER, days: f.days })}
                >
                  <Icon name="x" size={16} />
                  <span>{tr("Clear")}</span>
                </button>
              )}
            </div>
            {visibleDims.map((d) => (
              <div key={d.key} className="corvus-usage-dim">
                {}
                <div className="corvus-usage-dim-head">
                  <span className="corvus-usage-dim-label">{d.title}</span>
                  {d.ops.length > VISIBLE_OPTIONS && (
                    <button
                      type="button"
                      className="corvus-home-filter is-accent"
                      onClick={() => showAll(d.key)}
                    >
                      <span>{tr("See all {n}", { n: d.ops.length })}</span>
                      <Icon name="chevron-right" size={16} />
                    </button>
                  )}
                </div>
                <div className="corvus-choices" role="group" aria-label={d.title}>
                  {visibleOptions(d.ops, f[d.key]).map((o) => {
                    const on = f[d.key].includes(o.id);
                    const name = d.nameOf(o.id);
                    return (
                      <button
                        key={o.id}
                        type="button"
                        className={on ? "corvus-choice is-on" : "corvus-choice"}
                        aria-pressed={on}

                        aria-label={`${name}, ${chatCount(o.count)}`}
                        onClick={() =>
                          setF({ ...f, [d.key]: toggleValue(f[d.key], o.id) })
                        }
                      >
                        <Icon name={d.iconOf(o.id)} size={16} />
                        <span>{name}</span>
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

        {isEmpty ? (
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
                {models.map((r) => (
                  <SliceRow
                    key={r.id}
                    r={r}
                    m={m}
                    name={prettyModelName(r.id)}
                    icon={modelLogo(r.id)}
                  />
                ))}
              </div>
            </section>

            <section className="corvus-home-block">
              <span className="corvus-section-label">
                {m === "cost" ? tr("Most expensive chats") : tr("Biggest chats")}
              </span>
              <div className="corvus-usage-list">
                {top.map((c) => (
                  <ChatRow
                    key={c.id}
                    c={c}
                    m={m}
                    onOpen={() => openChat(c)}
                  />
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      {}
      <Sheet
        title={listed.plural}
        open={listOpen}
        onClose={() => setListOpen(false)}
      >
        {listed.ops.length > SEARCH_THRESHOLD && (
          <SheetSearch
            value={listQuery}
            placeholder={listed.searchLabel}
            found={matches.length}
            onChange={setListQuery}
          />
        )}
        <p className="corvus-usage-report-head">
          {scope.map((part, i) => (
            <span key={i}>
              {i > 0 && <span className="corvus-usage-sep">·</span>}
              {part}
            </span>
          ))}
        </p>
        {matches.length === 0 ? (
          <SheetNote>{tr("Nothing matches that search.")}</SheetNote>
        ) : (
          <div className="corvus-usage-list">
            {report.used.map((r) => (
              <SliceRow
                key={r.id}
                r={r}
                m={listMetric}
                name={listed.nameOf(r.id)}
                icon={listed.iconOf(r.id)}
              />
            ))}
            {report.idle.map((o) => (
              <IdleRow
                key={o.id}
                name={listed.nameOf(o.id)}
                icon={listed.iconOf(o.id)}
              />
            ))}
          </div>
        )}
      </Sheet>
    </div>
  );
}

function chatCount(n: number): string {
  return n === 1 ? tr("1 chat") : tr("{n} chats", { n });
}

function TimeChart({
  columns,
  step,
}: {
  columns: Column[];
  step: ChartStep;
}) {

  const [selected, setSelected] = useState<string | null>(null);
  const peak = peakOf(columns);
  const highest = columns.reduce((a, b) => (b.total > a.total ? b : a));
  const target = columns.find((c) => c.start === selected) ?? highest;

  return (
    <section className="corvus-home-block" aria-label={tr("Tokens over time")}>
      <div className="corvus-home-headrow">
        <span className="corvus-section-label">{tr("Over time")}</span>
        <span className="corvus-chart-step">{tr(STEP_LABELS[step])}</span>
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
            {tr("peak {n}", { n: formatCompact(peak) })}
          </span>
        </div>
        <div
          className="corvus-chart-plot"
          role="group"
          aria-label={
            step === "day"
              ? tr("Tokens per day")
              : step === "week"
                ? tr("Tokens per week")
                : tr("Tokens per month")
          }
        >
          {columns.map((c) => (
            <button
              key={c.start}
              type="button"
              className={
                c.start === target.start
                  ? "corvus-chart-col is-on"
                  : "corvus-chart-col"
              }
              aria-pressed={c.start === target.start}

              aria-label={tr("{when}: {sent} sent, {received} received", {
                when: c.title,
                sent: formatCompact(c.tokensIn),
                received: formatCompact(c.tokensOut),
              })}
              title={tr("{when} · {sent} sent · {received} received", {
                when: c.title,
                sent: formatCompact(c.tokensIn),
                received: formatCompact(c.tokensOut),
              })}
              onClick={() => setSelected(c.start)}
            >
              {}
              <span className="corvus-chart-stack">
                <span
                  className="corvus-chart-air"
                  style={{ flexGrow: Math.max(peak - c.total, 0) }}
                />
                {c.tokensOut > 0 && (
                  <span

                    className={
                      c.tokensIn > 0
                        ? "corvus-chart-bar is-out has-in"
                        : "corvus-chart-bar is-out"
                    }
                    style={{ flexGrow: c.tokensOut }}
                  />
                )}
                {c.tokensIn > 0 && (
                  <span
                    className="corvus-chart-bar is-in"
                    style={{ flexGrow: c.tokensIn }}
                  />
                )}
              </span>
            </button>
          ))}
        </div>
        {}
        <div className="corvus-chart-axis">
          <span>{columns[0].label}</span>
          <span>{columns[columns.length - 1].label}</span>
        </div>
        <p className="corvus-chart-readout">
          <span className="corvus-chart-when">{target.title}</span>
          <span className="corvus-usage-sep">·</span>
          {tr("{n} sent", { n: formatCompact(target.tokensIn) })}
          <span className="corvus-usage-sep">·</span>
          {tr("{n} received", { n: formatCompact(target.tokensOut) })}
        </p>
      </div>
    </section>
  );
}

function SliceRow({
  r,
  m,
  name,
  icon,
}: {
  r: Slice;
  m: Metric;

  name: string;
  icon: string;
}) {
  const chats = chatCount(r.chats);
  const price =
    r.price === "free" ? tr("Free") : r.price === "unpriced" ? "—" : formatUsd(r.cost);
  return (
    <div className="corvus-usage-row">
      <span
        className="corvus-share"
        style={{ "--corvus-pct": r.pct } as CSSProperties}
        aria-hidden="true"
      >
        <span className="corvus-donut" />
        <Icon name={icon} size={16} />
      </span>
      <span className="corvus-usage-row-text">
        <span className="corvus-usage-row-name">{name}</span>
        <span className="corvus-usage-row-sub">
          {chats}
          <span className="corvus-usage-sep">·</span>
          {m === "cost"
            ? tr("{n} tokens", { n: formatCompact(r.tokens) })
            : r.price === "unpriced"
              ? tr("no public price")
              : tr("free")}
        </span>
      </span>
      <span className="corvus-usage-row-end">
        <span
          className="corvus-usage-row-value"
          title={r.price === "unpriced" ? tr("No public price") : undefined}
        >
          {m === "cost" ? price : formatCompact(r.tokens)}
          {r.isFloor && <span className="corvus-usage-approx">+</span>}
        </span>
        <span className="corvus-usage-row-pct">
          {r.nearZero ? "<1%" : `${r.pct}%`}
        </span>
      </span>
    </div>
  );
}

const GHOST_BARS = [22, 34, 26, 42, 30, 47, 26, 38, 30, 44, 25, 35];

function EmptyChart({ reason }: { reason: string }) {
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
          {GHOST_BARS.map((h, i) => (
            <span key={i} className="corvus-chart-col" aria-hidden="true">
              <span className="corvus-chart-stack">
                <span className="corvus-chart-air" style={{ flexGrow: 100 - h }} />
                <span className="corvus-chart-bar is-ghost" style={{ flexGrow: h }} />
              </span>
            </span>
          ))}
          <p className="corvus-chart-reason">{reason}</p>
        </div>
      </div>
    </section>
  );
}

function IdleRow({ name, icon }: { name: string; icon: string }) {
  return (
    <div className="corvus-usage-row is-idle">
      <span
        className="corvus-share"
        style={{ "--corvus-pct": 0 } as CSSProperties}
        aria-hidden="true"
      >
        <span className="corvus-donut" />
        <Icon name={icon} size={16} />
      </span>
      <span className="corvus-usage-row-text">
        <span className="corvus-usage-row-name">{name}</span>
        <span className="corvus-usage-row-sub">{tr("No chats in this slice")}</span>
      </span>
      <span className="corvus-usage-row-end">
        <span className="corvus-usage-row-value">—</span>
      </span>
    </div>
  );
}

function ChatRow({
  c,
  m,
  onOpen,
}: {
  c: ChatUsageRow;
  m: Metric;
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
