import type CorvusPlugin from "../main";
import type { ChatSummary } from "../core/chatPersistence";
import { formatCompact } from "../usage/format";
import { Icon } from "./Icon";
import { RagLine } from "./RagLine";
import { monthHeatmap, monthStart } from "../usage/heatmap";
import { dayStreak, periodWork } from "../usage/activity";
import { tr } from "../i18n/tr";

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
  const streak = dayStreak(chats);
  const work = periodWork(chats, since);

  return (
    <section
      className="corvus-usage is-clickable"
      role="button"
      tabIndex={0}
      aria-label={tr("Activity in {month} — open details", { month: heatmap.label })}
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
          <Icon name="sparkles" size={14} />
          <span className="corvus-usage-title">{tr("Activity")}</span>
        </div>
        <span className="corvus-usage-month">{heatmap.label}</span>
      </div>

      <div className="corvus-usage-metrics">
        <div className="corvus-usage-metric">
          <span className="corvus-usage-val">{formatCompact(heatmap.total)}</span>
          <span className="corvus-usage-lbl">{tr("tokens")}</span>
        </div>
        <div className="corvus-usage-divider" aria-hidden="true" />
        <div className="corvus-usage-metric">
          <span className="corvus-usage-val">{streak > 0 ? `${streak}d` : "0d"}</span>
          <span className="corvus-usage-lbl">{tr("streak")}</span>
        </div>
        <div className="corvus-usage-divider" aria-hidden="true" />
        <div className="corvus-usage-metric">
          <span className="corvus-usage-val">{formatCompact(work.messages)}</span>
          <span className="corvus-usage-lbl">{tr("messages")}</span>
        </div>
      </div>

      <div
        className="corvus-usage-foot"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <RagLine plugin={plugin} />
        <div className="corvus-usage-more">
          <span>{tr("Details")}</span>
          <Icon name="chevron-right" size={13} />
        </div>
      </div>
    </section>
  );
}
