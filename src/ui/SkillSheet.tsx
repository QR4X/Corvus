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
import { AssistantPanel, ComAssistente, useRun } from "./AssistantPanel";
import { useSheetFit } from "./Sheet";
import { limparRun } from "../assistant/store";
import { useAssistant } from "./useAssistant";
import { mark, tr } from "../i18n/tr";

export const PASSOS_SKILL = [
  { id: "body", label: mark("Prompt") },
  { id: "name", label: mark("Name") },
  { id: "description", label: mark("Description") },
  { id: "mode", label: mark("Opens in") },
  { id: "color", label: mark("Color") },
  { id: "icon", label: mark("Icon") },
] as const;

export type PassoSkill = (typeof PASSOS_SKILL)[number]["id"];

export function SkillForm({
  draft,
  focar,
  onDraft,
  plugin,
  passo,
  procurando,
  onProcurar,
}: {
  draft: SkillDraft;

  focar: boolean;
  onDraft: (d: SkillDraft) => void;
  plugin: CorvusPlugin;

  passo?: PassoSkill;

  procurando: boolean;
  onProcurar: (p: boolean) => void;
}) {
  const set = (campo: Partial<SkillDraft>) => onDraft({ ...draft, ...campo });
  const setProcurando = onProcurar;

  useSheetFit(!procurando);

  const [ajudando, setAjudando] = useState<"" | "body" | "desc">("");
  const { indisponivel, pedirSkill, pedirDescricao, alvo, modelos, livres, escolherModelo } = useAssistant(plugin);
  const modelo = {
    atual: alvo?.model ?? "",
    opcoes: modelos,
    livres,
    onTrocar: (m: string) => void escolherModelo(m),
  };

  const runBody = useRun("skill");
  const runDesc = useRun("description");

  useEffect(() => {
    if (runBody.fase !== "pronto" || !runBody.resultado) return;
    set(runBody.resultado);
    limparRun("skill");
    setAjudando("");
  }, [runBody.fase, runBody.resultado]);

  useEffect(() => {
    if (runDesc.fase !== "pronto" || typeof runDesc.resultado !== "string")
      return;
    set({ description: runDesc.resultado });
    limparRun("description");
    setAjudando("");
  }, [runDesc.fase, runDesc.resultado]);
  const cor = projectColor(draft.color);

  if (procurando)
    return (
      <SheetIconCatalog
        value={draft.icon}
        tint={cor}
        onBack={() => setProcurando(false)}
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

  const mostra = (p: PassoSkill) => passo === undefined || passo === p;

  return (
    <>
      {}
      <div className="corvus-form-preview">
        <span
          className="corvus-thing-mark"
          style={{ color: cor }}
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

      {mostra("name") && (
        <SheetField
          label={tr("Name")}
          hint={passo ? tr("How you'll find it in the list.") : undefined}
        >
          <SheetInput
            value={draft.name}
            placeholder={tr("Weekly review")}

            autoFocus={focar}
            onChange={(name) => set({ name })}
          />
        </SheetField>
      )}

      {}
      {mostra("body") && (
      <SheetField
        label={tr("Prompt")}
        hint={tr("What gets written for you when you use the skill.")}
      >
        {}
        <ComAssistente
          aberto={ajudando === "body"}
          ocupado={runBody.fase === "rodando"}
          onAbrir={() => setAjudando("body")}
          painel={
            <AssistantPanel
              para="skill"
              indisponivel={indisponivel}
              modelo={modelo}
              onFechar={() => setAjudando("")}
              onPedir={(modo, turnos) => pedirSkill(modo, turnos)}
            />
          }
        >
          <SheetTextarea
            comSpark
            value={draft.body}

            rows={7}
            autoFocus={focar && passo === "body"}
            placeholder={tr(
              "Go through this week's notes and tell me:\n- what moved\n- what stalled\n- what I should drop"
            )}
            onChange={(body) => set({ body })}
          />
        </ComAssistente>
      </SheetField>
      )}

      {mostra("description") && (
      <SheetField
        label={tr("Description")}
        hint={tr("One line, shown in the list.")}
      >
        {}
        <ComAssistente
          aberto={ajudando === "desc"}
          ocupado={runDesc.fase === "rodando"}
          onAbrir={() => setAjudando("desc")}
          painel={
            <AssistantPanel
              para="description"
              indisponivel={indisponivel}
              modelo={modelo}
              onFechar={() => setAjudando("")}
              onPedir={(_modo, turnos) =>
                pedirDescricao({ name: draft.name, body: draft.body }, turnos)
              }
            />
          }
        >
          <SheetInput
            comSpark
            value={draft.description}
            autoFocus={focar && passo === "description"}
            placeholder={tr("Optional")}
            onChange={(description) => set({ description })}
          />
        </ComAssistente>
      </SheetField>
      )}

      {}
      {mostra("mode") && (
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
      {mostra("color") && (
        <SheetField label={tr("Color")}>
          <SheetSwatches
            colors={PROJECT_COLORS}
            value={draft.color}
            resolve={projectColor}
            onPick={(color) => set({ color })}
          />
        </SheetField>
      )}

      {mostra("icon") && (
        <SheetField label={tr("Icon")}>
          <SheetIconGrid
            icons={SKILL_ICONS}
            value={draft.icon}
            tint={cor}
            onBrowse={() => setProcurando(true)}
            onPick={(icon) => set({ icon })}
          />
        </SheetField>
      )}
    </>
  );
}
