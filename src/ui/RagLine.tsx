import { useEffect, useState } from "react";
import type CorvusPlugin from "../main";
import { formatCompact } from "../usage/format";
import { Icon } from "./Icon";
import { openPluginSettings } from "./modals";
import { tr } from "../i18n/tr";

export function RagLine({ plugin }: { plugin: CorvusPlugin }) {

  const [, rerender] = useState(0);
  useEffect(
    () => plugin.onSettingsChange(() => rerender((n) => n + 1)),
    [plugin]
  );

  const idx = plugin.rag.index;
  const chunks = idx?.size ?? 0;
  const notes = idx?.fileCount ?? 0;
  const ready = chunks > 0;
  const running = plugin.rag.indexing !== null;

  return (
    <div className={ready ? "corvus-rag-line is-on" : "corvus-rag-line"}>
      <button
        type="button"
        className="corvus-rag-open"
        aria-label={tr("Index settings")}
        onClick={() => openPluginSettings(plugin)}
      >
        {}
        <Icon name="database" size={14} />
        <span className="corvus-rag-text">
          {ready ? (
            <>
              <strong>{tr("Local index")}</strong> ·{" "}
              {notes === 1 ? tr("1 note") : tr("{n} notes", { n: formatCompact(notes) })} ·{" "}
              {chunks === 1 ? tr("1 chunk") : tr("{n} chunks", { n: formatCompact(chunks) })} ·{" "}
              {tr("searched on this device")}
            </>
          ) : (
            <>
              {}
              <strong>{tr("Local index")}</strong> ·{" "}
              {tr("not built yet — notes are found by keyword until you build it")}
            </>
          )}
        </span>
      </button>

      {}
      <button
        type="button"
        className={running ? "corvus-rag-refresh is-running" : "corvus-rag-refresh"}
        aria-label={running ? tr("Cancel indexing") : tr("Update index")}
        title={running ? tr("Cancel indexing") : tr("Update index with new notes")}
        onClick={() => void plugin.rag.run()}
      >
        <Icon name={running ? "square" : "refresh-cw"} size={14} />
      </button>
    </div>
  );
}
