import { Platform } from "obsidian";
import type CorvusPlugin from "../main";
import type { ChatSession } from "../core/session";
import { CHAT_MODES, isChatMode, type ChatMode } from "../core/session";
import { useChatStore } from "../store/chat";
import { ChatList, useChatSummaries, useUnreadChats } from "./ChatList";
import { Icon } from "./Icon";
import { Segmented } from "./Segmented";
import { UsageCard } from "./UsageCard";
import { alertCount } from "./chatAlert";
import { MODULES, chatsOfModule, defaultSegment } from "./modules";
import type { ChatSummary } from "../core/chatPersistence";
import { tr } from "../i18n/tr";

const RECENTES = 4;

export function Dashboard({
  plugin,
  session,
  aba,
  onAba,
  onOpenMenu,
  onNewChat,
  onOpenChat,
  onOpenHistory,
  onOpenUsage,
}: {
  plugin: CorvusPlugin;
  session: ChatSession;

  aba: string;
  onAba: (id: string) => void;
  onOpenMenu: () => void;

  onNewChat: (mode: ChatMode) => void;
  onOpenChat: (chat: ChatSummary) => void;
  onOpenHistory: () => void;
  onOpenUsage: () => void;
}) {

  const alternarTelaCheia = async () => {
    plugin.settings.mobileFullscreen = !plugin.settings.mobileFullscreen;
    await plugin.saveSettings();
  };

  const chats = useChatSummaries(plugin);
  const naoLidas = useUnreadChats(plugin);
  const esperandoId = useChatStore((s) => s.waitingChatId);

  const atual: ChatMode = isChatMode(aba)
    ? aba
    : defaultSegment(chats, plugin.settings.defaultMode);
  const visiveis = chatsOfModule(chats, atual);

  return (
    <div className="corvus-chat">
      <header className="corvus-topbar is-bare">
        <button
          type="button"
          className="corvus-icon-btn"
          aria-label={tr("Open menu")}
          onClick={onOpenMenu}
        >
          <Icon name="menu" />
        </button>
        {}
        <span className="corvus-brand corvus-topbar-brand">CORVUS</span>

        {}
        {Platform.isMobile && (
          <button
            type="button"
            className="corvus-icon-btn corvus-topbar-end"
            aria-label={
              plugin.settings.mobileFullscreen
                ? tr("Exit fullscreen")
                : tr("Fullscreen")
            }
            aria-pressed={plugin.settings.mobileFullscreen === true}
            onClick={() => void alternarTelaCheia()}
          >
            <Icon
              name={
                plugin.settings.mobileFullscreen ? "minimize-2" : "maximize-2"
              }
            />
          </button>
        )}
      </header>

      <div className="corvus-messages corvus-home corvus-dash">
        {}
        <UsageCard plugin={plugin} chats={chats} onOpen={onOpenUsage} />

        {}
        <Segmented
          options={CHAT_MODES.map((m) => ({
            id: m,
            label: MODULES[m].short,

            dot:
              alertCount(chats, m, {
                esperando: esperandoId,
                naoLidas,
              }) > 0,
          }))}
          value={atual}
          label={tr("Chat mode")}
          onChange={onAba}
        />

        {visiveis.length > 0 && (
          <>
            <div className="corvus-home-headrow">
              <span className="corvus-section-label">
                {tr("Pick up where you left")}
              </span>
              {}
              {visiveis.length > RECENTES && (
                <button
                  type="button"

                  className="corvus-home-filter is-accent"

                  onClick={() => {
                    onAba(atual);
                    onOpenHistory();
                  }}
                >
                  <span>{tr("See all {n}", { n: visiveis.length })}</span>
                  <Icon name="chevron-right" size={16} />
                </button>
              )}
            </div>
            <ChatList
              plugin={plugin}
              session={session}
              chats={visiveis.slice(0, RECENTES)}
              onOpen={onOpenChat}
            />
          </>
        )}

        {visiveis.length === 0 && (
          <div className="corvus-home-empty">
            <Icon name={MODULES[atual].icon} size={42} />
            <p>{tr(MODULES[atual].emptyLine)}</p>
          </div>
        )}

        {}
        <section className="corvus-start">
          {}
          {visiveis.length > 0 && (
            <span className="corvus-or">
              <span>{tr("or")}</span>
            </span>
          )}
          <span className="corvus-section-label">{tr("Start something new")}</span>
          <div className="corvus-start-grid">
            {CHAT_MODES.map((m) => (
              <button
                key={m}
                type="button"
                className="corvus-start-card"
                onClick={() => onNewChat(m)}
              >
                <Icon name={MODULES[m].icon} size={20} />
                <span className="corvus-start-name">{MODULES[m].short}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
