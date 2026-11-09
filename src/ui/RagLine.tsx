import { useEffect, useState } from "react";
import type CorvusPlugin from "../main";
import { formatCompact } from "../usage/format";
import { Icon } from "./Icon";
import { openPluginSettings } from "./modals";
import { tr } from "../i18n/tr";

export function RagLine({ plugin }: { plugin: CorvusPlugin }) {

  const [, redesenhar] = useState(0);
  useEffect(
    () => plugin.onSettingsChange(() => redesenhar((n) => n + 1)),
    [plugin]
  );

  const idx = plugin.vectorIndex;
  const trechos = idx?.size ?? 0;
  const notas = idx?.fileCount ?? 0;
  const pronto = trechos > 0;
  const rodando = plugin.indexing !== null;

  return (
    <div className={pronto ? "corvus-rag-line is-on" : "corvus-rag-line"}>
      <button
        type="button"
        className="corvus-rag-open"
        aria-label={tr("Index settings")}
        onClick={() => openPluginSettings(plugin)}
      >
        {}
        <Icon name="database" size={14} />
        <span className="corvus-rag-text">
          {pronto ? (
            <>
              <strong>{tr("Local index")}</strong> ·{" "}
              {notas === 1 ? tr("1 note") : tr("{n} notes", { n: formatCompact(notas) })} ·{" "}
              {trechos === 1 ? tr("1 chunk") : tr("{n} chunks", { n: formatCompact(trechos) })} ·{" "}
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
        className={rodando ? "corvus-rag-refresh is-running" : "corvus-rag-refresh"}
        aria-label={rodando ? tr("Cancel indexing") : tr("Update index")}
        title={rodando ? tr("Cancel indexing") : tr("Update index with new notes")}
        onClick={() => void plugin.runVaultIndex()}
      >
        <Icon name={rodando ? "square" : "refresh-cw"} size={14} />
      </button>
    </div>
  );
}
