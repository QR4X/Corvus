import { useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import { Notice, TFile, normalizePath } from "obsidian";
import type CorvusPlugin from "../main";
import type { Skill } from "../skills/skills";
import {
  EMPTY_SKILL_DRAFT,
  skillFileName,
  skillMarkdown,
  skillProblem,
  type SkillDraft,
} from "../skills/skillFile";
import { ensureFolder } from "../core/vaultFs";
import { SKILLS_FOLDER } from "../core/vaultPaths";
import { ConfirmModal } from "./modals";
import { Icon } from "./Icon";
import { Sheet, SheetSearch, useSheetFull } from "./Sheet";
import { Segmented } from "./Segmented";
import { projectColor } from "../projects";
import { SheetProgress, SheetSubmit, SheetWizardFoot } from "./SheetForm";
import { wizardFoot } from "./wizard";
import { SkillForm, SKILL_STEPS } from "./SkillSheet";
import { openActions } from "./menu";
import { MODULES, relativeShort } from "./modules";
import { CHAT_MODES, isChatMode } from "../core/session";
import { mark, tr } from "../i18n/tr";

const TABS: Array<{ id: string; label: string }> = [
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
  const [tab, setTab] = useState("all");
  const [draft, setDraft] = useState<SkillDraft | null>(null);

  const [editingPath, setEditingPath] = useState<string | null>(null);

  const [step, setStep] = useState(0);

  const [browsing, setBrowsing] = useState(false);

  useEffect(() => {
    if (!open) return;
    void plugin.reloadSkills().then(() => force());
    return plugin.onSettingsChange(force);
  }, [plugin, open]);

  const skills = plugin.skills;
  const folder = plugin.settings.skillsPath || SKILLS_FOLDER;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();

    const inMode =
      tab === "all" ? skills : skills.filter((s) => (s.mode ?? "") === tab);
    if (!q) return inMode;
    return inMode.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.body.toLowerCase().includes(q)
    );
  }, [skills, query, tab]);

  const problem = draft
    ? skillProblem(
        draft,
        skills.map((s) => s.path),
        editingPath ?? undefined
      )
    : null;

  const openNote = (path: string) => {
    const f = plugin.app.vault.getAbstractFileByPath(path);
    if (f instanceof TFile) void plugin.app.workspace.getLeaf(true).openFile(f);
    else new Notice(tr("Not found: {path}", { path }));
  };

  const startCreate = () => {
    setEditingPath(null);
    setStep(0);
    setBrowsing(false);
    setDraft(EMPTY_SKILL_DRAFT);
  };

  const startEdit = (s: Skill) => {
    setEditingPath(s.path);
    setBrowsing(false);
    setDraft({
      name: s.name,
      description: s.description,
      icon: s.icon,
      color: s.color,
      mode: s.mode ?? "",
      body: s.body,
    });
  };

  const closeForm = () => {
    setDraft(null);
    setEditingPath(null);
    setBrowsing(false);
    setStep(0);
  };

  const save = async () => {
    if (!draft || problem) return;
    const targetPath = normalizePath(`${folder}/${skillFileName(draft.name)}`);
    const content = skillMarkdown(draft);
    try {
      await ensureFolder(plugin.app.vault.adapter, folder);
      const existing = editingPath
        ? plugin.app.vault.getAbstractFileByPath(editingPath)
        : null;
      if (existing instanceof TFile) {

        if (existing.path !== targetPath) {
          await plugin.app.fileManager.renameFile(existing, targetPath);
        }
        const file = plugin.app.vault.getAbstractFileByPath(targetPath);

        if (file instanceof TFile) {
          await plugin.app.vault.modify(file, content);
        }
      } else {
        await plugin.app.vault.create(targetPath, content);
      }
      await plugin.reloadSkills();
      closeForm();
      force();
    } catch (err) {
      new Notice(
        tr("Could not save the skill: {error}", {
          error: err instanceof Error ? err.message : String(err),
        })
      );
    }
  };

  const deleteSkill = async (s: Skill) => {
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

  const seedExamples = async () => {
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

  const inForm = draft !== null;

  const creating = inForm && editingPath === null;

  const footer = browsing ? (

    undefined
  ) : creating ? (
    <SheetWizardFoot
      current={step}
      total={SKILL_STEPS.length}
      onStep={setStep}
      problem={problem}
      label={tr("Create skill")}
      onSubmit={() => void save()}
    />
  ) : inForm ? (
    <SheetSubmit
      label={tr("Save skill")}
      problem={problem}
      onSubmit={() => void save()}
    />
  ) : undefined;

  return (
    <Sheet
      footer={footer}

      progress={
        creating && !browsing ? (
          <SheetProgress current={step} total={SKILL_STEPS.length} />
        ) : undefined
      }

      action={
        inForm
          ? undefined
          : {
              icon: "plus",
              label: tr("New skill"),
              text: tr("New"),
              onClick: startCreate,
            }
      }

      title={
        creating
          ? 

            tr("New skill · {step}", { step: tr(SKILL_STEPS[step].label) })
          : inForm
            ? tr("Edit skill")
            : tr("Skills")
      }
      open={open}
      onClose={() => {
        closeForm();
        onClose();
      }}

      onBack={
        !inForm
          ? undefined
          : creating &&
              wizardFoot({ current: step, total: SKILL_STEPS.length }).back ===
                "step"
            ? () => setStep(step - 1)
            : closeForm
      }

      startFull

      focusOnOpen={false}
    >
      {inForm ? (
        <SkillForm
          draft={draft ?? EMPTY_SKILL_DRAFT}
          focus={inForm}
          onDraft={setDraft}
          plugin={plugin}
          step={creating ? SKILL_STEPS[step].id : undefined}
          browsing={browsing}
          onBrowse={setBrowsing}
        />
      ) : (

        <FullList>
        <div className="corvus-sheet-stack">
          {}
          {skills.length > 0 && (
            <Segmented
              label={tr("Filter skills by mode")}
              value={tab}
              onChange={setTab}

              options={TABS.map((a) => ({
                id: a.id,
                label: a.id === "all" ? tr(a.label) : a.label,
              }))}
            />
          )}

          {}
          <SheetSearch
            value={query}
            placeholder={tr("Search skills")}
            found={visible.length}
            onChange={setQuery}
          />

          {visible.length > 0 && (
            <div className="corvus-tiles">
              {visible.map((s) => (
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
                          run: () => startEdit(s),
                        },
                        {
                          label: tr("Open note"),
                          icon: "file-text",
                          run: () => openNote(s.path),
                        },
                        {
                          label: tr("Delete"),
                          icon: "trash-2",
                          danger: true,
                          run: () => void deleteSkill(s),
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

          {visible.length === 0 && (
            <div className="corvus-home-empty">
              <Icon name="sparkles" size={42} />
              <p>
                {skills.length > 0
                  ? tr("Nothing matches that.")
                  : tr(
                      "A skill is a saved prompt. Write once, then use it with + or / in any chat."
                    )}
              </p>
              {skills.length === 0 && (
                <button
                  type="button"
                  className="corvus-home-pill"
                  onClick={() => void seedExamples()}
                >
                  <Icon name="wand" size={18} />
                  <span>{tr("Start with three examples")}</span>
                </button>
              )}
            </div>
          )}

        </div>
        </FullList>
      )}
    </Sheet>
  );
}

function FullList({ children }: { children: ReactNode }) {
  useSheetFull();
  return <>{children}</>;
}
