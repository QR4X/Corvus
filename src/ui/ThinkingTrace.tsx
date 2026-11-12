import { memo, useEffect, useRef, useState } from "react";
import type { App } from "obsidian";
import { Icon } from "./Icon";
import { tr } from "../i18n/tr";
import { sharedTicker } from "./ticker";
import {
  currentStepLabel,
  elapsedLabel,
  summaryLabel,
  type TraceGroup,
  type TraceItem,
  type TraceTool,
} from "./trace";
import { desfaziveis, desfazerRodada } from "./agentUndo";

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    return sharedTicker.subscribe(setNow);
  }, [active]);
  return now;
}

function ThoughtSegment({ text, live }: { text: string; live: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (live && el) el.scrollTop = el.scrollHeight;
  }, [text, live]);
  return (
    <div
      ref={ref}
      className={live ? "corvus-trace-thought is-live" : "corvus-trace-thought"}
    >
      {text}
    </div>
  );
}

function StatusMark({ tool }: { tool: TraceTool }) {
  if (tool.status === "pending") {
    return <span className="corvus-trace-spinner" aria-hidden="true" />;
  }
  return (
    <Icon
      name={tool.status === "failed" ? "x" : "check"}
      size={12}
      className="corvus-trace-mark"
    />
  );
}

function ToolRow({ tool }: { tool: TraceTool }) {
  const [open, setOpen] = useState(false);
  const expandable = Boolean(tool.args || tool.output);
  return (
    <div
      className={
        "corvus-trace-tool is-" + tool.status + (tool.undone ? " is-undone" : "")
      }
    >
      <button
        type="button"
        className="corvus-trace-row"
        aria-expanded={expandable ? open : undefined}
        disabled={!expandable}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name={tool.icon} size={13} className="corvus-trace-icon" />
        <span className="corvus-trace-label">{tool.label}</span>
        <StatusMark tool={tool} />
      </button>
      {tool.result && (
        <div className="corvus-trace-result">
          <span aria-hidden="true">⎿</span> {tool.result}
        </div>
      )}
      {open && (
        <div className="corvus-trace-detail">
          {tool.args && Object.keys(tool.args).length > 0 && (
            <pre className="corvus-trace-pre">
              {JSON.stringify(tool.args, null, 2)}
            </pre>
          )}
          {tool.output && <pre className="corvus-trace-pre">{tool.output}</pre>}
        </div>
      )}
    </div>
  );
}

function TraceBody({ items, live }: { items: TraceItem[]; live: boolean }) {
  return (
    <div className="corvus-trace-body">
      {items.map((item) =>
        item.kind === "thought" ? (
          <ThoughtSegment key={item.id} text={item.text} live={live} />
        ) : (
          <ToolRow key={item.id} tool={item} />
        )
      )}
    </div>
  );
}

function UndoChip({ app, items }: { app: App; items: TraceItem[] }) {
  const [busy, setBusy] = useState(false);
  const ids = desfaziveis(
    items.map((i) =>
      i.kind === "tool" && i.undoId
        ? {
            phase: "done" as const,
            iconPending: "",
            pendingText: "",
            undoId: i.undoId,
            undone: i.undone,
          }
        : undefined
    )
  );
  if (ids.length === 0) return null;
  return (
    <button
      type="button"
      className="corvus-trace-undo"
      disabled={busy}
      aria-label={
        ids.length === 1
          ? tr("Undo the agent's change")
          : tr("Undo the agent's {n} changes", { n: ids.length })
      }
      onClick={() => {
        setBusy(true);
        void desfazerRodada(app, ids).finally(() => setBusy(false));
      }}
    >
      <Icon name="undo-2" size={13} />
      <span>{tr("Undo")}</span>
    </button>
  );
}

export const ThinkingTrace = memo(function ThinkingTrace({
  group,
  live,
  stopped = false,
  app,
}: {
  group: TraceGroup | null;
  live: boolean;
  stopped?: boolean;
  app: App;
}) {
  const items = group?.items ?? [];
  const mountedAt = useRef(Date.now());
  const [manual, setManual] = useState<boolean | null>(null);
  const open = manual ?? live;
  const [everOpen, setEverOpen] = useState(open);
  useEffect(() => {
    if (open) setEverOpen(true);
  }, [open]);
  const now = useNow(live);
  const lastLive = useRef<number | null>(null);

  if (items.length === 0 && !live) return null;

  const startedAt = group?.startedAt ?? mountedAt.current;
  if (live) lastLive.current = Math.max(0, now - startedAt);
  const elapsed = live
    ? lastLive.current
    : group?.endedAt != null && group.startedAt !== null
      ? Math.max(0, group.endedAt - group.startedAt)
      : lastLive.current;

  const toggle = () => setManual(!open);
  const step = live ? currentStepLabel(items) : "";

  return (
    <div className={"corvus-trace" + (live ? " is-live" : "") + (open ? " is-open" : "")}>
      <div className="corvus-trace-head">
        <button
          type="button"
          className="corvus-trace-toggle"
          aria-expanded={open}
          onClick={toggle}
        >
          {live ? (
            <>
              <span className="corvus-trace-dot" aria-hidden="true" />
              <span className="corvus-trace-shimmer">{tr("Thinking…")}</span>
              <span className="corvus-trace-time">{elapsedLabel(elapsed ?? 0)}</span>
              {step && <span className="corvus-trace-step">{step}</span>}
            </>
          ) : (
            <span className="corvus-trace-summary">{summaryLabel(items, elapsed, stopped)}</span>
          )}
          <Icon name="chevron-right" size={14} className="corvus-trace-chevron" />
        </button>
        {!live && <UndoChip app={app} items={items} />}
      </div>
      <div className="corvus-trace-collapse">
        <div className="corvus-trace-inner">
          {everOpen && <TraceBody items={items} live={live} />}
        </div>
      </div>
    </div>
  );
});
