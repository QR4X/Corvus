import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { App } from "obsidian";
import type CorvusPlugin from "../main";
import { getProvider } from "../providers";
import type { KeyStatus } from "../providers/base";
import { prettyModelName } from "../providers/modelDescriptions";
import { formatCompact } from "../usage/format";
import {
  SPEND_LIMIT_KEY,
  shortDuration,
  remainingFraction,
  gaugeLevel,
  remainingToday,
  type TodayCard,
  type Gauge,
} from "../usage/remainingToday";
import { usd } from "../usage/dailySpend";
import { providerIcon } from "../core/providersMeta";
import { Icon } from "./Icon";
import { uiLocale, tr } from "../i18n/tr";
import { providerCredential } from "../core/providersMeta";

const OPEN_CARDS_KEY = "corvus-left-today-open";

function readOpenCards(app: App): Set<string> {
  try {
    const v: unknown = app.loadLocalStorage(OPEN_CARDS_KEY);
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function writeOpenCards(app: App, openIds: Set<string>): void {
  try {
    app.saveLocalStorage(OPEN_CARDS_KEY, openIds.size ? Array.from(openIds) : null);
  } catch { void 0; }
}

function formatAmount(n: number, unit: Gauge["unit"]): string {
  if (unit === "usd") return usd(n);
  return unit === "tokens" ? formatCompact(n) : Math.round(n).toLocaleString(uiLocale());
}

function amountWithUnit(n: number, unit: Gauge["unit"]): string {
  if (unit === "tokens") return tr("{n} tokens", { n: formatAmount(n, unit) });
  if (unit === "usd") return formatAmount(n, unit);
  return n === 1 ? tr("1 request") : tr("{n} requests", { n: formatAmount(n, unit) });
}

function leftLabel(n: number, unit: Gauge["unit"]): string {
  return n === 1 && unit !== "usd" ? tr("1 left") : tr("{n} left", { n: formatAmount(n, unit) });
}

function usedOfLimit(used: number, limit: number, unit: Gauge["unit"]): string {
  const u = formatAmount(used, unit);
  if (unit === "usd") return tr("{used} of {limit} spent", { used: u, limit: formatAmount(limit, unit) });
  if (unit === "tokens") {
    return tr("{used} of {limit} tokens used", { used: u, limit: formatAmount(limit, unit) });
  }
  return limit === 1
    ? tr("{used} of 1 request used", { used: u })
    : tr("{used} of {limit} requests used", { used: u, limit: formatAmount(limit, unit) });
}

function formatDollars(n: number): string {
  if (n === 0) return "$0.00";
  if (n > 0 && n < 0.01) return "<$0.01";
  return `$${n.toFixed(2)}`;
}

function creditResetLabel(resets: string): string {
  if (resets === "daily") return tr("resets daily");
  if (resets === "weekly") return tr("resets weekly");
  if (resets === "monthly") return tr("resets monthly");
  return tr("resets {when}", { when: resets });
}

function gaugeName(m: Gauge): string {
  return m.model ? prettyModelName(m.model) : m.label;
}

export function LeftToday({ plugin }: { plugin: CorvusPlugin }) {
  const s = plugin.settings;

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const [openCards, setOpenCards] = useState(() => readOpenCards(plugin.app));
  const toggle = (provider: string) => {
    const next = new Set(openCards);
    if (next.has(provider)) next.delete(provider);
    else next.add(provider);
    setOpenCards(next);
    writeOpenCards(plugin.app, next);
  };

  const openRouterKey = providerCredential(plugin.settings, "openrouter").trim();
  const [keyStatus, setKeyStatus] = useState<KeyStatus | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const fetchKeyStatus = useCallback(async () => {
    if (!openRouterKey) return;
    setLoading(true);
    try {
      setKeyStatus((await getProvider("openrouter").keyStatus?.(openRouterKey)) ?? null);
      setNow(new Date());
    } finally {
      setLoading(false);
    }
  }, [openRouterKey]);
  useEffect(() => {
    void fetchKeyStatus();
  }, [fetchKeyStatus]);

  const saveLimit = (key: string, n: number | null) => {
    if (key === SPEND_LIMIT_KEY) {
      s.dailySpendLimit = n ?? 0;
      void plugin.saveSettings();
      return;
    }
    const limits = (s.dailyLimits ??= {});
    if (n == null) delete limits[key];
    else limits[key] = n;
    void plugin.saveSettings();
  };

  const cards = remainingToday({
    ledger: s.dailyUsage ?? {},
    now,
    hasKey: (id) => !!providerCredential(plugin.settings, id).trim(),
    openai: { dataSharing: s.openaiDataSharing === true, tier: s.openaiTier ?? 1 },
    limits: s.dailyLimits ?? {},
    openRouterQuota: s.freeQuota?.openrouter,
    openRouterKeyStatus: keyStatus,
    spendLimit: s.dailySpendLimit ?? 0,
    blockAtLimit: s.blockAtLimit === true,
  });
  if (cards.length === 0) return null;

  return (
    <section className="corvus-home-block corvus-left" aria-label={tr("Left today")}>
      <div className="corvus-home-headrow">
        <span className="corvus-section-label">{tr("Left today")}</span>
      </div>
      <div className="corvus-usage-list">
        {cards.map((c) => (
          <TodayCardItem
            key={c.provider}
            c={c}
            isOpen={openCards.has(c.provider)}
            onToggle={() => toggle(c.provider)}
            onSaveLimit={saveLimit}
            refresh={
              c.provider === "openrouter" && openRouterKey
                ? { loading, run: () => void fetchKeyStatus() }
                : undefined
            }
          />
        ))}
      </div>
    </section>
  );
}

function TodayCardItem({
  c,
  isOpen,
  onToggle,
  onSaveLimit,
  refresh,
}: {
  c: TodayCard;
  isOpen: boolean;
  onToggle: () => void;
  onSaveLimit: (key: string, n: number | null) => void;

  refresh?: { loading: boolean; run: () => void };
}) {
  const bodyId = `corvus-left-${c.provider}`;

  const withBar = c.gauges.filter((m) => remainingFraction(m) != null);
  return (
    <div className={isOpen ? "corvus-left-prov is-open" : "corvus-left-prov"}>
      <button
        type="button"
        className="corvus-left-head"
        aria-expanded={isOpen}
        aria-controls={bodyId}
        onClick={onToggle}
      >
        <span className="corvus-card-mark" aria-hidden="true">
          <Icon name={c.provider === "spend" ? "wallet" : providerIcon(c.provider)} size={20} />
        </span>
        <span className="corvus-left-name">{c.name}</span>
        {isOpen && (c.resetsIn != null || c.noReset) && (
          <span
            className="corvus-left-reset"
            title={c.resetsAt ? tr("Resets at {when}", { when: c.resetsAt }) : undefined}
          >
            {c.resetsIn != null ? tr("resets in {time}", { time: shortDuration(c.resetsIn) }) : c.noReset}
          </span>
        )}
        <span className="corvus-left-chev" aria-hidden="true">
          <Icon name="chevron-down" />
        </span>
      </button>

      {isOpen ? (
        <div className="corvus-left-body" id={bodyId}>
          {c.empty && <p className="corvus-left-note">{c.empty}</p>}
          {c.gauges.map((m) => (
            <GaugeRow
              key={m.id}
              m={m}
              help={c.link}
              refresh={m.id === "openrouter-free" ? refresh : undefined}
              onSaveLimit={onSaveLimit}
            />
          ))}
          {c.credit && <CreditRow credit={c.credit} />}
          {c.note && (
            <p className="corvus-left-note">
              {c.note}
              {c.link && (
                <>
                  {" "}
                  <a
                    className="corvus-left-link"
                    href={c.link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {c.link.label}
                  </a>
                </>
              )}
            </p>
          )}
        </div>
      ) : (
        withBar.length > 0 && (

          <div className="corvus-left-bars" id={bodyId} onClick={onToggle}>
            {withBar.map((m) => (
              <GaugeBar key={m.id} m={m} />
            ))}
          </div>
        )
      )}
    </div>
  );
}

function GaugeBar({ m }: { m: Gauge }) {
  const f = remainingFraction(m);
  if (f == null || m.limit == null || m.remaining == null) return null;
  const n = gaugeLevel(m);
  const label =
    m.remaining === 1 && m.unit !== "usd"
      ? tr("{name}: 1 of {limit} left", { name: gaugeName(m), limit: formatAmount(m.limit, m.unit) })
      : tr("{name}: {left} of {limit} left", {
          name: gaugeName(m),
          left: formatAmount(m.remaining, m.unit),
          limit: formatAmount(m.limit, m.unit),
        });
  return (
    <span
      className={n ? `corvus-left-bar is-${n}` : "corvus-left-bar"}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={m.limit}
      aria-valuenow={m.remaining}
      aria-label={label}
      title={label}
    >
      <span className="corvus-left-fill" style={{ "--corvus-left": f } as CSSProperties} />
    </span>
  );
}

function GaugeRow({
  m,
  help,
  refresh,
  onSaveLimit,
}: {
  m: Gauge;

  help?: { label: string; url: string };

  refresh?: { loading: boolean; run: () => void };
  onSaveLimit: (key: string, n: number | null) => void;
}) {
  const name = gaugeName(m);
  const n = gaugeLevel(m);
  const isMoney = m.unit === "usd";
  const value =
    m.remaining != null
      ? leftLabel(m.remaining, m.unit)
      : isMoney
        ? tr("{n} spent", { n: formatAmount(m.used, m.unit) })
        : amountWithUnit(m.used, m.unit);
  const usage =
    m.limit != null
      ? usedOfLimit(m.used, m.limit, m.unit)
      : m.limitKey
        ? tr("No daily limit set")
        : null;
  const footer = [usage, m.note].filter(Boolean).join(" · ");
  return (
    <div className={n ? `corvus-left-row is-${n}` : "corvus-left-row"}>
      <span className="corvus-left-row-name">{name}</span>
      <span className="corvus-left-row-value">{value}</span>
      <GaugeBar m={m} />
      {footer && <span className="corvus-left-row-sub">{footer}</span>}
      {m.limitKey ? (
        <LimitEditor
          current={m.limit}
          name={name}
          help={help}
          isMoney={isMoney}
          onSave={(v) => onSaveLimit(m.limitKey!, v)}
        />
      ) : (
        refresh && (
          <button
            type="button"
            className="corvus-home-filter is-accent corvus-left-action"
            aria-label={tr("Ask OpenRouter again")}
            disabled={refresh.loading}
            onClick={refresh.run}
          >
            <Icon name={refresh.loading ? "loader" : "refresh-cw"} size={14} />
            <span>{refresh.loading ? tr("Asking…") : tr("Refresh")}</span>
          </button>
        )
      )}
    </div>
  );
}

function LimitEditor({
  current,
  name,
  help,
  isMoney: isMoney = false,
  onSave,
}: {
  current?: number;
  name: string;
  help?: { label: string; url: string };

  isMoney?: boolean;
  onSave: (n: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [txt, setTxt] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);
  if (!editing) {
    return (
      <button
        type="button"
        className="corvus-home-filter is-accent corvus-left-action"
        aria-label={
          isMoney
            ? current
              ? tr("Edit the daily spending limit")
              : tr("Set the daily spending limit")
            : current
              ? tr("Edit the daily limit for {name}", { name })
              : tr("Set the daily limit for {name}", { name })
        }
        onClick={() => {
          setTxt(current ? String(current) : "");
          setEditing(true);
        }}
      >
        <span>{current ? tr("Edit") : tr("Set limit")}</span>
      </button>
    );
  }

  const save = () => {
    const raw = (inputRef.current?.value ?? txt).trim().replace(",", ".");
    const v = Number(raw);
    const valid = raw && Number.isFinite(v) && v > 0;
    onSave(valid ? (isMoney ? Math.round(v * 100) / 100 : Math.floor(v)) : null);
    setEditing(false);
  };
  return (
    <>
      <span className="corvus-left-action corvus-left-edit">
        <input
          type="number"
          inputMode="numeric"
          min={isMoney ? 0 : 1}
          step={isMoney ? 0.5 : 1}
          className="corvus-left-input"
          value={txt}
          placeholder={isMoney ? tr("$ a day") : tr("Per day")}
          aria-label={
            isMoney ? tr("Daily spending limit in dollars") : tr("Requests per day for {name}", { name })
          }
          ref={inputRef}
          onChange={(e) => setTxt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <button
          type="button"
          className="corvus-icon-btn"
          aria-label={tr("Save limit")}
          onClick={save}
        >
          <Icon name="check" />
        </button>
      </span>
      {help && (
        <span className="corvus-left-row-hint">
          {tr("Requests per day.")}{" "}
          <a
            className="corvus-left-link"
            href={help.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {help.label}
          </a>
        </span>
      )}
    </>
  );
}

function CreditRow({
  credit,
}: {
  credit: NonNullable<TodayCard["credit"]>;
}) {
  const capped = credit.remaining != null;
  const footer = capped
    ? [
        credit.spentToday != null
          ? tr("{amount} spent today", { amount: formatDollars(credit.spentToday) })
          : null,
        credit.resets ? creditResetLabel(credit.resets) : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : tr("No spending cap on this key");
  return (
    <div className="corvus-left-row">
      <span className="corvus-left-row-name">
        {capped ? tr("Key credit") : tr("Spent today")}
      </span>
      <span className="corvus-left-row-value">
        {capped
          ? tr("{n} left", { n: formatDollars(credit.remaining ?? 0) })
          : formatDollars(credit.spentToday ?? 0)}
      </span>
      {footer && <span className="corvus-left-row-sub">{footer}</span>}
    </div>
  );
}
