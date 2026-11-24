import type CorvusPlugin from "../main";
import type { ChatSession } from "../core/session";
import { MODULES } from "./modules";
import { providerConfigured, PROVIDERS } from "../core/providersMeta";
import { Icon } from "./Icon";
import { openPluginSettings } from "./modals";
import { tr } from "../i18n/tr";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return tr("Still up");
  if (h < 12) return tr("Good morning");
  if (h < 18) return tr("Good afternoon");
  return tr("Good evening");
}

const PROMPT_SUGGESTIONS: Record<string, string[]> = {
  chat: [
    "Brainstorm ideas for my project",
    "Explain this concept concisely",
    "Review and refine my draft",
  ],
  "vault-qa": [
    "What do my notes say about...",
    "Summarize my recent weekly notes",
    "Find connections across topics",
  ],
  agent: [
    "Create a new note with a plan",
    "Audit my vault for broken links",
    "Organize files in my inbox",
  ],
};

export function StarterScreen({
  plugin,
  session,
  onSelectPrompt,
}: {
  plugin: CorvusPlugin;
  session: ChatSession;
  onSelectPrompt?: (text: string) => void;
}) {
  const cfg = session.config;
  const mode = MODULES[cfg.mode];
  const hasKey = providerConfigured(plugin.settings, cfg.provider);
  const providerName =
    PROVIDERS.find((p) => p.id === cfg.provider)?.name ?? cfg.provider;
  const suggestions = PROMPT_SUGGESTIONS[cfg.mode] ?? PROMPT_SUGGESTIONS.chat;

  return (
    <div className="corvus-starter">
      <div className="corvus-starter-hero">
        <div className={`corvus-starter-mark-wrap is-${cfg.mode}`}>
          <Icon name={mode.icon} size={28} className="corvus-starter-mark" />
        </div>
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

      {onSelectPrompt && (
        <div className="corvus-starter-suggestions">
          <span className="corvus-starter-suggestions-label">{tr("Suggested prompts")}</span>
          <div className="corvus-starter-suggestions-grid">
            {suggestions.map((s, idx) => (
              <button
                key={idx}
                type="button"
                className="corvus-starter-suggestion-chip"
                onClick={() => onSelectPrompt(s)}
              >
                <Icon name="sparkles" size={13} />
                <span>{tr(s)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
