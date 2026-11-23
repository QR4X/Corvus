import { useCallback, useEffect, useReducer, useState } from "react";
import type CorvusPlugin from "../main";
import { isChatMode, type ChatSession } from "../core/session";
import { SEGMENT_ALL, startupMode } from "./modules";
import type { Skill } from "../skills/skills";
import { ChatView } from "./ChatView";
import { Dashboard } from "./Dashboard";
import { History } from "./History";
import { UsageView } from "./UsageView";
import { EMPTY_FILTER, type UsageFilter } from "../usage/filters";
import { ModuleHome } from "./ModuleHome";
import { ProjectsView } from "./ProjectsView";
import { SkillsView } from "./SkillsView";
import { Drawer, type ViewId } from "./Drawer";
import { PanelCtx } from "./panel";
import { ChatInstructionsSheet } from "./ChatInstructionsSheet";
import type { ChatSummary } from "../core/chatPersistence";
import { Notice } from "obsidian";
import { listenForRequests } from "../editor/bridge";
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

  const startMode = startupMode(plugin.settings.startupChatMode);
  const [view, setView] = useState<ViewId>(
    plugin.settings.startupChatMode === "dashboard" ? "home" : "chat"
  );
  const [menuOpen, setMenuOpen] = useState(false);

  const [moduleId, setModuleId] = useState<string>(
    () => startMode ?? (plugin.settings.defaultMode || "chat")
  );
  const [inject, setInject] = useState<ComposerInject | null>(null);

  const [backTo, setBackTo] = useState<
    "home" | "history" | "module" | "usage" | "projects" | "skills"
  >("module");

  const [openProjectId, setOpenProjectId] = useState<string | null>(null);

  const [usageFilter, setUsageFilter] = useState<UsageFilter>(EMPTY_FILTER);

  const [panel, setPanel] = useState<"projects" | "skills" | null>(null);

  const [pendingChatId, setPendingChatId] = useState<string | null>(null);

  const [pickFor, setPickFor] = useState<string | null>(null);

  const [instructionsChat, setInstructionsChat] = useState<ChatSummary | null>(null);

  const [tab, setTab] = useState(SEGMENT_ALL);
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
    setBackTo("home");
    setView("chat");
  }, [session, plugin]);

  useEffect(
    () =>
      listenForRequests((p) => {
        void (async () => {
          const st = useChatStore.getState();
          if (p.kind === "note") {
            const note = await readNote(plugin.app, p.path);
            if (!note) {
              new Notice(tr("Note not found: {path}", { path: p.path }));
              return;
            }
            session.newChat();
            useChatStore.getState().addAttachment({ type: "note", path: note.path, content: note.content });
          } else {

            if (view !== "chat" && st.messages.length === 0) session.newChat();
            useChatStore.getState().addAttachment({
              type: "note",
              path: `${p.path} (selection)`,
              content: p.text,
            });
          }
          setPanel(null);
          setMenuOpen(false);
          setBackTo("home");
          setView("chat");
          if (p.kind === "note" && p.send) await session.send(p.send);
          else setInject({ text: "", nonce: Date.now() });
        })();
      }),
    [session, plugin, view]
  );

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const navigate = useCallback((id: ViewId) => {
    if (id === "projects" || id === "skills") {
      setPanel(id);
      return;
    }

    if (id === "usage") setUsageFilter(EMPTY_FILTER);
    setView(id);
  }, []);

  const enterModule = useCallback((mode: string) => {
    setModuleId(mode);
    setView("module");
    setPanel(null);
    setMenuOpen(false);
  }, []);

  const applySkill = (skill: Skill) => {

    if (isChatMode(skill.mode)) session.setMode(skill.mode);
    setInject({ text: skill.body, nonce: Date.now() });
    setView("chat");
  };

  return (
    <PanelCtx.Provider
      value={{
        newProjectWith: (chatId: string) => {
          setPendingChatId(chatId);
          setPickFor(null);
          setOpenProjectId(null);
          setPanel("projects");
        },
        pickProjectFor: (chatId: string) => {
          setPickFor(chatId);
          setPendingChatId(chatId);
          setOpenProjectId(null);
          setPanel("projects");
        },
        instructionsFor: (chat: ChatSummary) => setInstructionsChat(chat),
      }}
    >
    <div className={view === "chat" ? "corvus-root corvus-chat-open" : "corvus-root"}>
      {view === "home" ? (
        <Dashboard
          plugin={plugin}
          session={session}
          tab={tab}
          onTab={setTab}
          onOpenHistory={() => setView("history")}
          onOpenUsage={() => {
            setUsageFilter(EMPTY_FILTER);
            setView("usage");
          }}
          onOpenMenu={() => setMenuOpen(true)}

          onNewChat={(m) => {
            session.newChat(m);
            setModuleId(m);
            setInject({ text: "", nonce: Date.now() });
            setBackTo("home");
            setView("chat");
          }}
          onOpenChat={() => {
            setBackTo("home");
            setView("chat");
          }}
        />
      ) : view === "usage" ? (
        <UsageView
          plugin={plugin}
          session={session}
          onBack={() => setView("home")}
          filter={usageFilter}
          onFilter={setUsageFilter}

          onOpenChat={() => {
            setBackTo("usage");
            setView("chat");
          }}
        />
      ) : view === "history" ? (
        <History
          plugin={plugin}
          session={session}
          tab={tab}
          onTab={setTab}
          onBack={() => setView("home")}
          onOpenChat={() => {
            setBackTo("history");
            setView("chat");
          }}
        />
      ) : view === "module" ? (
        <ModuleHome
          plugin={plugin}
          session={session}
          moduleId={moduleId}
          onBack={() => setView("home")}

          onOpenChat={() => {
            setBackTo("module");
            setView("chat");
          }}
          onNewChat={() => {
            if (isChatMode(moduleId)) session.newChat(moduleId);
            setBackTo("module");
            setView("chat");
          }}
          onOpenSkills={() => setPanel("skills")}
        />
      ) : view === "chat" ? (
        <ChatView
          plugin={plugin}
          session={session}
          inject={inject}
          onOpenMenu={() => setMenuOpen(true)}
          onBackHome={() => {

            if (backTo === "projects" || backTo === "skills") {
              setPanel(backTo);
              setView("home");
              return;
            }
            if (backTo !== "module") {
              setView(backTo);
              return;
            }
            const m = session.config.mode;
            setModuleId(m);
            setView("module");
          }}
          onUseSkill={applySkill}
        />
      ) : null}

      {}
      <ProjectsView
        plugin={plugin}
        session={session}
        open={panel === "projects"}
        openId={openProjectId}
        onOpenProject={setOpenProjectId}
        pendingChatId={pendingChatId}
        onPendingChat={setPendingChatId}
        pickFor={pickFor}
        onPicked={() => {
          setPickFor(null);
          setPendingChatId(null);
          setPanel(null);
        }}
        onClose={() => {
          setPanel(null);
          setPickFor(null);
          setPendingChatId(null);
        }}
        onOpenChat={() => {

          setPanel(null);
          setBackTo("projects");
          setView("chat");
        }}
      />
      <SkillsView
        plugin={plugin}
        open={panel === "skills"}
        onClose={() => setPanel(null)}
        onUse={(sk) => {
          setPanel(null);
          setBackTo("skills");
          applySkill(sk);
        }}
      />

      <ChatInstructionsSheet
        plugin={plugin}
        chat={instructionsChat}
        open={instructionsChat !== null}
        onClose={() => setInstructionsChat(null)}
      />

      <Drawer
        plugin={plugin}
        open={menuOpen}
        view={panel ?? view}
        moduleId={moduleId}
        onEnterModule={enterModule}
        onNavigate={navigate}
        onClose={closeMenu}
      />
    </div>
    </PanelCtx.Provider>
  );
}
