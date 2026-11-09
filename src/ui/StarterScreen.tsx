import type CorvusPlugin from "../main";
import type { ChatMode, ChatSession } from "../core/session";
import { CHAT_MODES } from "../core/session";
import { MODULES } from "./modules";
import { providerConfigured, PROVIDERS } from "../core/providersMeta";
import { Icon } from "./Icon";
import { Segmented } from "./Segmented";
import { openPluginSettings } from "./modals";
import { tr } from "../i18n/tr";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return tr("Still up");
  if (h < 12) return tr("Good morning");
  if (h < 18) return tr("Good afternoon");
  return tr("Good evening");
}

export function StarterScreen({
  plugin,
  session,
}: {
  plugin: CorvusPlugin;
  session: ChatSession;
}) {
  const cfg = session.config;
  const mode = MODULES[cfg.mode];
  const hasKey = providerConfigured(plugin, cfg.provider);
  const providerName =
    PROVIDERS.find((p) => p.id === cfg.provider)?.name ?? cfg.provider;

  return (
    <div className="corvus-starter">
      {}
      <Segmented
        options={CHAT_MODES.map((m) => ({ id: m, label: tr(MODULES[m].label) }))}
        value={cfg.mode}
        label={tr("Chat mode")}
        onChange={(id) => session.setMode(id as ChatMode)}
      />

      <div className="corvus-starter-hero">
        <Icon name={mode.icon} size={26} className="corvus-starter-mark" />
        <h2 className="corvus-starter-title">{greeting()}.</h2>
        <p className="corvus-starter-sub">{tr(mode.tagline)}</p>
      </div>

      {!hasKey && (
        <div className="corvus-callout">
          <Icon name="key-round" size={16} />
          <span>
            {tr("No API key for {provider} yet — add one to start.", {
              provider: providerName,
            })}
          </span>
          <button type="button" onClick={() => openPluginSettings(plugin)}>
            {tr("Open settings")}
          </button>
        </div>
      )}

    </div>
  );
}
