import { useCallback, useEffect, useReducer, useState } from "react";
import type CorvusPlugin from "../main";
import { isChatMode, type ChatSession } from "../core/session";
import { SEGMENT_ALL, startupMode } from "./modules";
import type { Skill } from "../skills/skills";
import { ChatView } from "./ChatView";
import { Dashboard } from "./Dashboard";
import { History } from "./History";
import { UsageView } from "./UsageView";
import { FILTRO_VAZIO, type UsageFilter } from "../usage/filters";
import { ModuleHome } from "./ModuleHome";
import { ProjectsView } from "./ProjectsView";
import { SkillsView } from "./SkillsView";
import { Drawer, type ViewId } from "./Drawer";
import { PainelCtx } from "./panel";
import { ChatInstructionsSheet } from "./ChatInstructionsSheet";
import type { ChatSummary } from "../core/chatPersistence";
import { Notice } from "obsidian";
import { ouvirPedidos } from "../editor/bridge";
import { readNote } from "./notePicker";
import { useChatStore } from "../store/chat";
import { tr } from "../i18n/tr";

export interface ComposerInject {
  text: string;
  nonce: number;
}

export function App({
  plugin,
  session,
  onScreenChange,
}: {
  plugin: CorvusPlugin;
  session: ChatSession;

  onScreenChange?: () => void;
}) {

  const modoDeAbertura = startupMode(plugin.settings.startupChatMode);
  const [view, setView] = useState<ViewId>(modoDeAbertura ? "chat" : "home");
  const [menuOpen, setMenuOpen] = useState(false);

  const [modulo, setModulo] = useState<string>(
    () => modoDeAbertura ?? (plugin.settings.defaultMode || "chat")
  );
  const [inject, setInject] = useState<ComposerInject | null>(null);

  const [voltarPara, setVoltarPara] = useState<
    "home" | "history" | "module" | "usage" | "projects" | "skills"
  >("module");

  const [projetoAberto, setProjetoAberto] = useState<string | null>(null);

  const [filtroDeUso, setFiltroDeUso] = useState<UsageFilter>(FILTRO_VAZIO);

  const [painel, setPainel] = useState<"projects" | "skills" | null>(null);

  const [chatParaProjeto, setChatParaProjeto] = useState<string | null>(null);

  const [escolhaPara, setEscolhaPara] = useState<string | null>(null);

  const [instrucoesPara, setInstrucoesPara] = useState<ChatSummary | null>(null);

  const [aba, setAba] = useState(SEGMENT_ALL);
  const [, force] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const u1 = session.onChange(force);
    const u2 = plugin.onSettingsChange(force);
    return () => {
      u1();
      u2();
    };
  }, [session, plugin]);

  useEffect(() => {
    onScreenChange?.();
  }, [view, onScreenChange]);

  useEffect(() => {
    const m = startupMode(plugin.settings.startupChatMode);
    if (!m) return;
    session.newChat(m);
    setInject({ text: "", nonce: Date.now() });
    setVoltarPara("home");
    setView("chat");
  }, [session, plugin]);

  useEffect(
    () =>
      ouvirPedidos((p) => {
        void (async () => {
          const st = useChatStore.getState();
          if (p.tipo === "nota") {
            const nota = await readNote(plugin.app, p.path);
            if (!nota) {
              new Notice(tr("Note not found: {path}", { path: p.path }));
              return;
            }
            session.newChat();
            useChatStore.getState().addAttachment({ type: "note", path: nota.path, content: nota.content });
          } else {

            if (view !== "chat" && st.messages.length === 0) session.newChat();
            useChatStore.getState().addAttachment({
              type: "note",
              path: `${p.path} (selection)`,
              content: p.texto,
            });
          }
          setPainel(null);
          setMenuOpen(false);
          setVoltarPara("home");
          setView("chat");
          if (p.tipo === "nota" && p.enviar) await session.send(p.enviar);
          else setInject({ text: "", nonce: Date.now() });
        })();
      }),
    [session, plugin, view]
  );

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const navegar = useCallback((id: ViewId) => {
    if (id === "projects" || id === "skills") {
      setPainel(id);
      return;
    }

    if (id === "usage") setFiltroDeUso(FILTRO_VAZIO);
    setView(id);
  }, []);

  const entrarNoModulo = useCallback((mode: string) => {
    setModulo(mode);
    setView("module");
    setPainel(null);
    setMenuOpen(false);
  }, []);

  const usarSkill = (skill: Skill) => {

    if (isChatMode(skill.mode)) session.setMode(skill.mode);
    setInject({ text: skill.body, nonce: Date.now() });
    setView("chat");
  };

  return (
    <PainelCtx.Provider
      value={{
        novoProjetoCom: (chatId: string) => {
          setChatParaProjeto(chatId);
          setEscolhaPara(null);
          setProjetoAberto(null);
          setPainel("projects");
        },
        escolherProjetoPara: (chatId: string) => {
          setEscolhaPara(chatId);
          setChatParaProjeto(chatId);
          setProjetoAberto(null);
          setPainel("projects");
        },
        instrucoesDe: (chat: ChatSummary) => setInstrucoesPara(chat),
      }}
    >
    <div className={view === "chat" ? "corvus-root corvus-chat-open" : "corvus-root"}>
      {view === "home" ? (
        <Dashboard
          plugin={plugin}
          session={session}
          aba={aba}
          onAba={setAba}
          onOpenHistory={() => setView("history")}
          onOpenUsage={() => {
            setFiltroDeUso(FILTRO_VAZIO);
            setView("usage");
          }}
          onOpenMenu={() => setMenuOpen(true)}

          onNewChat={(m) => {
            session.newChat(m);
            setModulo(m);
            setInject({ text: "", nonce: Date.now() });
            setVoltarPara("home");
            setView("chat");
          }}
          onOpenChat={() => {
            setVoltarPara("home");
            setView("chat");
          }}
        />
      ) : view === "usage" ? (
        <UsageView
          plugin={plugin}
          session={session}
          onBack={() => setView("home")}
          filtro={filtroDeUso}
          onFiltro={setFiltroDeUso}

          onOpenChat={() => {
            setVoltarPara("usage");
            setView("chat");
          }}
        />
      ) : view === "history" ? (
        <History
          plugin={plugin}
          session={session}
          aba={aba}
          onAba={setAba}
          onBack={() => setView("home")}
          onOpenChat={() => {
            setVoltarPara("history");
            setView("chat");
          }}
        />
      ) : view === "module" ? (
        <ModuleHome
          plugin={plugin}
          session={session}
          modulo={modulo}
          onBack={() => setView("home")}

          onOpenChat={() => {
            setVoltarPara("module");
            setView("chat");
          }}
          onNewChat={() => {
            if (isChatMode(modulo)) session.newChat(modulo);
            setVoltarPara("module");
            setView("chat");
          }}
          onOpenSkills={() => setPainel("skills")}
        />
      ) : view === "chat" ? (
        <ChatView
          plugin={plugin}
          session={session}
          inject={inject}

          onBackHome={() => {

            if (voltarPara === "projects" || voltarPara === "skills") {
              setPainel(voltarPara);
              setView("home");
              return;
            }
            if (voltarPara !== "module") {
              setView(voltarPara);
              return;
            }
            const m = session.config.mode;
            setModulo(m);
            setView("module");
          }}
          onUseSkill={usarSkill}
        />
      ) : null}

      {}
      <ProjectsView
        plugin={plugin}
        session={session}
        open={painel === "projects"}
        abertoId={projetoAberto}
        onAbrir={setProjetoAberto}
        chatPendente={chatParaProjeto}
        onChatPendente={setChatParaProjeto}
        escolhaPara={escolhaPara}
        onEscolha={() => {
          setEscolhaPara(null);
          setChatParaProjeto(null);
          setPainel(null);
        }}
        onClose={() => {
          setPainel(null);
          setEscolhaPara(null);
          setChatParaProjeto(null);
        }}
        onOpenChat={() => {

          setPainel(null);
          setVoltarPara("projects");
          setView("chat");
        }}
      />
      <SkillsView
        plugin={plugin}
        open={painel === "skills"}
        onClose={() => setPainel(null)}
        onUse={(sk) => {
          setPainel(null);
          setVoltarPara("skills");
          usarSkill(sk);
        }}
      />

      <ChatInstructionsSheet
        plugin={plugin}
        chat={instrucoesPara}
        open={instrucoesPara !== null}
        onClose={() => setInstrucoesPara(null)}
      />

      <Drawer
        plugin={plugin}
        session={session}
        open={menuOpen}
        view={painel ?? view}
        modulo={modulo}
        onEnterModule={entrarNoModulo}
        onNavigate={navegar}
        onClose={closeMenu}
      />
    </div>
    </PainelCtx.Provider>
  );
}
