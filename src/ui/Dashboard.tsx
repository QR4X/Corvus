import { Platform } from "obsidian";
import type CorvusPlugin from "../main";
import type { ChatSession } from "../core/session";
import { CHAT_MODES, isChatMode, type ChatMode } from "../core/session";
import { useChatStore } from "../store/chat";
import { ChatList } from "./ChatList";
import { useChatSummaries, useUnreadChats } from "./chatHooks";
import { Icon } from "./Icon";
import { Segmented } from "./Segmented";
import { UsageCard } from "./UsageCard";
import { alertCount } from "./chatAlert";
import { MODULES, chatsOfModule, defaultSegment } from "./modules";
import type { ChatSummary } from "../core/chatPersistence";
import { tr } from "../i18n/tr";

const RECENT_COUNT = 6;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return tr("Still up");
  if (h < 12) return tr("Good morning");
  if (h < 18) return tr("Good afternoon");
  return tr("Good evening");
}

export function Dashboard({
  plugin,
  session,
  tab,
  onTab,
  onOpenMenu,
  onNewChat,
  onOpenChat,
  onOpenHistory,
  onOpenUsage,
}: {
  plugin: CorvusPlugin;
  session: ChatSession;
  tab: string;
  onTab: (id: string) => void;
  onOpenMenu: () => void;
  onNewChat: (mode: ChatMode) => void;
  onOpenChat: (chat: ChatSummary) => void;
  onOpenHistory: () => void;
  onOpenUsage: () => void;
}) {
  const toggleFullscreen = async () => {
    plugin.settings.mobileFullscreen = !plugin.settings.mobileFullscreen;
    await plugin.saveSettings();
  };

  const chats = useChatSummaries(plugin);
  const unread = useUnreadChats(plugin);
  const waitingId = useChatStore((s) => s.waitingChatId);

  const activeMode: ChatMode = isChatMode(tab)
    ? tab
    : defaultSegment(chats, plugin.settings.defaultMode);
  const visible = chatsOfModule(chats, activeMode);

  return (
    <div className="corvus-chat corvus-dash-view">
      <header className="corvus-topbar is-bare">
        <button
          type="button"
          className="corvus-icon-btn"
          aria-label={tr("Open menu")}
          onClick={onOpenMenu}
        >
          <Icon name="menu" />
        </button>

        <span className="corvus-brand corvus-topbar-brand">CORVUS</span>

        <div className="corvus-topbar-end">
          {Platform.isMobile && (
            <button
              type="button"
              className="corvus-icon-btn"
              aria-label={
                plugin.settings.mobileFullscreen
                  ? tr("Exit fullscreen")
                  : tr("Fullscreen")
              }
              aria-pressed={plugin.settings.mobileFullscreen === true}
              onClick={() => void toggleFullscreen()}
            >
              <Icon
                name={
                  plugin.settings.mobileFullscreen ? "minimize-2" : "maximize-2"
                }
              />
            </button>
          )}
          <button
            type="button"
            className="corvus-icon-btn"
            aria-label={tr("New chat")}
            onClick={() => onNewChat(activeMode)}
          >
            <Icon name="plus" />
          </button>
        </div>
      </header>

      <div className="corvus-messages corvus-home corvus-dash">
        <div className="corvus-dash-hero">
          <h1 className="corvus-dash-greeting">{greeting()}.</h1>
          <p className="corvus-dash-sub">{tr("Choose a capability or continue a conversation.")}</p>
        </div>

        <div className="corvus-dash-cards">
          <button
            type="button"
            className="corvus-dash-card is-chat"
            onClick={() => onNewChat("chat")}
          >
            <div className="corvus-dash-card-icon">
              <Icon name="message-square" size={20} />
            </div>
            <div className="corvus-dash-card-text">
              <span className="corvus-dash-card-title">{tr("Direct Chat")}</span>
              <span className="corvus-dash-card-desc">{tr("Pure reasoning without note search")}</span>
            </div>
            <Icon name="arrow-up-right" size={16} className="corvus-dash-card-arrow" />
          </button>

          <button
            type="button"
            className="corvus-dash-card is-vault"
            onClick={() => onNewChat("vault-qa")}
          >
            <div className="corvus-dash-card-icon">
              <Icon name="library" size={20} />
            </div>
            <div className="corvus-dash-card-text">
              <span className="corvus-dash-card-title">{tr("Vault Q&A")}</span>
              <span className="corvus-dash-card-desc">{tr("Grounded answers from your notes")}</span>
            </div>
            <Icon name="arrow-up-right" size={16} className="corvus-dash-card-arrow" />
          </button>

          <button
            type="button"
            className="corvus-dash-card is-agent"
            onClick={() => onNewChat("agent")}
          >
            <div className="corvus-dash-card-icon">
              <Icon name="bot" size={20} />
            </div>
            <div className="corvus-dash-card-text">
              <span className="corvus-dash-card-title">{tr("Agent")}</span>
              <span className="corvus-dash-card-desc">{tr("Reads, edits and organizes vault")}</span>
            </div>
            <Icon name="arrow-up-right" size={16} className="corvus-dash-card-arrow" />
          </button>
        </div>

        <section className="corvus-dash-recents">
          <div className="corvus-home-headrow">
            <span className="corvus-section-label">
              {tr("Recent Conversations")}
            </span>

            {visible.length > RECENT_COUNT && (
              <button
                type="button"
                className="corvus-home-filter is-accent"
                onClick={() => {
                  onTab(activeMode);
                  onOpenHistory();
                }}
              >
                <span>{tr("See all {n}", { n: visible.length })}</span>
                <Icon name="chevron-right" size={14} />
              </button>
            )}
          </div>

          <Segmented
            options={CHAT_MODES.map((m) => ({
              id: m,
              label: MODULES[m].short,
              dot:
                alertCount(chats, m, {
                  waitingId,
                  unread,
                }) > 0,
            }))}
            value={activeMode}
            label={tr("Chat mode")}
            onChange={onTab}
          />

          {visible.length > 0 ? (
            <ChatList
              plugin={plugin}
              session={session}
              chats={visible.slice(0, RECENT_COUNT)}
              onOpen={onOpenChat}
            />
          ) : (
            <div className="corvus-home-empty">
              <Icon name={MODULES[activeMode].icon} size={32} />
              <p>{tr(MODULES[activeMode].emptyLine)}</p>
            </div>
          )}
        </section>

        <UsageCard plugin={plugin} chats={chats} onOpen={onOpenUsage} />
      </div>
    </div>
  );
}
