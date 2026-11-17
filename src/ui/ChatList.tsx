import { Notice } from "obsidian";
import type CorvusPlugin from "../main";
import type { ChatSession } from "../core/session";
import type { ChatSummary } from "../core/chatPersistence";
import { loadChat, setChatStarred } from "../core/chatPersistence";
import { exportChatToVault } from "../core/chatExport";
import { usePanel } from "./panel";
import { projectColor } from "../projects";
import { useChatStore } from "../store/chat";
import { providerIcon } from "../core/providersMeta";
import { useUnreadChats } from "./chatHooks";
import { Icon } from "./Icon";
import { openActions } from "./menu";
import { PromptModal, ConfirmModal } from "./modals";
import { relativeShort } from "./modules";
import { ALERT_LABEL, chatAlert } from "./chatAlert";
import { tr } from "../i18n/tr";

function actionStatus(c: ChatSummary): { text: string; active: boolean } | null {
  if (c.mode !== "agent") return null;
  if (c.toolCount > 0) {
    return {
      text:
        c.toolCount === 1
          ? tr("1 action")
          : tr("{n} actions", { n: c.toolCount }),
      active: true,
    };
  }
  return { text: tr("No actions"), active: false };
}

const MAX_PROJECTS = 5;

export function ChatList({
  plugin,
  session,
  chats,
  onOpen,
}: {
  plugin: CorvusPlugin;
  session: ChatSession;
  chats: ChatSummary[];

  onOpen?: (chat: ChatSummary) => void;
}) {
  const currentChatId = useChatStore((s) => s.currentChatId);

  const isLoading = useChatStore((s) => s.isLoading);
  const turnChatId = useChatStore((s) => s.turnChatId);
  const waitingId = useChatStore((s) => s.waitingChatId);
  const unread = useUnreadChats(plugin);
  const panel = usePanel();

  const recentProjects = [...(plugin.settings.projects ?? [])]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_PROJECTS);

  const open = (c: ChatSummary) => {
    void session.load(c);
    onOpen?.(c);
  };

  const rename = async (c: ChatSummary) => {
    const title = await new PromptModal(plugin.app, {
      title: tr("Rename chat"),
      label: tr("Title"),
      initial: c.title,
      submitLabel: tr("Rename"),
    }).openAndWait();
    if (title && title !== c.title) await session.rename(c, title);
  };

  const toggleStar = async (c: ChatSummary) => {
    try {
      await setChatStarred(
        plugin.app,
        plugin.settings.chatsPath,
        c.mode,
        c.id,
        !c.starred
      );
      await plugin.chats.load(true);
    } catch (err) {
      new Notice(
        tr("Could not star: {error}", {
          error: err instanceof Error ? err.message : String(err),
        })
      );
    }
  };

  const markUnread = (c: ChatSummary) => {
    plugin.chats.markUnread(c.id);
    new Notice(tr("Marked as unread."));
  };

  const exportChat = async (c: ChatSummary) => {
    try {
      const chat = await loadChat(
        plugin.app,
        plugin.settings.chatsPath,
        c.mode,
        c.id
      );
      const path = await exportChatToVault(plugin.app, chat);
      new Notice(tr("Exported to {path}", { path }));
    } catch (err) {
      new Notice(
        tr("Export failed: {error}", {
          error: err instanceof Error ? err.message : String(err),
        })
      );
    }
  };

  const addToProject = async (c: ChatSummary, projectId: string) => {
    await session.updateProjects((prev) =>
      prev.map((p) =>
        p.id === projectId && !p.chatIds.includes(c.id)
          ? { ...p, chatIds: [c.id, ...p.chatIds] }
          : p
      )
    );
    const name = (plugin.settings.projects ?? []).find(
      (p) => p.id === projectId
    )?.name;
    new Notice(
      name === undefined
        ? tr("Added to project.")
        : tr("Added to {name}.", { name })
    );
  };

  const deleteChat = async (c: ChatSummary) => {
    const ok = await new ConfirmModal(plugin.app, {
      title: tr("Delete \"{title}\"?", { title: c.title || tr("Untitled") }),
      body: tr("The chat file goes to the system trash (recoverable)."),
      confirmLabel: tr("Delete"),
      danger: true,
    }).openAndWait();
    if (ok) await session.delete(c);
  };

  return (
    <div className="corvus-history">
      {chats.map((c) => {
        const st = actionStatus(c);
        const alertKind = chatAlert({
          waiting: waitingId === c.id,
          running: isLoading && turnChatId === c.id,
          unread: unread.has(c.id),
        });
        return (
          <div
            key={c.id}
            className={[
              "corvus-history-row",

              c.mode === "chat" ? "is-flat" : "",

              c.mode === "agent" && c.preview ? "has-preview" : "",
              c.id === currentChatId ? "is-current" : "",
              alertKind ? `has-alert is-${alertKind}` : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <button
              type="button"
              className="corvus-history-open"
              onClick={() => open(c)}
            >
              <span className="corvus-card-top">
                {}
                <span className="corvus-card-mark" aria-hidden="true">
                  <Icon name={providerIcon(c.provider)} size={20} />
                </span>

                <span className="corvus-card-text">
                  <span className="corvus-history-title">
                    {c.title || tr("Untitled")}
                  </span>
                  <span className="corvus-history-meta">
                    {}
                    {alertKind && (
                      <span className={`corvus-card-live is-${alertKind}`}>
                        <span className="corvus-card-pulse" aria-hidden="true" />
                        {tr(ALERT_LABEL[alertKind])}
                      </span>
                    )}
                    {alertKind && <span className="corvus-card-dot">·</span>}
                    {st && (
                      <span
                        className={
                          st.active ? "corvus-card-state is-on" : "corvus-card-state"
                        }
                      >
                        {st.text}
                      </span>
                    )}
                    {st && c.model && <span className="corvus-card-dot">·</span>}
                    {c.model && <span>{c.model}</span>}
                  </span>
                </span>

              </span>

              {}
              {c.mode === "agent" && c.preview && (
                <span className="corvus-card-preview">{c.preview}</span>
              )}
            </button>

            {}
            <span className="corvus-card-end">
            <button
              type="button"
              className="corvus-icon-btn corvus-history-more"
              aria-label={tr("Actions for {title}", {
                title: c.title || tr("Untitled"),
              })}
              onClick={(e) =>
                openActions(e, [
                  {
                    label: c.starred ? tr("Unstar") : tr("Star"),
                    icon: c.starred ? "star-off" : "star",
                    run: () => void toggleStar(c),
                  },

                  ...(c.id !== currentChatId && !unread.has(c.id)
                    ? [
                        {
                          label: tr("Mark as unread"),

                          icon: "eye-off",
                          run: () => markUnread(c),
                        },
                      ]
                    : []),
                  {
                    label: tr("Add to project"),
                    icon: "folder-plus",

                    children: [

                      {
                        label: tr("New project…"),
                        icon: "plus",
                        run: () => panel.newProjectWith(c.id),
                      },
                      ...recentProjects.map((p) => ({
                        label: p.name,
                        icon: p.icon,
                        color: projectColor(p.color),
                        checked: p.chatIds.includes(c.id),
                        run: () => void addToProject(c, p.id),
                      })),

                      ...((plugin.settings.projects ?? []).length > MAX_PROJECTS
                        ? [
                            {
                              label: tr("See all {n}", {
                                n: (plugin.settings.projects ?? []).length,
                              }),
                              icon: "list",
                              run: () => panel.pickProjectFor(c.id),
                            },
                          ]
                        : []),
                    ],
                  },
                  {

                    label: tr("Instructions…"),
                    icon: "scroll-text",
                    run: () => panel.instructionsFor(c),
                  },
                  {
                    label: tr("Export to vault"),
                    icon: "file-down",
                    run: () => void exportChat(c),
                  },
                  {
                    label: tr("Rename"),
                    icon: "pencil",
                    run: () => void rename(c),
                  },
                  {
                    label: tr("Delete"),
                    icon: "trash-2",
                    danger: true,
                    run: () => void deleteChat(c),
                  },
                ])
              }
            >
              <Icon name="more-horizontal" />
            </button>
              <span className="corvus-card-age">{relativeShort(c.date)}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
