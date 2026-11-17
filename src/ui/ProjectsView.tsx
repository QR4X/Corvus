import { useEffect, useMemo, useReducer, useState } from "react";
import { Notice, TFile } from "obsidian";
import type CorvusPlugin from "../main";
import type { ChatSession } from "../core/session";
import {
  makeProjectId,
  copyName,
  projectColor,
  projectProblem,
  EMPTY_PROJECT_DRAFT,
  type Project,
  type ProjectDraft,
} from "../projects";
import { ChatList } from "./ChatList";
import { useChatSummaries } from "./chatHooks";
import {
  formatTokens,
  summarizeProject,
  projectInputTokens,
} from "./projectSummary";
import { ConfirmModal } from "./modals";
import { Icon } from "./Icon";
import {
  Sheet,
  SheetGroup,
  SheetNote,
  SheetRow,
  SheetSearch,
  useSheetDefault,
} from "./Sheet";
import {
  EMPTY_EXTRAS,
  PROJECT_STEPS,
  ProjectForm,
  type ProjectExtras,
} from "./ProjectSheet";
import { wizardFoot } from "./wizard";
import {
  SheetField,
  SheetProgress,
  SheetSubmit,
  SheetTextarea,
  SheetWizardFoot,
} from "./SheetForm";
import { openActions } from "./menu";
import { rankNotes, vaultNotes } from "./notePicker";
import { exportProjectToVault } from "../core/projectExport";
import { AssistantPanel, WithAssistant, useRun } from "./AssistantPanel";
import { clearRun } from "../assistant/store";
import { useAssistant } from "./useAssistant";
import type { MenuAction } from "./menu";
import { tr } from "../i18n/tr";

export function ProjectsView({
  plugin,
  session,
  open,
  openId,
  onOpenProject,
  pendingChatId,
  onPendingChat,
  pickFor,
  onPicked,
  onOpenChat,
  onClose,
}: {
  plugin: CorvusPlugin;
  session: ChatSession;
  open: boolean;

  openId: string | null;
  onOpenProject: (id: string | null) => void;

  pendingChatId?: string | null;
  onPendingChat?: (id: string | null) => void;

  pickFor?: string | null;
  onPicked?: () => void;
  onOpenChat: () => void;
  onClose: () => void;
}) {
  const [, force] = useReducer((n: number) => n + 1, 0);
  const setOpenId = onOpenProject;
  const [draft, setDraft] = useState<ProjectDraft | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);

  const [step, setStep] = useState(0);

  const [browsing, setBrowsing] = useState(false);

  const [showingNotes, setShowingNotes] = useState(false);
  const [pickingNote, setPickingNote] = useState(false);
  const [noteQuery, setNoteQuery] = useState("");

  const [instructionsDraft, setInstructionsDraft] = useState<string | null>(null);

  const [assistingInstructions, setAssistingInstructions] = useState(false);
  const { unavailable, askInstructions, target, models, freeModels, chooseModel } = useAssistant(plugin);
  const modelPicker = {
    current: target?.model ?? "",
    options: models,
    freeModels,
    onPick: (m: string) => void chooseModel(m),
  };

  const runInstr = useRun("instructions");
  useEffect(() => {
    if (runInstr.phase !== "done" || typeof runInstr.result !== "string")
      return;
    setInstructionsDraft(runInstr.result);
    clearRun("instructions");
    setAssistingInstructions(false);
  }, [runInstr.phase, runInstr.result]);

  const chats = useChatSummaries(plugin);
  const projects = plugin.settings.projects ?? [];

  const tokensByProject = useInputTokens(plugin, projects, open);
  const openProject = projects.find((p) => p.id === openId) ?? null;

  const update = async (fn: (prev: Project[]) => Project[]) => {
    await session.updateProjects(fn);
    force();
  };

  const startCreate = () => {
    setEditingId(null);
    setStep(0);
    setBrowsing(false);
    setExtras(EMPTY_EXTRAS);
    setDraft(EMPTY_PROJECT_DRAFT);
  };

  const startEdit = (p: Project) => {
    setEditingId(p.id);
    setBrowsing(false);
    setExtras(EMPTY_EXTRAS);
    setDraft({ name: p.name, icon: p.icon, color: p.color });
  };

  const [extras, setExtras] = useState<ProjectExtras>(EMPTY_EXTRAS);

  const problem = draft
    ? projectProblem(draft, projects, editingId ?? undefined)
    : null;

  const save = async () => {
    if (!draft || problem) return;
    const name = draft.name.trim();
    if (editingId) {
      await update((prev) =>
        prev.map((x) =>
          x.id === editingId
            ? {
                ...x,
                name,
                icon: draft.icon,
                color: draft.color,

                sources: [...new Set([...x.sources, ...extras.notes])],
                instructions: extras.instructions.trim() || x.instructions,
              }
            : x
        )
      );
    } else {
      const p: Project = {
        id: makeProjectId(),
        name,
        icon: draft.icon,
        color: draft.color,
        sources: extras.notes,
        instructions: extras.instructions.trim() || undefined,

        chatIds: pendingChatId ? [pendingChatId] : [],
        createdAt: new Date().toISOString(),
      };
      await update((prev) => [p, ...prev]);

      setOpenId(p.id);
      onPendingChat?.(null);
    }
    setDraft(null);
    setEditingId(null);
    setExtras(EMPTY_EXTRAS);
    setStep(0);
    setBrowsing(false);
  };

  const deleteProject = async (p: Project) => {
    const ok = await new ConfirmModal(plugin.app, {
      title: tr("Delete project \"{name}\"?", { name: p.name }),
      body: tr(
        "The notes and chats stay where they are — only the grouping goes."
      ),
      confirmLabel: tr("Delete"),
      danger: true,
    }).openAndWait();
    if (!ok) return;
    await update((prev) => prev.filter((x) => x.id !== p.id));
    if (openId === p.id) setOpenId(null);
  };

  const duplicate = async (p: Project) => {
    const copy: Project = {
      ...p,
      id: makeProjectId(),
      name: copyName(p.name, projects),
      chatIds: [],
      createdAt: new Date().toISOString(),
    };
    await update((prev) => [copy, ...prev]);
    new Notice(tr("Duplicated as \"{name}\"", { name: copy.name }));
  };

  const exportProject = async (p: Project) => {
    try {
      const path = await exportProjectToVault(
        plugin.app,
        p,
        chats,
        new Date()
      );
      new Notice(tr("Exported to {path}", { path }));
    } catch (e) {
      new Notice(
        tr("Could not export: {error}", { error: (e as Error).message })
      );
    }
  };

  const projectActions = (p: Project): MenuAction[] => [
    {
      label: tr("New chat here"),
      icon: "message-circle-plus",
      run: () => {
        void session.newChatInProject(p);
        onOpenChat();
      },
    },
    {
      label: tr("Instructions"),
      icon: "scroll-text",
      run: () => {
        setOpenId(p.id);
        setInstructionsDraft(p.instructions ?? "");
      },
    },
    {
      label: tr("Notes"),
      icon: "library",
      run: () => {
        setOpenId(p.id);
        setShowingNotes(true);
      },
    },
    { label: tr("Edit"), icon: "pencil", run: () => startEdit(p) },
    { label: tr("Duplicate"), icon: "copy", run: () => void duplicate(p) },
    {
      label: tr("Export to vault"),
      icon: "download",
      run: () => void exportProject(p),
    },
    {
      label: tr("Delete"),
      icon: "trash-2",
      danger: true,
      run: () => void deleteProject(p),
    },
  ];

  const addNote = (p: Project, path: string) =>
    update((prev) =>
      prev.map((x) =>
        x.id === p.id && !x.sources.includes(path)
          ? { ...x, sources: [...x.sources, path] }
          : x
      )
    );

  const removeNote = (p: Project, path: string) =>
    update((prev) =>
      prev.map((x) =>
        x.id === p.id
          ? { ...x, sources: x.sources.filter((s) => s !== path) }
          : x
      )
    );

  const openNote = (path: string) => {
    const f = plugin.app.vault.getAbstractFileByPath(path);
    if (f instanceof TFile) void plugin.app.workspace.getLeaf(true).openFile(f);
    else new Notice(tr("Not found: {path}", { path }));
  };

  const noteHits = useMemo(() => {
    const ranked = rankNotes(vaultNotes(plugin.app), noteQuery);

    return openProject ? ranked.filter((n) => !openProject.sources.includes(n.path)) : ranked;
  }, [plugin, openProject, noteQuery]);

  const level = draft
    ? "form"
    : instructionsDraft !== null
      ? "instructions"
      : pickingNote
        ? "pick"
        : showingNotes
          ? "notes"
          : openProject
            ? "project"
            : "list";

  const creating = level === "form" && editingId === null;

  const titles: Record<string, string> = {

    form: editingId
      ? tr("Edit project")
      : tr("New project · {step}", { step: tr(PROJECT_STEPS[step].label) }),
    instructions: tr("Custom instructions"),
    pick: tr("Add a note"),
    notes: tr("Project notes"),
    project: openProject?.name ?? tr("Project"),
    list: pickFor ? tr("Add to project") : tr("Projects"),
  };

  const backFor: Record<string, (() => void) | undefined> = {

    form: () => {
      if (
        creating &&
        wizardFoot({ current: step, total: PROJECT_STEPS.length }).back ===
          "step"
      ) {
        setStep(step - 1);
        return;
      }
      setDraft(null);
      setEditingId(null);
      setExtras(EMPTY_EXTRAS);
      setStep(0);
      setBrowsing(false);
    },
    instructions: () => {
      setInstructionsDraft(null);
      setAssistingInstructions(false);
    },
    pick: () => setPickingNote(false),
    notes: () => setShowingNotes(false),
    project: () => setOpenId(null),
    list: undefined,
  };

  const closeAll = () => {
    setDraft(null);
    setEditingId(null);
    setExtras(EMPTY_EXTRAS);
    setStep(0);
    setBrowsing(false);
    setInstructionsDraft(null);
    setPickingNote(false);
    setShowingNotes(false);
    setNoteQuery("");
    onClose();
  };

  const saveInstructions = () => {
    const project = openProject;
    const text = (instructionsDraft ?? "").trim();
    if (project) {
      void update((prev) =>
        prev.map((x) =>
          x.id === project.id ? { ...x, instructions: text || undefined } : x
        )
      );
    }
    setInstructionsDraft(null);
  };

  const footer =
    level === "form" ? (

      browsing ? undefined : creating ? (
        <SheetWizardFoot
          current={step}
          total={PROJECT_STEPS.length}
          onStep={setStep}
          problem={problem}
          label={tr("Create project")}
          onSubmit={() => void save()}
        />
      ) : (
        <SheetSubmit
          label={tr("Save project")}
          problem={problem}
          onSubmit={() => void save()}
        />
      )
    ) : level === "instructions" ? (
      <SheetSubmit
        label={tr("Save instructions")}
        onSubmit={saveInstructions}
      />
    ) : level === "project" && openProject ? (
      <div className="corvus-sheet-foot">
        {}
        <button
          type="button"
          className="corvus-home-filter"
          onClick={(e) =>
            openActions(e, projectActions(openProject))
          }
        >
          <Icon name="settings-2" size={16} />
          <span>{tr("Project settings")}</span>
        </button>
        <button
          type="button"
          className="corvus-sheet-cta"
          onClick={() => {
            void session.newChatInProject(openProject);
            onOpenChat();
          }}
        >
          <Icon name="plus" size={20} />
          <span>{tr("New chat here")}</span>
        </button>
      </div>
    ) : undefined;

  return (
    <Sheet
      title={titles[level]}
      footer={footer}
      progress={
        creating && !browsing ? (
          <SheetProgress current={step} total={PROJECT_STEPS.length} />
        ) : undefined
      }

      minSize="mid"

      action={
        level === "list"
          ? {
              icon: "plus",
              label: tr("New project"),
              text: tr("New"),
              onClick: startCreate,
            }
          : undefined
      }
      mark={
        openProject && level !== "list"
          ? { icon: openProject.icon, color: projectColor(openProject.color) }
          : undefined
      }
      open={open}
      onClose={closeAll}
      onBack={backFor[level]}

            focusOnOpen={false}
    >
      {level === "form" && (
        <ProjectForm
          draft={draft ?? EMPTY_PROJECT_DRAFT}
          focus={level === "form"}
          onDraft={setDraft}
          plugin={plugin}
          extras={extras}
          onExtras={setExtras}
          step={creating ? PROJECT_STEPS[step].id : undefined}
          browsing={browsing}
          onBrowse={setBrowsing}
        />
      )}

      {}
      {level !== "form" && <SheetDefaultSize />}

      {level === "instructions" && (
        <>
          <SheetField
            label={tr("Instructions")}
            hint={tr(
              "Sent with every new chat in this project — it adds to how the app already works, it does not replace it."
            )}
          >
            {}
            <WithAssistant
              open={assistingInstructions}
              busy={runInstr.phase === "running"}
              onOpen={() => setAssistingInstructions(true)}
              panel={
                <AssistantPanel
                  target="instructions"
                  unavailable={unavailable}
                  modelPicker={modelPicker}
                  onClose={() => setAssistingInstructions(false)}
                  onAsk={(_mode, turns) =>
                    askInstructions(
                      {
                        name: openProject?.name ?? "",
                        notes: openProject?.sources ?? [],
                        current: instructionsDraft ?? "",
                      },
                      turns
                    )
                  }
                />
              }
            >
              <SheetTextarea
                withSpark
                value={instructionsDraft ?? ""}
                rows={9}
                placeholder={tr(
                  "Answer in Portuguese.\nCite the note you took it from.\nShort paragraphs, no bullet lists."
                )}
                onChange={setInstructionsDraft}
              />
            </WithAssistant>
          </SheetField>
        </>
      )}

      {level === "pick" && (
        <>
          <SheetSearch
            value={noteQuery}
            placeholder={tr("Search notes")}
            found={noteHits.length}
            autoFocus={level === "pick"}
            onChange={setNoteQuery}
          />
          <SheetGroup>
            {noteHits.map((n) => (
              <SheetRow
                key={n.path}
                dense
                icon="file-text"
                title={n.basename}
                note={n.path}
                onClick={() => {
                  if (openProject) void addNote(openProject, n.path);

                  setPickingNote(false);
                  setNoteQuery("");
                }}
              />
            ))}
            {noteHits.length === 0 && (
              <SheetNote>{tr("No note matches that.")}</SheetNote>
            )}
          </SheetGroup>
        </>
      )}

      {level === "notes" && (
        <SheetGroup>
          {(openProject?.sources ?? []).map((path) => (
            <SheetRow
              key={path}
              dense
              icon="file-text"
              title={path.split("/").pop()?.replace(/\.md$/i, "") ?? path}
              note={path}
              action={{
                icon: "x",
                label: tr("Remove {path}", { path }),
                onClick: () => {
                  if (openProject) void removeNote(openProject, path);
                },
              }}
              onClick={() => openNote(path)}
            />
          ))}
          {(openProject?.sources ?? []).length === 0 && (
            <SheetNote>
              {tr(
                "No notes yet. What you add here goes in as context on every new chat in this project."
              )}
            </SheetNote>
          )}
          <SheetRow
            icon="plus"
            badge
            chevron
            title={tr("Add a note")}
            onClick={() => {
              setNoteQuery("");
              setPickingNote(true);
            }}
          />
        </SheetGroup>
      )}

      {level === "project" && openProject && (

        <div className="corvus-sheet-stack">
          {}
          {}
          <div className="corvus-info-pills">
            <span className="corvus-info-pill">
              <Icon name="hard-drive" size={14} />
              <span>
                {tr("Lives in this vault · since {date}", {
                  date: openProject.createdAt.slice(0, 10),
                })}
              </span>
            </span>
          </div>

          {}
          <p className="corvus-boxnote">
            {openProject.sources.length === 0
              ? tr(
                  "Pick the notes this project is about. They go in as context every time you start a chat here."
                )
              : openProject.sources.length === 1
                ? tr("1 note goes in as context on every new chat here.")
                : tr("{n} notes go in as context on every new chat here.", {
                    n: openProject.sources.length,
                  })}
          </p>

          {}
          <div className="corvus-duo">
            <button
              type="button"
              className="corvus-duo-card"
              onClick={() => setShowingNotes(true)}
            >
              <span className="corvus-duo-title">{tr("Project notes")}</span>
              <span className="corvus-duo-note">
                {openProject.sources.length === 0
                  ? tr("Nothing yet")
                  : openProject.sources.length === 1
                    ? tr("1 note")
                    : tr("{n} notes", { n: openProject.sources.length })}
              </span>
              <span className="corvus-duo-action">
                {openProject.sources.length === 0 ? tr("Add notes") : tr("See notes")}
              </span>
            </button>
            <button
              type="button"
              className="corvus-duo-card"
              onClick={() => setInstructionsDraft(openProject.instructions ?? "")}
            >
              <span className="corvus-duo-title">{tr("Custom instructions")}</span>
              <span className="corvus-duo-note">
                {openProject.instructions?.trim()
                  ? openProject.instructions.trim().split("\n")[0]
                  : tr("Nothing yet")}
              </span>
              <span className="corvus-duo-action">
                {openProject.instructions?.trim()
                  ? tr("Edit")
                  : tr("Add instructions")}
              </span>
            </button>
          </div>

          {chats.filter((c) => openProject.chatIds.includes(c.id)).length > 0 ? (
            <>
              {}
              <span className="corvus-sheet-group-label">{tr("Chats")}</span>
              <ChatList
                plugin={plugin}
                session={session}
                chats={chats.filter((c) => openProject.chatIds.includes(c.id))}
                onOpen={onOpenChat}
              />
            </>
          ) : (
            <div className="corvus-home-empty">
              <Icon name="message-circle" size={42} />
              <p>{tr("Ask anything. Chats in this project show up here.")}</p>
            </div>
          )}

        </div>
      )}

      {level === "list" && (
        <div className="corvus-sheet-stack">
          {projects.length > 0 ? (
            <div className="corvus-proj-cards">
              {projects.map((p) => {
                const info = summarizeProject(p, chats);
                const alreadyHere = !!pickFor && p.chatIds.includes(pickFor);
                return (
                <div key={p.id} className="corvus-proj-card-wrap">
                  <button
                    type="button"
                    className="corvus-proj-card"
                    onClick={() => {

                      if (pickFor) {
                        void update((prev) =>
                          prev.map((x) =>
                            x.id === p.id && !x.chatIds.includes(pickFor)
                              ? { ...x, chatIds: [pickFor, ...x.chatIds] }
                              : x
                          )
                        );
                        new Notice(tr("Added to {name}.", { name: p.name }));
                        onPicked?.();
                        return;
                      }
                      setOpenId(p.id);
                    }}
                  >
                    <span className="corvus-proj-card-head">
                      <span
                        className="corvus-thing-mark is-big"
                        style={{ color: projectColor(p.color) }}
                        aria-hidden="true"
                      >
                        <Icon name={p.icon} size={22} />
                      </span>
                      <span className="corvus-proj-card-title">
                        {}
                        <span className="corvus-proj-card-top">
                          <span className="corvus-proj-card-name">{p.name}</span>
                          <span
                            className={
                              alreadyHere
                                ? "corvus-proj-card-when is-here"
                                : "corvus-proj-card-when"
                            }
                          >
                            {alreadyHere ? tr("Already here") : info.when}
                          </span>
                        </span>
                        {}
                        <span
                          className={
                            info.about
                              ? "corvus-proj-card-about"
                              : "corvus-proj-card-about is-empty"
                          }
                        >
                          {info.about ?? tr("No instructions yet")}
                        </span>
                      </span>
                    </span>
                    <span className="corvus-proj-card-meta">
                      <span className="corvus-proj-card-stat">
                        <Icon name="file-text" size={14} />
                        {p.sources.length === 1
                          ? tr("1 note")
                          : tr("{n} notes", { n: p.sources.length })}
                      </span>
                      <span className="corvus-proj-card-stat">
                        <Icon name="message-circle" size={14} />
                        {info.chatCount === 1
                          ? tr("1 chat")
                          : tr("{n} chats", { n: info.chatCount })}
                      </span>
                      {}
                      {tokensByProject[p.id] !== undefined && (
                        <span
                          className="corvus-proj-card-stat"
                          title={tr(
                            "Input tokens each new chat here starts with: the instructions plus the full text of its notes."
                          )}
                        >
                          {}
                          <Icon name="arrow-up-from-line" size={14} />
                          {formatTokens(tokensByProject[p.id])}
                        </span>
                      )}
                    </span>
                  </button>
                  {!pickFor && (
                  <button
                    type="button"
                    className="corvus-icon-btn corvus-proj-card-more"
                    aria-label={tr("Actions for {name}", { name: p.name })}
                    onClick={(e) =>

                      openActions(e, projectActions(p))
                    }
                  >
                    <Icon name="more-horizontal" size={18} />
                  </button>
                  )}
                </div>
                );
              })}
            </div>
          ) : (
            <div className="corvus-home-empty">
              <Icon name="folder-open" size={42} />
              <p>
                {tr(
                  "A project keeps notes and chats about the same thing together. Its notes go in as context every time you start a chat there."
                )}
              </p>
            </div>
          )}

        </div>
      )}
    </Sheet>
  );
}

function SheetDefaultSize() {
  useSheetDefault();
  return null;
}

function useInputTokens(
  plugin: CorvusPlugin,
  projects: readonly Project[],
  enabled: boolean
): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void (async () => {
      const out: Record<string, number> = {};
      for (const p of projects) {
        const notes: { path: string; content: string }[] = [];
        for (const path of p.sources) {
          const f = plugin.app.vault.getAbstractFileByPath(path);
          if (!(f instanceof TFile)) continue;
          try {
            notes.push({
              path,
              content: await plugin.app.vault.cachedRead(f),
            });
          } catch { void 0; }
        }
        out[p.id] = projectInputTokens(p.instructions, notes);
      }
      if (alive) setCounts(out);
    })();
    return () => {
      alive = false;
    };
  }, [plugin, projects, enabled]);
  return counts;
}
