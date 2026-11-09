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
import { AssistantPanel, ComAssistente, useRun } from "./AssistantPanel";
import { limparRun } from "../assistant/store";
import type { ProjetoSugerido } from "../assistant/parse";
import { useAssistant } from "./useAssistant";
import { rankNotes, vaultNotes } from "./notePicker";
import { mark, tr } from "../i18n/tr";

export const PASSOS_PROJETO = [
  { id: "name", label: mark("Name") },
  { id: "notes", label: mark("Notes") },
  { id: "instructions", label: mark("Instructions") },
  { id: "color", label: mark("Color") },
  { id: "icon", label: mark("Icon") },
] as const;

export type PassoProjeto = (typeof PASSOS_PROJETO)[number]["id"];

export interface ExtrasProjeto {
  notes: string[];
  instructions: string;
}

export const EXTRAS_VAZIOS: ExtrasProjeto = { notes: [], instructions: "" };

function juntar(a: readonly string[], b: readonly string[]): string[] {
  return [...new Set([...a, ...b])];
}

const nomeDaNota = (path: string) =>
  path.split("/").pop()?.replace(/\.md$/i, "") ?? path;

export function ProjectForm({
  draft,
  focar,
  onDraft,
  plugin,
  extras,
  onExtras,
  passo,
  procurando,
  onProcurar,
}: {
  draft: ProjectDraft;
  focar: boolean;
  onDraft: (d: ProjectDraft) => void;
  plugin: CorvusPlugin;
  extras: ExtrasProjeto;
  onExtras: (e: ExtrasProjeto) => void;

  passo?: PassoProjeto;

  procurando: boolean;
  onProcurar: (p: boolean) => void;
}) {
  const set = (campo: Partial<ProjectDraft>) => onDraft({ ...draft, ...campo });
  const cor = projectColor(draft.color);

  const [ajudando, setAjudando] = useState<
    "" | "project" | "notes" | "instructions"
  >("");

  const [busca, setBusca] = useState("");
  const {
    indisponivel,
    pedirProjeto,
    pedirNotas,
    pedirInstrucoes,
    deixarVerNotas,
    veOVault,
    alvo,
    modelos,
    livres,
    escolherModelo,
  } = useAssistant(plugin);
  const modelo = {
    atual: alvo?.model ?? "",
    opcoes: modelos,
    livres,
    onTrocar: (m: string) => void escolherModelo(m),
  };

  const [liberou, setLiberou] = useState(false);
  const podeVerNotas = veOVault || liberou;

  useSheetFit(!procurando);

  const mostra = (p: PassoProjeto) =>
    passo === undefined
      ? p === "name" || p === "color" || p === "icon"
      : passo === p;

  const runProjeto = useRun("project");
  useEffect(() => {
    if (runProjeto.fase !== "pronto" || !runProjeto.resultado) return;
    const d = runProjeto.resultado as ProjetoSugerido;
    set({ name: d.name, icon: d.icon, color: d.color });
    onExtras({
      notes: juntar(extras.notes, d.notes),
      instructions: extras.instructions.trim()
        ? extras.instructions
        : d.instructions,
    });
    limparRun("project");
    setAjudando("");
  }, [runProjeto.fase, runProjeto.resultado]);

  const runNotas = useRun("notes");
  useEffect(() => {
    if (runNotas.fase !== "pronto" || !Array.isArray(runNotas.resultado))
      return;
    onExtras({
      ...extras,
      notes: juntar(extras.notes, runNotas.resultado as string[]),
    });
    limparRun("notes");
    setAjudando("");
  }, [runNotas.fase, runNotas.resultado]);

  const runInstr = useRun("project-instructions");
  useEffect(() => {
    if (runInstr.fase !== "pronto" || typeof runInstr.resultado !== "string")
      return;
    onExtras({ ...extras, instructions: runInstr.resultado });
    limparRun("project-instructions");
    setAjudando("");
  }, [runInstr.fase, runInstr.resultado]);

  const achadas = useMemo(() => {
    if (passo !== "notes" || !busca.trim()) return [];
    const escolhidas = new Set(extras.notes);
    return rankNotes(vaultNotes(plugin.app), busca, 30).filter(
      (n) => !escolhidas.has(n.path)
    );
  }, [passo, busca, extras.notes, plugin]);

  if (procurando)
    return (
      <SheetIconCatalog
        value={draft.icon}
        tint={cor}
        onBack={() => onProcurar(false)}
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

  const quantas = extras.notes.length;

  return (
    <>
      {}
      <div className="corvus-form-preview">
        <span
          className="corvus-thing-mark"
          style={{ color: cor }}
          aria-hidden="true"
        >
          <Icon name={draft.icon} size={20} />
        </span>
        <span className="corvus-thing-text">
          <span className="corvus-thing-name">
            {draft.name.trim() || tr("Untitled project")}
          </span>
          <span className="corvus-thing-note">
            {quantas === 0
              ? tr("No notes yet")
              : quantas === 1
                ? tr("1 note")
                : tr("{n} notes", { n: quantas })}
            {extras.instructions.trim() ? ` · ${tr("instructions")}` : ""}
          </span>
        </span>
      </div>

      {mostra("name") && (
        <SheetField
          label={tr("Name")}
          hint={passo ? tr("Or describe it and let ✨ set up the whole project.") : undefined}
        >
          {}
          <ComAssistente
            aberto={ajudando === "project"}
            ocupado={runProjeto.fase === "rodando"}
            onAbrir={() => setAjudando("project")}
            painel={
              <AssistantPanel
                para="project"
                indisponivel={indisponivel}
                modelo={modelo}
                onFechar={() => setAjudando("")}
                onPedir={(modo, turnos) => pedirProjeto(modo, turnos)}
              />
            }
          >
            <SheetInput
              comSpark
              value={draft.name}
              placeholder={tr("Thesis, Client X, Apartment…")}
              autoFocus={focar && (passo === undefined || passo === "name")}
              onChange={(name) => set({ name })}
            />
          </ComAssistente>
        </SheetField>
      )}

      {mostra("notes") && (
        <>
          <SheetField
            label={tr("Notes")}
            hint={tr("What this project should know — they go in as context on every chat started in it.")}
          >
            {}
            <ComAssistente
              titulo={tr("Find notes for me")}
              aberto={ajudando === "notes"}
              ocupado={runNotas.fase === "rodando"}
              onAbrir={() => setAjudando("notes")}
              painel={
                <AssistantPanel
                  para="notes"
                  indisponivel={indisponivel}
                  modelo={modelo}
                  onFechar={() => setAjudando("")}
                  onPedir={(_modo, turnos) =>
                    pedirNotas(
                      {
                        name: draft.name,
                        instructions: extras.instructions,
                        escolhidas: extras.notes,
                      },
                      turnos
                    )
                  }
                />
              }
            >
              <SheetInput
                comSpark
                value={busca}
                placeholder={tr("Search notes to add")}
                onChange={setBusca}
              />
            </ComAssistente>
          </SheetField>

          {}
          {!podeVerNotas && (
            <SheetGroup>
              <SheetRow
                icon="eye"
                title={tr("Let ✨ see your note names")}
                note={tr("Only titles and folders — never what is inside a note.")}
                onClick={() => {
                  setLiberou(true);
                  void deixarVerNotas();
                }}
              />
            </SheetGroup>
          )}

          {busca.trim() !== "" && (
            <SheetGroup label={tr("In your vault")}>
              {achadas.map((n) => (
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
                      onExtras({ ...extras, notes: juntar(extras.notes, [n.path]) }),
                  }}
                  onClick={() =>
                    onExtras({ ...extras, notes: juntar(extras.notes, [n.path]) })
                  }
                />
              ))}
              {achadas.length === 0 && (
                <SheetNote>{tr("No note matches that.")}</SheetNote>
              )}
            </SheetGroup>
          )}

          <SheetGroup label={quantas ? tr("In this project") : undefined}>
            {extras.notes.map((path) => (
              <SheetRow
                key={path}
                dense
                icon="file-text"
                title={nomeDaNota(path)}
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
            {quantas === 0 && (
              <SheetNote>
                {tr(
                  "No notes yet. Search above, or tap ✨ to have the assistant find them. You can also skip this and add notes later."
                )}
              </SheetNote>
            )}
          </SheetGroup>
        </>
      )}

      {mostra("instructions") && (
        <SheetField
          label={tr("Instructions")}
          hint={tr(
            "Sent with every new chat in this project — it adds to how the app already works, it does not replace it."
          )}
        >
          {}
          <ComAssistente
            aberto={ajudando === "instructions"}
            ocupado={runInstr.fase === "rodando"}
            onAbrir={() => setAjudando("instructions")}
            painel={
              <AssistantPanel
                para="instructions"
                chave="project-instructions"
                indisponivel={indisponivel}
                modelo={modelo}
                onFechar={() => setAjudando("")}
                onPedir={(_modo, turnos) =>
                  pedirInstrucoes(
                    {
                      name: draft.name,
                      notes: extras.notes,
                      atual: extras.instructions,
                    },
                    turnos
                  )
                }
              />
            }
          >
            <SheetTextarea
              comSpark
              value={extras.instructions}
              rows={7}
              autoFocus={focar && passo === "instructions"}
              placeholder={tr(
                "Answer in Portuguese.\nCite the note you took it from.\nShort paragraphs, no bullet lists."
              )}
              onChange={(instructions) => onExtras({ ...extras, instructions })}
            />
          </ComAssistente>
        </SheetField>
      )}

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
            icons={PROJECT_ICONS}
            value={draft.icon}
            tint={cor}
            onBrowse={() => onProcurar(true)}
            onPick={(icon) => set({ icon })}
          />
        </SheetField>
      )}
    </>
  );
}
