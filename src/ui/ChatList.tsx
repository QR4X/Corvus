import { useEffect, useState } from "react";
import { Notice } from "obsidian";
import type CorvusPlugin from "../main";
import type { ChatSession } from "../core/session";
import type { ChatSummary } from "../core/chatPersistence";
import { loadChat, setChatStarred } from "../core/chatPersistence";
import { exportChatToVault } from "../core/chatExport";
import { usePainel } from "./panel";
import { projectColor } from "../projects";
import { useChatStore } from "../store/chat";
import { PROVIDERS } from "../core/providersMeta";
import { Icon } from "./Icon";
import { openActions } from "./menu";
import { PromptModal, ConfirmModal } from "./modals";
import { relativeShort } from "./modules";
import { ALERT_LABEL, chatAlert } from "./chatAlert";
import { tr } from "../i18n/tr";

export function providerIcon(id: string): string {
  return PROVIDERS.find((p) => p.id === id)?.icon ?? "message-square";
}

export function useChatSummaries(plugin: CorvusPlugin): ChatSummary[] {
  const [chats, setChats] = useState<ChatSummary[]>(plugin.chatSummaries ?? []);
  useEffect(() => {
    let vivo = true;
    void plugin.loadChatSummaries().then((all) => {
      if (vivo) setChats(all);
    });
    const unsub = plugin.onChatsChange(() =>
      setChats(plugin.chatSummaries ?? []),
    );
    return () => {
      vivo = false;
      unsub();
    };
  }, [plugin]);
  return chats;
}

export function useUnreadChats(plugin: CorvusPlugin): Set<string> {
  const [naoLidas, setNaoLidas] = useState<Set<string>>(() =>
    plugin.unreadSet(),
  );
  useEffect(() => {
    setNaoLidas(plugin.unreadSet());
    return plugin.onUnreadChange(() => setNaoLidas(plugin.unreadSet()));
  }, [plugin]);
  return naoLidas;
}

function acoes(c: ChatSummary): { texto: string; ativo: boolean } | null {
  if (c.mode !== "agent") return null;
  if (c.toolCount > 0) {
    return {
      texto:
        c.toolCount === 1
          ? tr("1 action")
          : tr("{n} actions", { n: c.toolCount }),
      ativo: true,
    };
  }
  return { texto: tr("No actions"), ativo: false };
}

const MAX_PROJETOS = 5;

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

  const respondendo = useChatStore((s) => s.isLoading);
  const turnChatId = useChatStore((s) => s.turnChatId);
  const esperandoId = useChatStore((s) => s.waitingChatId);
  const naoLidas = useUnreadChats(plugin);
  const painel = usePainel();

  const projetosRecentes = [...(plugin.settings.projects ?? [])]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_PROJETOS);

  const abrir = (c: ChatSummary) => {
    void session.load(c);
    onOpen?.(c);
  };

  const renomear = async (c: ChatSummary) => {
    const title = await new PromptModal(plugin.app, {
      title: tr("Rename chat"),
      label: tr("Title"),
      initial: c.title,
      submitLabel: tr("Rename"),
    }).openAndWait();
    if (title && title !== c.title) await session.rename(c, title);
  };

  const favoritar = async (c: ChatSummary) => {
    try {
      await setChatStarred(
        plugin.app,
        plugin.settings.chatsPath,
        c.mode,
        c.id,
        !c.starred
      );
      await plugin.loadChatSummaries(true);
    } catch (err) {
      new Notice(
        tr("Could not star: {error}", {
          error: err instanceof Error ? err.message : String(err),
        })
      );
    }
  };

  const deixarNaoLida = (c: ChatSummary) => {
    plugin.markChatUnread(c.id);
    new Notice(tr("Marked as unread."));
  };

  const exportar = async (c: ChatSummary) => {
    try {
      const chat = await loadChat(
        plugin.app,
        plugin.settings.chatsPath,
        c.mode,
        c.id
      );
      const caminho = await exportChatToVault(plugin.app, chat);
      new Notice(tr("Exported to {path}", { path: caminho }));
    } catch (err) {
      new Notice(
        tr("Export failed: {error}", {
          error: err instanceof Error ? err.message : String(err),
        })
      );
    }
  };

  const paraProjeto = async (c: ChatSummary, projectId: string) => {
    await session.updateProjects((prev) =>
      prev.map((p) =>
        p.id === projectId && !p.chatIds.includes(c.id)
          ? { ...p, chatIds: [c.id, ...p.chatIds] }
          : p
      )
    );
    const nome = (plugin.settings.projects ?? []).find(
      (p) => p.id === projectId
    )?.name;
    new Notice(
      nome === undefined
        ? tr("Added to project.")
        : tr("Added to {name}.", { name: nome })
    );
  };

  const apagar = async (c: ChatSummary) => {
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
        const st = acoes(c);
        const alerta = chatAlert({
          esperando: esperandoId === c.id,
          rodando: respondendo && turnChatId === c.id,
          naoLida: naoLidas.has(c.id),
        });
        return (
          <div
            key={c.id}
            className={[
              "corvus-history-row",

              c.mode === "chat" ? "is-flat" : "",

              c.mode === "agent" && c.preview ? "has-preview" : "",
              c.id === currentChatId ? "is-current" : "",
              alerta ? `has-alert is-${alerta}` : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <button
              type="button"
              className="corvus-history-open"
              onClick={() => abrir(c)}
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
                    {alerta && (
                      <span className={`corvus-card-live is-${alerta}`}>
                        <span className="corvus-card-pulse" aria-hidden="true" />
                        {tr(ALERT_LABEL[alerta])}
                      </span>
                    )}
                    {alerta && <span className="corvus-card-dot">·</span>}
                    {st && (
                      <span
                        className={
                          st.ativo ? "corvus-card-state is-on" : "corvus-card-state"
                        }
                      >
                        {st.texto}
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
                    run: () => void favoritar(c),
                  },

                  ...(c.id !== currentChatId && !naoLidas.has(c.id)
                    ? [
                        {
                          label: tr("Mark as unread"),

                          icon: "eye-off",
                          run: () => deixarNaoLida(c),
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
                        run: () => painel.novoProjetoCom(c.id),
                      },
                      ...projetosRecentes.map((p) => ({
                        label: p.name,
                        icon: p.icon,
                        color: projectColor(p.color),
                        checked: p.chatIds.includes(c.id),
                        run: () => void paraProjeto(c, p.id),
                      })),

                      ...((plugin.settings.projects ?? []).length > MAX_PROJETOS
                        ? [
                            {
                              label: tr("See all {n}", {
                                n: (plugin.settings.projects ?? []).length,
                              }),
                              icon: "list",
                              run: () => painel.escolherProjetoPara(c.id),
                            },
                          ]
                        : []),
                    ],
                  },
                  {

                    label: tr("Instructions…"),
                    icon: "scroll-text",
                    run: () => painel.instrucoesDe(c),
                  },
                  {
                    label: tr("Export to vault"),
                    icon: "file-down",
                    run: () => void exportar(c),
                  },
                  {
                    label: tr("Rename"),
                    icon: "pencil",
                    run: () => void renomear(c),
                  },
                  {
                    label: tr("Delete"),
                    icon: "trash-2",
                    danger: true,
                    run: () => void apagar(c),
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
