import { useEffect, useMemo, useReducer, useState } from "react";
import { Notice, TFile } from "obsidian";
import type CorvusPlugin from "../main";
import type { ChatSession } from "../core/session";
import {
  makeProjectId,
  nomeDaCopia,
  projectColor,
  projectProblema,
  PROJECT_DRAFT_VAZIO,
  type Project,
  type ProjectDraft,
} from "../projects";
import { ChatList, useChatSummaries } from "./ChatList";
import {
  formatarTokens,
  resumoDoProjeto,
  tokensDeEntrada,
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
  EXTRAS_VAZIOS,
  PASSOS_PROJETO,
  ProjectForm,
  type ExtrasProjeto,
} from "./ProjectSheet";
import { peDoWizard } from "./wizard";
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
import { AssistantPanel, ComAssistente, useRun } from "./AssistantPanel";
import { limparRun } from "../assistant/store";
import { useAssistant } from "./useAssistant";
import type { MenuAction } from "./menu";
import { tr } from "../i18n/tr";

export function ProjectsView({
  plugin,
  session,
  open,
  abertoId,
  onAbrir,
  chatPendente,
  onChatPendente,
  escolhaPara,
  onEscolha,
  onOpenChat,
  onClose,
}: {
  plugin: CorvusPlugin;
  session: ChatSession;
  open: boolean;

  abertoId: string | null;
  onAbrir: (id: string | null) => void;

  chatPendente?: string | null;
  onChatPendente?: (id: string | null) => void;

  escolhaPara?: string | null;
  onEscolha?: () => void;
  onOpenChat: () => void;
  onClose: () => void;
}) {
  const [, force] = useReducer((n: number) => n + 1, 0);
  const setAbertoId = onAbrir;
  const [draft, setDraft] = useState<ProjectDraft | null>(null);

  const [editandoId, setEditandoId] = useState<string | null>(null);

  const [passo, setPasso] = useState(0);

  const [procurando, setProcurando] = useState(false);

  const [vendoNotas, setVendoNotas] = useState(false);
  const [escolhendo, setEscolhendo] = useState(false);
  const [noteQuery, setNoteQuery] = useState("");

  const [instrucoes, setInstrucoes] = useState<string | null>(null);

  const [ajudandoInstrucoes, setAjudandoInstrucoes] = useState(false);
  const { indisponivel, pedirInstrucoes, alvo, modelos, livres, escolherModelo } = useAssistant(plugin);
  const modeloAssist = {
    atual: alvo?.model ?? "",
    opcoes: modelos,
    livres,
    onTrocar: (m: string) => void escolherModelo(m),
  };

  const runInstr = useRun("instructions");
  useEffect(() => {
    if (runInstr.fase !== "pronto" || typeof runInstr.resultado !== "string")
      return;
    setInstrucoes(runInstr.resultado);
    limparRun("instructions");
    setAjudandoInstrucoes(false);
  }, [runInstr.fase, runInstr.resultado]);

  const chats = useChatSummaries(plugin);
  const projects = plugin.settings.projects ?? [];

  const tokensPorProjeto = useTokensDeEntrada(plugin, projects, open);
  const aberto = projects.find((p) => p.id === abertoId) ?? null;

  const update = async (fn: (prev: Project[]) => Project[]) => {
    await session.updateProjects(fn);
    force();
  };

  const criar = () => {
    setEditandoId(null);
    setPasso(0);
    setProcurando(false);
    setExtras(EXTRAS_VAZIOS);
    setDraft(PROJECT_DRAFT_VAZIO);
  };

  const editar = (p: Project) => {
    setEditandoId(p.id);
    setProcurando(false);
    setExtras(EXTRAS_VAZIOS);
    setDraft({ name: p.name, icon: p.icon, color: p.color });
  };

  const [extras, setExtras] = useState<ExtrasProjeto>(EXTRAS_VAZIOS);

  const problema = draft
    ? projectProblema(draft, projects, editandoId ?? undefined)
    : null;

  const salvar = async () => {
    if (!draft || problema) return;
    const nome = draft.name.trim();
    if (editandoId) {
      await update((prev) =>
        prev.map((x) =>
          x.id === editandoId
            ? {
                ...x,
                name: nome,
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
        name: nome,
        icon: draft.icon,
        color: draft.color,
        sources: extras.notes,
        instructions: extras.instructions.trim() || undefined,

        chatIds: chatPendente ? [chatPendente] : [],
        createdAt: new Date().toISOString(),
      };
      await update((prev) => [p, ...prev]);

      setAbertoId(p.id);
      onChatPendente?.(null);
    }
    setDraft(null);
    setEditandoId(null);
    setExtras(EXTRAS_VAZIOS);
    setPasso(0);
    setProcurando(false);
  };

  const apagar = async (p: Project) => {
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
    if (abertoId === p.id) setAbertoId(null);
  };

  const duplicar = async (p: Project) => {
    const copia: Project = {
      ...p,
      id: makeProjectId(),
      name: nomeDaCopia(p.name, projects),
      chatIds: [],
      createdAt: new Date().toISOString(),
    };
    await update((prev) => [copia, ...prev]);
    new Notice(tr("Duplicated as \"{name}\"", { name: copia.name }));
  };

  const exportar = async (p: Project) => {
    try {
      const caminho = await exportProjectToVault(
        plugin.app,
        p,
        chats,
        new Date()
      );
      new Notice(tr("Exported to {path}", { path: caminho }));
    } catch (e) {
      new Notice(
        tr("Could not export: {error}", { error: (e as Error).message })
      );
    }
  };

  const acoesDoProjeto = (p: Project): MenuAction[] => [
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
        setAbertoId(p.id);
        setInstrucoes(p.instructions ?? "");
      },
    },
    {
      label: tr("Notes"),
      icon: "library",
      run: () => {
        setAbertoId(p.id);
        setVendoNotas(true);
      },
    },
    { label: tr("Edit"), icon: "pencil", run: () => editar(p) },
    { label: tr("Duplicate"), icon: "copy", run: () => void duplicar(p) },
    {
      label: tr("Export to vault"),
      icon: "download",
      run: () => void exportar(p),
    },
    {
      label: tr("Delete"),
      icon: "trash-2",
      danger: true,
      run: () => void apagar(p),
    },
  ];

  const anexarNota = (p: Project, path: string) =>
    update((prev) =>
      prev.map((x) =>
        x.id === p.id && !x.sources.includes(path)
          ? { ...x, sources: [...x.sources, path] }
          : x
      )
    );

  const tirarNota = (p: Project, path: string) =>
    update((prev) =>
      prev.map((x) =>
        x.id === p.id
          ? { ...x, sources: x.sources.filter((s) => s !== path) }
          : x
      )
    );

  const abrirNota = (path: string) => {
    const f = plugin.app.vault.getAbstractFileByPath(path);
    if (f instanceof TFile) void plugin.app.workspace.getLeaf(true).openFile(f);
    else new Notice(tr("Not found: {path}", { path }));
  };

  const notasAchadas = useMemo(() => {
    const todas = rankNotes(vaultNotes(plugin.app), noteQuery);

    return aberto ? todas.filter((n) => !aberto.sources.includes(n.path)) : todas;
  }, [plugin, aberto, noteQuery]);

  const nivel = draft
    ? "form"
    : instrucoes !== null
      ? "instrucoes"
      : escolhendo
        ? "escolher"
        : vendoNotas
          ? "notas"
          : aberto
            ? "projeto"
            : "lista";

  const criando = nivel === "form" && editandoId === null;

  const TITULOS: Record<string, string> = {

    form: editandoId
      ? tr("Edit project")
      : tr("New project · {step}", { step: tr(PASSOS_PROJETO[passo].label) }),
    instrucoes: tr("Custom instructions"),
    escolher: tr("Add a note"),
    notas: tr("Project notes"),
    projeto: aberto?.name ?? tr("Project"),
    lista: escolhaPara ? tr("Add to project") : tr("Projects"),
  };

  const voltar: Record<string, (() => void) | undefined> = {

    form: () => {
      if (
        criando &&
        peDoWizard({ atual: passo, total: PASSOS_PROJETO.length }).voltar ===
          "passo"
      ) {
        setPasso(passo - 1);
        return;
      }
      setDraft(null);
      setEditandoId(null);
      setExtras(EXTRAS_VAZIOS);
      setPasso(0);
      setProcurando(false);
    },
    instrucoes: () => {
      setInstrucoes(null);
      setAjudandoInstrucoes(false);
    },
    escolher: () => setEscolhendo(false),
    notas: () => setVendoNotas(false),
    projeto: () => setAbertoId(null),
    lista: undefined,
  };

  const fecharTudo = () => {
    setDraft(null);
    setEditandoId(null);
    setExtras(EXTRAS_VAZIOS);
    setPasso(0);
    setProcurando(false);
    setInstrucoes(null);
    setEscolhendo(false);
    setVendoNotas(false);
    setNoteQuery("");
    onClose();
  };

  const salvarInstrucoes = () => {
    const alvo = aberto;
    const texto = (instrucoes ?? "").trim();
    if (alvo) {
      void update((prev) =>
        prev.map((x) =>
          x.id === alvo.id ? { ...x, instructions: texto || undefined } : x
        )
      );
    }
    setInstrucoes(null);
  };

  const rodape =
    nivel === "form" ? (

      procurando ? undefined : criando ? (
        <SheetWizardFoot
          atual={passo}
          total={PASSOS_PROJETO.length}
          onPasso={setPasso}
          problema={problema}
          label={tr("Create project")}
          onSubmit={() => void salvar()}
        />
      ) : (
        <SheetSubmit
          label={tr("Save project")}
          problema={problema}
          onSubmit={() => void salvar()}
        />
      )
    ) : nivel === "instrucoes" ? (
      <SheetSubmit
        label={tr("Save instructions")}
        onSubmit={salvarInstrucoes}
      />
    ) : nivel === "projeto" && aberto ? (
      <div className="corvus-sheet-foot">
        {}
        <button
          type="button"
          className="corvus-home-filter"
          onClick={(e) =>
            openActions(e, acoesDoProjeto(aberto))
          }
        >
          <Icon name="settings-2" size={16} />
          <span>{tr("Project settings")}</span>
        </button>
        <button
          type="button"
          className="corvus-sheet-cta"
          onClick={() => {
            void session.newChatInProject(aberto);
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
      title={TITULOS[nivel]}
      footer={rodape}
      progress={
        criando && !procurando ? (
          <SheetProgress atual={passo} total={PASSOS_PROJETO.length} />
        ) : undefined
      }

      minSize="mid"

      action={
        nivel === "lista"
          ? {
              icon: "plus",
              label: tr("New project"),
              text: tr("New"),
              onClick: criar,
            }
          : undefined
      }
      mark={
        aberto && nivel !== "lista"
          ? { icon: aberto.icon, color: projectColor(aberto.color) }
          : undefined
      }
      open={open}
      onClose={fecharTudo}
      onBack={voltar[nivel]}

            focusOnOpen={false}
    >
      {nivel === "form" && (
        <ProjectForm
          draft={draft ?? PROJECT_DRAFT_VAZIO}
          focar={nivel === "form"}
          onDraft={setDraft}
          plugin={plugin}
          extras={extras}
          onExtras={setExtras}
          passo={criando ? PASSOS_PROJETO[passo].id : undefined}
          procurando={procurando}
          onProcurar={setProcurando}
        />
      )}

      {}
      {nivel !== "form" && <TamanhoDaCasa />}

      {nivel === "instrucoes" && (
        <>
          <SheetField
            label={tr("Instructions")}
            hint={tr(
              "Sent with every new chat in this project — it adds to how the app already works, it does not replace it."
            )}
          >
            {}
            <ComAssistente
              aberto={ajudandoInstrucoes}
              ocupado={runInstr.fase === "rodando"}
              onAbrir={() => setAjudandoInstrucoes(true)}
              painel={
                <AssistantPanel
                  para="instructions"
                  indisponivel={indisponivel}
                  modelo={modeloAssist}
                  onFechar={() => setAjudandoInstrucoes(false)}
                  onPedir={(_modo, turnos) =>
                    pedirInstrucoes(
                      {
                        name: aberto?.name ?? "",
                        notes: aberto?.sources ?? [],
                        atual: instrucoes ?? "",
                      },
                      turnos
                    )
                  }
                />
              }
            >
              <SheetTextarea
                comSpark
                value={instrucoes ?? ""}
                rows={9}
                placeholder={tr(
                  "Answer in Portuguese.\nCite the note you took it from.\nShort paragraphs, no bullet lists."
                )}
                onChange={setInstrucoes}
              />
            </ComAssistente>
          </SheetField>
        </>
      )}

      {nivel === "escolher" && (
        <>
          <SheetSearch
            value={noteQuery}
            placeholder={tr("Search notes")}
            found={notasAchadas.length}
            autoFocus={nivel === "escolher"}
            onChange={setNoteQuery}
          />
          <SheetGroup>
            {notasAchadas.map((n) => (
              <SheetRow
                key={n.path}
                dense
                icon="file-text"
                title={n.basename}
                note={n.path}
                onClick={() => {
                  if (aberto) void anexarNota(aberto, n.path);

                  setEscolhendo(false);
                  setNoteQuery("");
                }}
              />
            ))}
            {notasAchadas.length === 0 && (
              <SheetNote>{tr("No note matches that.")}</SheetNote>
            )}
          </SheetGroup>
        </>
      )}

      {nivel === "notas" && (
        <SheetGroup>
          {(aberto?.sources ?? []).map((path) => (
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
                  if (aberto) void tirarNota(aberto, path);
                },
              }}
              onClick={() => abrirNota(path)}
            />
          ))}
          {(aberto?.sources ?? []).length === 0 && (
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
              setEscolhendo(true);
            }}
          />
        </SheetGroup>
      )}

      {nivel === "projeto" && aberto && (

        <div className="corvus-sheet-stack">
          {}
          {}
          <div className="corvus-info-pills">
            <span className="corvus-info-pill">
              <Icon name="hard-drive" size={14} />
              <span>
                {tr("Lives in this vault · since {date}", {
                  date: aberto.createdAt.slice(0, 10),
                })}
              </span>
            </span>
          </div>

          {}
          <p className="corvus-boxnote">
            {aberto.sources.length === 0
              ? tr(
                  "Pick the notes this project is about. They go in as context every time you start a chat here."
                )
              : aberto.sources.length === 1
                ? tr("1 note goes in as context on every new chat here.")
                : tr("{n} notes go in as context on every new chat here.", {
                    n: aberto.sources.length,
                  })}
          </p>

          {}
          <div className="corvus-duo">
            <button
              type="button"
              className="corvus-duo-card"
              onClick={() => setVendoNotas(true)}
            >
              <span className="corvus-duo-title">{tr("Project notes")}</span>
              <span className="corvus-duo-note">
                {aberto.sources.length === 0
                  ? tr("Nothing yet")
                  : aberto.sources.length === 1
                    ? tr("1 note")
                    : tr("{n} notes", { n: aberto.sources.length })}
              </span>
              <span className="corvus-duo-action">
                {aberto.sources.length === 0 ? tr("Add notes") : tr("See notes")}
              </span>
            </button>
            <button
              type="button"
              className="corvus-duo-card"
              onClick={() => setInstrucoes(aberto.instructions ?? "")}
            >
              <span className="corvus-duo-title">{tr("Custom instructions")}</span>
              <span className="corvus-duo-note">
                {aberto.instructions?.trim()
                  ? aberto.instructions.trim().split("\n")[0]
                  : tr("Nothing yet")}
              </span>
              <span className="corvus-duo-action">
                {aberto.instructions?.trim()
                  ? tr("Edit")
                  : tr("Add instructions")}
              </span>
            </button>
          </div>

          {chats.filter((c) => aberto.chatIds.includes(c.id)).length > 0 ? (
            <>
              {}
              <span className="corvus-sheet-group-label">{tr("Chats")}</span>
              <ChatList
                plugin={plugin}
                session={session}
                chats={chats.filter((c) => aberto.chatIds.includes(c.id))}
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

      {nivel === "lista" && (
        <div className="corvus-sheet-stack">
          {projects.length > 0 ? (
            <div className="corvus-proj-cards">
              {projects.map((p) => {
                const info = resumoDoProjeto(p, chats);
                const jaAqui = !!escolhaPara && p.chatIds.includes(escolhaPara);
                return (
                <div key={p.id} className="corvus-proj-card-wrap">
                  <button
                    type="button"
                    className="corvus-proj-card"
                    onClick={() => {

                      if (escolhaPara) {
                        void update((prev) =>
                          prev.map((x) =>
                            x.id === p.id && !x.chatIds.includes(escolhaPara)
                              ? { ...x, chatIds: [escolhaPara, ...x.chatIds] }
                              : x
                          )
                        );
                        new Notice(tr("Added to {name}.", { name: p.name }));
                        onEscolha?.();
                        return;
                      }
                      setAbertoId(p.id);
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
                              jaAqui
                                ? "corvus-proj-card-when is-here"
                                : "corvus-proj-card-when"
                            }
                          >
                            {jaAqui ? tr("Already here") : info.quando}
                          </span>
                        </span>
                        {}
                        <span
                          className={
                            info.sobre
                              ? "corvus-proj-card-about"
                              : "corvus-proj-card-about is-empty"
                          }
                        >
                          {info.sobre ?? tr("No instructions yet")}
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
                        {info.conversas === 1
                          ? tr("1 chat")
                          : tr("{n} chats", { n: info.conversas })}
                      </span>
                      {}
                      {tokensPorProjeto[p.id] !== undefined && (
                        <span
                          className="corvus-proj-card-stat"
                          title={tr(
                            "Input tokens each new chat here starts with: the instructions plus the full text of its notes."
                          )}
                        >
                          {}
                          <Icon name="arrow-up-from-line" size={14} />
                          {formatarTokens(tokensPorProjeto[p.id])}
                        </span>
                      )}
                    </span>
                  </button>
                  {!escolhaPara && (
                  <button
                    type="button"
                    className="corvus-icon-btn corvus-proj-card-more"
                    aria-label={tr("Actions for {name}", { name: p.name })}
                    onClick={(e) =>

                      openActions(e, acoesDoProjeto(p))
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

function TamanhoDaCasa() {
  useSheetDefault();
  return null;
}

function useTokensDeEntrada(
  plugin: CorvusPlugin,
  projects: readonly Project[],
  aberta: boolean
): Record<string, number> {
  const [mapa, setMapa] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!aberta) return;
    let vivo = true;
    void (async () => {
      const saida: Record<string, number> = {};
      for (const p of projects) {
        const notas: { path: string; content: string }[] = [];
        for (const caminho of p.sources) {
          const f = plugin.app.vault.getAbstractFileByPath(caminho);
          if (!(f instanceof TFile)) continue;
          try {
            notas.push({
              path: caminho,
              content: await plugin.app.vault.cachedRead(f),
            });
          } catch { void 0; }
        }
        saida[p.id] = tokensDeEntrada(p.instructions, notas);
      }
      if (vivo) setMapa(saida);
    })();
    return () => {
      vivo = false;
    };
  }, [plugin, projects, aberta]);
  return mapa;
}
