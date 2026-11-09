import { useEffect, useMemo, useRef } from "react";
import type CorvusPlugin from "../main";
import { isChatMode, type ChatSession } from "../core/session";
import { useChatStore } from "../store/chat";
import { useChatSummaries, useUnreadChats } from "./ChatList";
import { Icon } from "./Icon";
import { openPluginSettings } from "./modals";
import { moduleHint, moduleStats, modulesInUse } from "./modules";
import { alertCount } from "./chatAlert";
import { mark, tr } from "../i18n/tr";

export type ViewId =
  | "home"
  | "chat"
  | "module"
  | "history"
  | "usage"
  | "projects"
  | "skills";

const NAV: Array<{ id: ViewId; label: string; icon: string }> = [
  { id: "projects", label: mark("Projects"), icon: "folder-open" },
  { id: "skills", label: mark("Skills"), icon: "sparkles" },

  { id: "usage", label: mark("Usage"), icon: "chart-no-axes-column" },
];

export function Drawer({
  plugin,
  session,
  open,
  view,
  modulo,
  onEnterModule,
  onNavigate,
  onClose,
}: {
  plugin: CorvusPlugin;
  session: ChatSession;
  open: boolean;
  view: ViewId;

  modulo: string;
  onEnterModule: (mode: string) => void;
  onNavigate: (view: ViewId) => void;
  onClose: () => void;
}) {
  const sessionMode = useChatStore((s) => s.sessionMode);
  const esperandoId = useChatStore((s) => s.waitingChatId);
  const chats = useChatSummaries(plugin);
  const naoLidas = useUnreadChats(plugin);
  const panelRef = useRef<HTMLDivElement>(null);

  const moduloAtual =
    view === "module"
      ? modulo
      : isChatMode(sessionMode)
        ? sessionMode
        : isChatMode(plugin.settings.defaultMode)
          ? plugin.settings.defaultMode
          : "chat";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    const doc = panelRef.current?.ownerDocument ?? document;
    doc.addEventListener("keydown", onKey);

    panelRef.current?.focus({ preventScroll: true });
    return () => doc.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const modulosVisiveis = useMemo(() => modulesInUse(chats), [chats]);

  const go = (id: ViewId) => {
    onNavigate(id);
    onClose();
  };

  return (
    <div
      className={open ? "corvus-drawer-layer is-open" : "corvus-drawer-layer"}
      aria-hidden={!open}
    >
      <div className="corvus-scrim" onClick={onClose} />
      <aside
        ref={panelRef}
        className="corvus-drawer"
        role="dialog"
        aria-label={tr("Corvus menu")}
        tabIndex={-1}
      >
        <header className="corvus-drawer-head">
          <span className="corvus-brand">Corvus</span>
          <button
            type="button"
            className="corvus-icon-btn"
            aria-label={tr("Close menu")}
            onClick={onClose}
          >
            <Icon name="x" />
          </button>
        </header>

        <nav className="corvus-drawer-nav">
            {}
            {modulosVisiveis.map((m) => {
              const stats = moduleStats(chats, m.id);
              const pedindo = alertCount(chats, m.id, {
                esperando: esperandoId,
                naoLidas,
              });
              return (
                <button
                  key={m.id}
                  type="button"
                  className={
                    (view === "chat" || view === "module") &&
                    moduloAtual === m.id
                      ? "corvus-nav-item corvus-module-item is-active"
                      : "corvus-nav-item corvus-module-item"
                  }
                  onClick={() => onEnterModule(m.id)}
                >
                  <Icon name={m.icon} />
                  <span className="corvus-module-text">
                    <span className="corvus-module-label">{m.label}</span>
                    <span className="corvus-module-hint">
                      {moduleHint(stats)}
                    </span>
                  </span>
                  {}
                  {pedindo > 0 && (
                    <span className="corvus-module-badge">{pedindo}</span>
                  )}
                  <Icon
                    name="chevron-right"
                    size={18}
                    className="corvus-module-chev"
                  />
                </button>
              );
            })}

            <span className="corvus-nav-sep" role="presentation" />

            {NAV.map((n) => (
              <button
                key={n.id}
                type="button"
                className={
                  view === n.id ? "corvus-nav-item is-active" : "corvus-nav-item"
                }
                onClick={() => go(n.id)}
              >
                <Icon name={n.icon} />
                <span>{tr(n.label)}</span>
              </button>
            ))}
            <button
              type="button"
              className="corvus-nav-item"
              onClick={() => {
                openPluginSettings(plugin);
                onClose();
              }}
            >
              <Icon name="settings" />
              <span>{tr("Settings")}</span>
            </button>
          </nav>

        <footer className="corvus-drawer-foot">v{plugin.manifest.version}</footer>
      </aside>
    </div>
  );
}
