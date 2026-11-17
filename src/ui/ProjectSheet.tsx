import { useEffect, useMemo, useState } from "react";
import {
  PROJECT_COLORS,
  PROJECT_ICONS,
  projectColor,
  type ProjectDraft,
} from "../projects";
import { Icon } from "./Icon";
import {
  SheetField,
  SheetIconCatalog,
  SheetIconGrid,
  SheetInput,
  SheetSwatches,
  SheetTextarea,
} from "./SheetForm";
import { SheetGroup, SheetNote, SheetRow, useSheetFit } from "./Sheet";
import type CorvusPlugin from "../main";
import { AssistantPanel, WithAssistant, useRun } from "./AssistantPanel";
import { clearRun } from "../assistant/store";
import type { SuggestedProject } from "../assistant/parse";
import { useAssistant } from "./useAssistant";
import { rankNotes, vaultNotes } from "./notePicker";
import { mark, tr } from "../i18n/tr";

export const PROJECT_STEPS = [
  { id: "name", label: mark("Name") },
  { id: "notes", label: mark("Notes") },
  { id: "instructions", label: mark("Instructions") },
  { id: "color", label: mark("Color") },
  { id: "icon", label: mark("Icon") },
] as const;

type ProjectStep = (typeof PROJECT_STEPS)[number]["id"];

export interface ProjectExtras {
  notes: string[];
  instructions: string;
}

export const EMPTY_EXTRAS: ProjectExtras = { notes: [], instructions: "" };

function mergeUnique(a: readonly string[], b: readonly string[]): string[] {
  return [...new Set([...a, ...b])];
}

const noteName = (path: string) =>
  path.split("/").pop()?.replace(/\.md$/i, "") ?? path;

export function ProjectForm({
  draft,
  focus,
  onDraft,
  plugin,
  extras,
  onExtras,
  step,
  browsing,
  onBrowse,
}: {
  draft: ProjectDraft;
  focus: boolean;
  onDraft: (d: ProjectDraft) => void;
  plugin: CorvusPlugin;
  extras: ProjectExtras;
  onExtras: (e: ProjectExtras) => void;

  step?: ProjectStep;

  browsing: boolean;
  onBrowse: (p: boolean) => void;
}) {
  const set = (patch: Partial<ProjectDraft>) => onDraft({ ...draft, ...patch });
  const tint = projectColor(draft.color);

  const [assisting, setAssisting] = useState<
    "" | "project" | "notes" | "instructions"
  >("");

  const [noteQuery, setNoteQuery] = useState("");
  const {
    unavailable,
    askProject,
    askNotes,
    askInstructions,
    allowVault,
    seesVault,
    target,
    models,
    freeModels,
    chooseModel,
  } = useAssistant(plugin);
  const modelPicker = {
    current: target?.model ?? "",
    options: models,
    freeModels,
    onPick: (m: string) => void chooseModel(m),
  };

  const [allowed, setAllowed] = useState(false);
  const canSeeNotes = seesVault || allowed;

  useSheetFit(!browsing);

  const shows = (p: ProjectStep) =>
    step === undefined
      ? p === "name" || p === "color" || p === "icon"
      : step === p;

  const runProject = useRun("project");
  useEffect(() => {
    if (runProject.phase !== "done" || !runProject.result) return;
    const d = runProject.result as SuggestedProject;
    set({ name: d.name, icon: d.icon, color: d.color });
    onExtras({
      notes: mergeUnique(extras.notes, d.notes),
      instructions: extras.instructions.trim()
        ? extras.instructions
        : d.instructions,
    });
    clearRun("project");
    setAssisting("");
  }, [runProject.phase, runProject.result]);

  const runNotes = useRun("notes");
  useEffect(() => {
    if (runNotes.phase !== "done" || !Array.isArray(runNotes.result))
      return;
    onExtras({
      ...extras,
      notes: mergeUnique(extras.notes, runNotes.result as string[]),
    });
    clearRun("notes");
    setAssisting("");
  }, [runNotes.phase, runNotes.result]);

  const runInstr = useRun("project-instructions");
  useEffect(() => {
    if (runInstr.phase !== "done" || typeof runInstr.result !== "string")
      return;
    onExtras({ ...extras, instructions: runInstr.result });
    clearRun("project-instructions");
    setAssisting("");
  }, [runInstr.phase, runInstr.result]);

  const hits = useMemo(() => {
    if (step !== "notes" || !noteQuery.trim()) return [];
    const picked = new Set(extras.notes);
    return rankNotes(vaultNotes(plugin.app), noteQuery, 30).filter(
      (n) => !picked.has(n.path)
    );
  }, [step, noteQuery, extras.notes, plugin]);

  if (browsing)
    return (
      <SheetIconCatalog
        value={draft.icon}
        tint={tint}
        onBack={() => onBrowse(false)}
        onPick={(icon) => set({ icon })}
      >
        <SheetField label={tr("Color")}>
          <SheetSwatches
            colors={PROJECT_COLORS}
            value={draft.color}
            resolve={projectColor}
            onPick={(color) => set({ color })}
          />
        </SheetField>
      </SheetIconCatalog>
    );

  const noteCount = extras.notes.length;

  return (
    <>
      {}
      <div className="corvus-form-preview">
        <span
          className="corvus-thing-mark"
          style={{ color: tint }}
          aria-hidden="true"
        >
          <Icon name={draft.icon} size={20} />
        </span>
        <span className="corvus-thing-text">
          <span className="corvus-thing-name">
            {draft.name.trim() || tr("Untitled project")}
          </span>
          <span className="corvus-thing-note">
            {noteCount === 0
              ? tr("No notes yet")
              : noteCount === 1
                ? tr("1 note")
                : tr("{n} notes", { n: noteCount })}
            {extras.instructions.trim() ? ` · ${tr("instructions")}` : ""}
          </span>
        </span>
      </div>

      {shows("name") && (
        <SheetField
          label={tr("Name")}
          hint={step ? tr("Or describe it and let ✨ set up the whole project.") : undefined}
        >
          {}
          <WithAssistant
            open={assisting === "project"}
            busy={runProject.phase === "running"}
            onOpen={() => setAssisting("project")}
            panel={
              <AssistantPanel
                target="project"
                unavailable={unavailable}
                modelPicker={modelPicker}
                onClose={() => setAssisting("")}
                onAsk={(mode, turns) => askProject(mode, turns)}
              />
            }
          >
            <SheetInput
              withSpark
              value={draft.name}
              placeholder={tr("Thesis, Client X, Apartment…")}
              autoFocus={focus && (step === undefined || step === "name")}
              onChange={(name) => set({ name })}
            />
          </WithAssistant>
        </SheetField>
      )}

      {shows("notes") && (
        <>
          <SheetField
            label={tr("Notes")}
            hint={tr("What this project should know — they go in as context on every chat started in it.")}
          >
            {}
            <WithAssistant
              title={tr("Find notes for me")}
              open={assisting === "notes"}
              busy={runNotes.phase === "running"}
              onOpen={() => setAssisting("notes")}
              panel={
                <AssistantPanel
                  target="notes"
                  unavailable={unavailable}
                  modelPicker={modelPicker}
                  onClose={() => setAssisting("")}
                  onAsk={(_mode, turns) =>
                    askNotes(
                      {
                        name: draft.name,
                        instructions: extras.instructions,
                        picked: extras.notes,
                      },
                      turns
                    )
                  }
                />
              }
            >
              <SheetInput
                withSpark
                value={noteQuery}
                placeholder={tr("Search notes to add")}
                onChange={setNoteQuery}
              />
            </WithAssistant>
          </SheetField>

          {}
          {!canSeeNotes && (
            <SheetGroup>
              <SheetRow
                icon="eye"
                title={tr("Let ✨ see your note names")}
                note={tr("Only titles and folders — never what is inside a note.")}
                onClick={() => {
                  setAllowed(true);
                  void allowVault();
                }}
              />
            </SheetGroup>
          )}

          {noteQuery.trim() !== "" && (
            <SheetGroup label={tr("In your vault")}>
              {hits.map((n) => (
                <SheetRow
                  key={n.path}
                  dense
                  icon="file-text"
                  title={n.basename}
                  note={n.path}
                  action={{
                    icon: "plus",
                    label: tr("Add {path}", { path: n.path }),
                    onClick: () =>
                      onExtras({ ...extras, notes: mergeUnique(extras.notes, [n.path]) }),
                  }}
                  onClick={() =>
                    onExtras({ ...extras, notes: mergeUnique(extras.notes, [n.path]) })
                  }
                />
              ))}
              {hits.length === 0 && (
                <SheetNote>{tr("No note matches that.")}</SheetNote>
              )}
            </SheetGroup>
          )}

          <SheetGroup label={noteCount ? tr("In this project") : undefined}>
            {extras.notes.map((path) => (
              <SheetRow
                key={path}
                dense
                icon="file-text"
                title={noteName(path)}
                note={path}
                action={{
                  icon: "x",
                  label: tr("Remove {path}", { path }),
                  onClick: () =>
                    onExtras({
                      ...extras,
                      notes: extras.notes.filter((n) => n !== path),
                    }),
                }}
                onClick={() => undefined}
              />
            ))}
            {noteCount === 0 && (
              <SheetNote>
                {tr(
                  "No notes yet. Search above, or tap ✨ to have the assistant find them. You can also skip this and add notes later."
                )}
              </SheetNote>
            )}
          </SheetGroup>
        </>
      )}

      {shows("instructions") && (
        <SheetField
          label={tr("Instructions")}
          hint={tr(
            "Sent with every new chat in this project — it adds to how the app already works, it does not replace it."
          )}
        >
          {}
          <WithAssistant
            open={assisting === "instructions"}
            busy={runInstr.phase === "running"}
            onOpen={() => setAssisting("instructions")}
            panel={
              <AssistantPanel
                target="instructions"
                runKey="project-instructions"
                unavailable={unavailable}
                modelPicker={modelPicker}
                onClose={() => setAssisting("")}
                onAsk={(_mode, turns) =>
                  askInstructions(
                    {
                      name: draft.name,
                      notes: extras.notes,
                      current: extras.instructions,
                    },
                    turns
                  )
                }
              />
            }
          >
            <SheetTextarea
              withSpark
              value={extras.instructions}
              rows={7}
              autoFocus={focus && step === "instructions"}
              placeholder={tr(
                "Answer in Portuguese.\nCite the note you took it from.\nShort paragraphs, no bullet lists."
              )}
              onChange={(instructions) => onExtras({ ...extras, instructions })}
            />
          </WithAssistant>
        </SheetField>
      )}

      {shows("color") && (
        <SheetField label={tr("Color")}>
          <SheetSwatches
            colors={PROJECT_COLORS}
            value={draft.color}
            resolve={projectColor}
            onPick={(color) => set({ color })}
          />
        </SheetField>
      )}

      {shows("icon") && (
        <SheetField label={tr("Icon")}>
          <SheetIconGrid
            icons={PROJECT_ICONS}
            value={draft.icon}
            tint={tint}
            onBrowse={() => onBrowse(true)}
            onPick={(icon) => set({ icon })}
          />
        </SheetField>
      )}
    </>
  );
}
