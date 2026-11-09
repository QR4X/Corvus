import { useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import { Notice, TFile, normalizePath } from "obsidian";
import type CorvusPlugin from "../main";
import type { Skill } from "../skills/skills";
import {
  SKILL_DRAFT_VAZIO,
  skillFileName,
  skillMarkdown,
  skillProblema,
  type SkillDraft,
} from "../skills/skillFile";
import { ensureFolder } from "../core/chatPersistence";
import { ConfirmModal } from "./modals";
import { Icon } from "./Icon";
import { Sheet, SheetSearch, useSheetFull } from "./Sheet";
import { Segmented } from "./Segmented";
import { projectColor } from "../projects";
import { SheetProgress, SheetSubmit, SheetWizardFoot } from "./SheetForm";
import { peDoWizard } from "./wizard";
import { SkillForm, PASSOS_SKILL } from "./SkillSheet";
import { openActions } from "./menu";
import { MODULES, relativeShort } from "./modules";
import { CHAT_MODES, isChatMode } from "../core/session";
import { mark, tr } from "../i18n/tr";

const ABAS: Array<{ id: string; label: string }> = [
  { id: "all", label: mark("All") },
  ...CHAT_MODES.map((m) => ({ id: m, label: MODULES[m].short })),
];

export function SkillsView({
  plugin,
  open,
  onUse,
  onClose,
}: {
  plugin: CorvusPlugin;
  open: boolean;
  onUse: (skill: Skill) => void;
  onClose: () => void;
}) {
  const [, force] = useReducer((n: number) => n + 1, 0);
  const [query, setQuery] = useState("");
  const [aba, setAba] = useState("all");
  const [draft, setDraft] = useState<SkillDraft | null>(null);

  const [editandoPath, setEditandoPath] = useState<string | null>(null);

  const [passo, setPasso] = useState(0);

  const [procurando, setProcurando] = useState(false);

  useEffect(() => {
    if (!open) return;
    void plugin.reloadSkills().then(() => force());
    return plugin.onSettingsChange(force);
  }, [plugin, open]);

  const skills = plugin.skills;
  const folder = plugin.settings.skillsPath || "corvus-ai/skills";

  const visiveis = useMemo(() => {
    const q = query.trim().toLowerCase();

    const noModo =
      aba === "all" ? skills : skills.filter((s) => (s.mode ?? "") === aba);
    if (!q) return noModo;
    return noModo.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.body.toLowerCase().includes(q)
    );
  }, [skills, query, aba]);

  const problema = draft
    ? skillProblema(
        draft,
        skills.map((s) => s.path),
        editandoPath ?? undefined
      )
    : null;

  const abrirNota = (path: string) => {
    const f = plugin.app.vault.getAbstractFileByPath(path);
    if (f instanceof TFile) void plugin.app.workspace.getLeaf(true).openFile(f);
    else new Notice(tr("Not found: {path}", { path }));
  };

  const criar = () => {
    setEditandoPath(null);
    setPasso(0);
    setProcurando(false);
    setDraft(SKILL_DRAFT_VAZIO);
  };

  const editar = (s: Skill) => {
    setEditandoPath(s.path);
    setProcurando(false);
    setDraft({
      name: s.name,
      description: s.description,
      icon: s.icon,
      color: s.color,
      mode: s.mode ?? "",
      body: s.body,
    });
  };

  const fecharNivel = () => {
    setDraft(null);
    setEditandoPath(null);
    setProcurando(false);
    setPasso(0);
  };

  const salvar = async () => {
    if (!draft || problema) return;
    const alvo = normalizePath(`${folder}/${skillFileName(draft.name)}`);
    const conteudo = skillMarkdown(draft);
    try {
      await ensureFolder(plugin.app.vault.adapter, folder);
      const antigo = editandoPath
        ? plugin.app.vault.getAbstractFileByPath(editandoPath)
        : null;
      if (antigo instanceof TFile) {

        if (antigo.path !== alvo) {
          await plugin.app.fileManager.renameFile(antigo, alvo);
        }
        const arquivo = plugin.app.vault.getAbstractFileByPath(alvo);

        if (arquivo instanceof TFile) {
          await plugin.app.vault.modify(arquivo, conteudo);
        }
      } else {
        await plugin.app.vault.create(alvo, conteudo);
      }
      await plugin.reloadSkills();
      fecharNivel();
      force();
    } catch (err) {
      new Notice(
        tr("Could not save the skill: {error}", {
          error: err instanceof Error ? err.message : String(err),
        })
      );
    }
  };

  const apagar = async (s: Skill) => {
    const ok = await new ConfirmModal(plugin.app, {
      title: tr("Delete \"{name}\"?", { name: s.name }),
      body: tr("The note goes to the trash — you can get it back from there."),
      confirmLabel: tr("Delete"),
      danger: true,
    }).openAndWait();
    if (!ok) return;
    const f = plugin.app.vault.getAbstractFileByPath(s.path);
    if (f) await plugin.app.fileManager.trashFile(f);
    await plugin.reloadSkills();
    force();
  };

  const exemplos = async () => {
    const n = await plugin.seedExampleSkills();
    new Notice(
      n === 1
        ? tr("1 example skill created.")
        : n > 1
          ? tr("{n} example skills created.", { n })
          : tr("The examples are already here.")
    );
    force();
  };

  const noFormulario = draft !== null;

  const criando = noFormulario && editandoPath === null;

  const rodape = procurando ? (

    undefined
  ) : criando ? (
    <SheetWizardFoot
      atual={passo}
      total={PASSOS_SKILL.length}
      onPasso={setPasso}
      problema={problema}
      label={tr("Create skill")}
      onSubmit={() => void salvar()}
    />
  ) : noFormulario ? (
    <SheetSubmit
      label={tr("Save skill")}
      problema={problema}
      onSubmit={() => void salvar()}
    />
  ) : undefined;

  return (
    <Sheet
      footer={rodape}

      progress={
        criando && !procurando ? (
          <SheetProgress atual={passo} total={PASSOS_SKILL.length} />
        ) : undefined
      }

      action={
        noFormulario
          ? undefined
          : {
              icon: "plus",
              label: tr("New skill"),
              text: tr("New"),
              onClick: criar,
            }
      }

      title={
        criando
          ? 

            tr("New skill · {step}", { step: tr(PASSOS_SKILL[passo].label) })
          : noFormulario
            ? tr("Edit skill")
            : tr("Skills")
      }
      open={open}
      onClose={() => {
        fecharNivel();
        onClose();
      }}

      onBack={
        !noFormulario
          ? undefined
          : criando &&
              peDoWizard({ atual: passo, total: PASSOS_SKILL.length }).voltar ===
                "passo"
            ? () => setPasso(passo - 1)
            : fecharNivel
      }

      startFull

      focusOnOpen={false}
    >
      {noFormulario ? (
        <SkillForm
          draft={draft ?? SKILL_DRAFT_VAZIO}
          focar={noFormulario}
          onDraft={setDraft}
          plugin={plugin}
          passo={criando ? PASSOS_SKILL[passo].id : undefined}
          procurando={procurando}
          onProcurar={setProcurando}
        />
      ) : (

        <ListaCheia>
        <div className="corvus-sheet-stack">
          {}
          {skills.length > 0 && (
            <Segmented
              label={tr("Filter skills by mode")}
              value={aba}
              onChange={setAba}

              options={ABAS.map((a) => ({
                id: a.id,
                label: a.id === "all" ? tr(a.label) : a.label,
              }))}
            />
          )}

          {}
          <SheetSearch
            value={query}
            placeholder={tr("Search skills")}
            found={visiveis.length}
            onChange={setQuery}
          />

          {visiveis.length > 0 && (
            <div className="corvus-tiles">
              {visiveis.map((s) => (
                <div key={s.id} className="corvus-tile-wrap">
                  <button
                    type="button"
                    className="corvus-tile"
                    onClick={() => onUse(s)}
                  >
                    {}
                    <span className="corvus-tile-paper">
                      <span className="corvus-tile-text">{s.body}</span>
                    </span>
                    {}
                    <span className="corvus-tile-head">
                      <span
                        className="corvus-thing-mark is-dense"
                        style={{ color: projectColor(s.color) }}
                        aria-hidden="true"
                      >
                        {}
                        <Icon name={s.icon || "sparkles"} size={14} />
                      </span>
                      <span className="corvus-tile-name">{s.name}</span>
                    </span>
                    <span className="corvus-tile-meta">
                      <Icon
                        name={
                          isChatMode(s.mode) ? MODULES[s.mode].icon : "sparkles"
                        }
                        size={16}
                      />
                      <span>
                        {s.mtime
                          ? tr("Edited {time}", {
                              time: relativeShort(
                                new Date(s.mtime).toISOString()
                              ),
                            })
                          : s.description || tr("Prompt")}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="corvus-icon-btn corvus-tile-more"
                    aria-label={tr("Actions for {name}", { name: s.name })}
                    onClick={(e) =>
                      openActions(e, [
                        {
                          label: tr("Use"),
                          icon: "corner-down-left",
                          run: () => onUse(s),
                        },
                        {
                          label: tr("Edit"),
                          icon: "pencil",
                          run: () => editar(s),
                        },
                        {
                          label: tr("Open note"),
                          icon: "file-text",
                          run: () => abrirNota(s.path),
                        },
                        {
                          label: tr("Delete"),
                          icon: "trash-2",
                          danger: true,
                          run: () => void apagar(s),
                        },
                      ])
                    }
                  >
                    <Icon name="more-horizontal" size={18} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {visiveis.length === 0 && (
            <div className="corvus-home-empty">
              <Icon name="sparkles" size={42} />
              <p>
                {skills.length > 0
                  ? tr("Nothing matches that.")
                  : tr(
                      "A skill is a prompt you keep. Write it once, use it in one tap — here, in the composer’s +, or by typing / in any chat."
                    )}
              </p>
              {skills.length === 0 && (
                <button
                  type="button"
                  className="corvus-home-pill"
                  onClick={() => void exemplos()}
                >
                  <Icon name="wand" size={18} />
                  <span>{tr("Start with three examples")}</span>
                </button>
              )}
            </div>
          )}

        </div>
        </ListaCheia>
      )}
    </Sheet>
  );
}

function ListaCheia({ children }: { children: ReactNode }) {
  useSheetFull();
  return <>{children}</>;
}
