import { CHAT_MODES } from "../core/session";
import { SKILL_ICONS, type SkillDraft } from "../skills/skillFile";
import { PROJECT_COLORS, projectColor } from "../projects";
import { Icon } from "./Icon";
import { MODULES } from "./modules";
import {
  SheetChoices,
  SheetField,
  SheetIconCatalog,
  SheetIconGrid,
  SheetInput,
  SheetSwatches,
  SheetTextarea,
} from "./SheetForm";
import { useEffect, useState } from "react";
import type CorvusPlugin from "../main";
import { AssistantPanel, WithAssistant, useRun } from "./AssistantPanel";
import { useSheetFit } from "./Sheet";
import { clearRun } from "../assistant/store";
import { useAssistant } from "./useAssistant";
import { mark, tr } from "../i18n/tr";

export const SKILL_STEPS = [
  { id: "body", label: mark("Prompt") },
  { id: "name", label: mark("Name") },
  { id: "description", label: mark("Description") },
  { id: "mode", label: mark("Opens in") },
  { id: "color", label: mark("Color") },
  { id: "icon", label: mark("Icon") },
] as const;

type SkillStep = (typeof SKILL_STEPS)[number]["id"];

export function SkillForm({
  draft,
  focus,
  onDraft,
  plugin,
  step,
  browsing,
  onBrowse,
}: {
  draft: SkillDraft;

  focus: boolean;
  onDraft: (d: SkillDraft) => void;
  plugin: CorvusPlugin;

  step?: SkillStep;

  browsing: boolean;
  onBrowse: (p: boolean) => void;
}) {
  const set = (patch: Partial<SkillDraft>) => onDraft({ ...draft, ...patch });

  useSheetFit(!browsing);

  const [assisting, setAssisting] = useState<"" | "body" | "desc">("");
  const { unavailable, askSkill, askDescription, target, models, freeModels, chooseModel } = useAssistant(plugin);
  const modelPicker = {
    current: target?.model ?? "",
    options: models,
    freeModels,
    onPick: (m: string) => void chooseModel(m),
  };

  const runBody = useRun("skill");
  const runDesc = useRun("description");

  useEffect(() => {
    if (runBody.phase !== "done" || !runBody.result) return;
    set(runBody.result);
    clearRun("skill");
    setAssisting("");
  }, [runBody.phase, runBody.result]);

  useEffect(() => {
    if (runDesc.phase !== "done" || typeof runDesc.result !== "string")
      return;
    set({ description: runDesc.result });
    clearRun("description");
    setAssisting("");
  }, [runDesc.phase, runDesc.result]);
  const tint = projectColor(draft.color);

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

  const shows = (p: SkillStep) => step === undefined || step === p;

  return (
    <>
      {}
      <div className="corvus-form-preview">
        <span
          className="corvus-thing-mark"
          style={{ color: tint }}
          aria-hidden="true"
        >
          <Icon name={draft.icon || "sparkles"} size={20} />
        </span>
        <span className="corvus-thing-text">
          <span className="corvus-thing-name">
            {draft.name.trim() || tr("Untitled skill")}
          </span>
          <span className="corvus-thing-note">
            {draft.description.trim() ||
              (draft.body.trim()
                ? draft.body.trim().split("\n")[0]
                : tr("No prompt yet"))}
          </span>
        </span>
      </div>

      {shows("name") && (
        <SheetField
          label={tr("Name")}
          hint={step ? tr("How you'll find it in the list.") : undefined}
        >
          <SheetInput
            value={draft.name}
            placeholder={tr("Weekly review")}

            autoFocus={focus}
            onChange={(name) => set({ name })}
          />
        </SheetField>
      )}

      {}
      {shows("body") && (
      <SheetField
        label={tr("Prompt")}
        hint={tr("What gets written for you when you use the skill.")}
      >
        {}
        <WithAssistant
          open={assisting === "body"}
          busy={runBody.phase === "running"}
          onOpen={() => setAssisting("body")}
          panel={
            <AssistantPanel
              target="skill"
              unavailable={unavailable}
              modelPicker={modelPicker}
              onClose={() => setAssisting("")}
              onAsk={(mode, turns) => askSkill(mode, turns)}
            />
          }
        >
          <SheetTextarea
            withSpark
            value={draft.body}

            rows={7}
            autoFocus={focus && step === "body"}
            placeholder={tr(
              "Go through this week's notes and tell me:\n- what moved\n- what stalled\n- what I should drop"
            )}
            onChange={(body) => set({ body })}
          />
        </WithAssistant>
      </SheetField>
      )}

      {shows("description") && (
      <SheetField
        label={tr("Description")}
        hint={tr("One line, shown in the list.")}
      >
        {}
        <WithAssistant
          open={assisting === "desc"}
          busy={runDesc.phase === "running"}
          onOpen={() => setAssisting("desc")}
          panel={
            <AssistantPanel
              target="description"
              unavailable={unavailable}
              modelPicker={modelPicker}
              onClose={() => setAssisting("")}
              onAsk={(_mode, turns) =>
                askDescription({ name: draft.name, body: draft.body }, turns)
              }
            />
          }
        >
          <SheetInput
            withSpark
            value={draft.description}
            autoFocus={focus && step === "description"}
            placeholder={tr("Optional")}
            onChange={(description) => set({ description })}
          />
        </WithAssistant>
      </SheetField>
      )}

      {}
      {shows("mode") && (
      <SheetField
        label={tr("Opens in")}
        hint={tr("Using the skill switches to this mode.")}
      >
        <SheetChoices
          label={tr("Mode")}
          value={draft.mode}
          onPick={(mode) => set({ mode })}
          items={[
            { id: "", label: tr("Wherever I am") },
            ...CHAT_MODES.map((m) => ({
              id: m,
              label: MODULES[m].short,
              icon: MODULES[m].icon,
            })),
          ]}
        />
      </SheetField>
      )}

      {}
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
            icons={SKILL_ICONS}
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
