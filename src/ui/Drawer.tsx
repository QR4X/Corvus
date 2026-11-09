// src/ui/Drawer.tsx
// Menu lateral: a gaveta que guarda TODAS as opções do app — Projects, Skills,
// Settings e, principalmente, a porta de entrada de cada MÓDULO.
// Abre por cima do painel (scrim + slide), fecha no scrim, no Esc e sempre que
// leva o usuário pra algum lugar.
//
// O menu LEVA, não guarda. A raiz lista os módulos (Chat, Vault Q&A, Agent)
// com quantas conversas cada um tem e quando foi a última; tocar num deles
// abre a TELA daquele módulo — a tela de verdade, com o campo de texto e as
// conversas dele (ver StarterScreen).
//
// A lista de conversas já morou aqui dentro, misturando os três módulos numa
// pilha só. Saiu por dois motivos: achar "aquela conversa do Agent" era caçar
// entre chats e perguntas do vault, e mesmo separada por módulo ela ficava a
// dois toques, longe de onde se escreve.

import { useEffect, useMemo, useRef } from "react";
import type CorvusPlugin from "../main";
import { isChatMode, type ChatSession } from "../core/session";
import { useChatStore } from "../store/chat";
import { useChatSummaries, useUnreadChats } from "./ChatList";
import { Icon } from "./Icon";
import { openPluginSettings } from "./modals";
import { moduleHint, moduleStats, modulesInUse } from "./modules";
import { alertCount } from "./chatAlert";
import { marca, tr } from "../i18n/tr";

export type ViewId =
  | "home"
  | "chat"
  | "module"
  | "history"
  | "usage"
  | "projects"
  | "skills";

/** O resto do menu — o que não é módulo. */
const NAV: Array<{ id: ViewId; label: string; icon: string }> = [
  { id: "projects", label: marca("Projects"), icon: "folder-open" },
  { id: "skills", label: marca("Skills"), icon: "sparkles" },
  // O uso também mora aqui, e não só atrás do cartão da home: o cartão só
  // aparece com conversa no mês, e "quanto eu gastei" é pergunta que se faz
  // justamente nos meses em que se usou pouco.
  { id: "usage", label: marca("Usage"), icon: "chart-no-axes-column" },
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
  /** De qual módulo é a home aberta (ou a última). */
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

  // Qual módulo está em uso agora — a conversa aberta manda; sem conversa
  // aberta, o padrão das Settings. Marca a linha na raiz.
  // Qual linha de módulo aparece marcada: na home é a dela; dentro de uma
  // conversa é o modo daquela conversa.
  const moduloAtual =
    view === "module"
      ? modulo
      : isChatMode(sessionMode)
        ? sessionMode
        : isChatMode(plugin.settings.defaultMode)
          ? plugin.settings.defaultMode
          : "chat";

  // Esc fecha; o foco vai pra gaveta quando ela abre.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    // O documento do painel, não o global: numa janela destacada do
    // Obsidian eles são documentos diferentes.
    const doc = panelRef.current?.ownerDocument ?? document;
    doc.addEventListener("keydown", onKey);
    // Sem preventScroll o foco rola o ancestral atrás da gaveta (ela também
    // entra deslocada) — o mesmo pulo da folha.
    panelRef.current?.focus({ preventScroll: true });
    return () => doc.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /** Os três do motor + qualquer outro que apareça nas conversas gravadas. */
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
            {/* Os módulos, direto. Saíram daqui o "New chat" e o "Home", que
                tinham virado eco: a home já é o que a seta de voltar alcança
                de qualquer tela (0.6.39), e começar conversa é o que os três
                cartões dela fazem — nomeando o modo, coisa que um "New chat"
                genérico não fazia. Menu com atalho pro que já está a um toque
                só ensina a duvidar do resto da lista.
                Os módulos ficam porque são o que o menu É; o resto vem atrás
                de um traço, porque é ferramenta, não lugar. */}
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
                  {/* Quantas conversas daqui pedem alguma coisa. Fica ANTES
                      do chevron porque é informação, e o chevron é gesto. */}
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
