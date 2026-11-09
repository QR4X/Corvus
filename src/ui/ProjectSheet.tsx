// src/ui/ProjectSheet.tsx
// O FORMULÁRIO de um projeto — o conteúdo, não a folha (ver SkillSheet.tsx
// pra por que isto deixou de ser uma folha própria na 0.6.57).
//
// Criar um projeto era um modal pedindo o nome, e pronto: ícone e cor eram
// sempre os primeiros da lista, então todo projeto nascia com a mesma cara e a
// grade de 28 ícones que já existia no código nunca chegava à tela. Numa lista
// de seis projetos idênticos, o nome vira a única pista — e a lista inteira
// passa a exigir leitura.
//
// O botão de concluir é da FOLHA (prop `footer`), não daqui.
//
// Aqui o projeto se apresenta enquanto é feito: o cartão em cima muda conforme
// se escolhe, e é ele que vai aparecer na lista depois.
//
// CRIAR é um wizard, como o de skills: uma pergunta por tela. E nele a
// assistente deixa de trabalhar escondida. Antes, o ✨ do nome escolhia notas e
// escrevia instruções em silêncio, e a pessoa só via o que ela tinha feito
// depois de criar — sem ter escolhido nada. Agora cada coisa tem o seu passo,
// à vista: o que o projeto vai SABER (as notas, com a assistente procurando no
// vault) e COMO ele responde (as instruções, com a assistente escrevendo a
// partir do nome e das notas).
//
// EDITAR continua sendo o formulário inteiro (nome, cor, ícone): quem veio
// trocar o ícone não deve atravessar cinco telas. Notas e instruções de um
// projeto que já existe se mexem na página dele.

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
import { marca, tr } from "../i18n/tr";

/**
 * Os passos da CRIAÇÃO de um projeto, um por tela.
 *
 * O nome vem primeiro porque é nele que o ✨ monta o projeto inteiro — e
 * porque é o nome que a assistente usa pra procurar notas e escrever as
 * instruções nos passos seguintes. Depois, o que ele SABE antes de COMO ele
 * responde: as instruções se escrevem melhor olhando pras notas escolhidas.
 * Cor e ícone por último, e separados — uma pergunta por tela.
 */
export const PASSOS_PROJETO = [
  { id: "name", label: marca("Name") },
  { id: "notes", label: marca("Notes") },
  { id: "instructions", label: marca("Instructions") },
  { id: "color", label: marca("Color") },
  { id: "icon", label: marca("Icon") },
] as const;

export type PassoProjeto = (typeof PASSOS_PROJETO)[number]["id"];

/**
 * O que o projeto vai SABER e COMO vai responder — as duas coisas que não
 * cabem no `ProjectDraft` (nome/ícone/cor), porque só viram campos do projeto
 * quando ele existe. Quem guarda é a folha, até o `salvar`.
 */
export interface ExtrasProjeto {
  notes: string[];
  instructions: string;
}

export const EXTRAS_VAZIOS: ExtrasProjeto = { notes: [], instructions: "" };

/** Junta duas listas de caminhos sem repetir — a ordem de quem já estava. */
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
  /** Qual passo mostrar. `undefined` = o formulário inteiro (EDITAR). */
  passo?: PassoProjeto;
  /** O catálogo de ícones está aberto — um nível da folha, que mora lá fora
   *  pelo mesmo motivo do de skills: o rodapé é da folha. */
  procurando: boolean;
  onProcurar: (p: boolean) => void;
}) {
  const set = (campo: Partial<ProjectDraft>) => onDraft({ ...draft, ...campo });
  const cor = projectColor(draft.color);
  /** Um painel da assistente por vez: dois seriam duas conversas disputando
   *  o mesmo formulário. */
  const [ajudando, setAjudando] = useState<
    "" | "project" | "notes" | "instructions"
  >("");
  /** O que se digita no campo de busca de notas. */
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
  /** A chave do vault foi ligada AQUI, agora — re-renderiza sem esperar as
   *  settings avisarem. */
  const [liberou, setLiberou] = useState(false);
  const podeVerNotas = veOVault || liberou;

  // A folha do tamanho do conteúdo enquanto o formulário está na tela (ver
  // useSheetFit). O catálogo de ícones pede a cheia, e ao fechar ele isto volta.
  useSheetFit(!procurando);

  /** Este campo aparece agora? Sem `passo` (editar), só os de sempre. */
  const mostra = (p: PassoProjeto) =>
    passo === undefined
      ? p === "name" || p === "color" || p === "icon"
      : passo === p;

  // ── As rodadas da assistente ─────────────────────────────────────────────
  // Todas vivem fora daqui (assistant/store.ts): fechar o painel ou a folha
  // não cancela, e o resultado espera este formulário voltar.

  // O projeto INTEIRO, a partir do nome. Agora o que ela sugere de notas e
  // instruções vai pros passos seguintes, à vista — e SOMA ao que já havia
  // em vez de trocar: ela não sabe o que a pessoa escolheu antes dela.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda quando a resposta CHEGA. `extras` é lido do render em que a fase virou "pronto", que é o atual; listá-lo faria o efeito re-aplicar a sugestão por cima do que a pessoa digitou depois.
  }, [runProjeto.fase, runProjeto.resultado]);

  // As NOTAS que ela achou no vault — entram na lista, e tirar é um ✕.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mesma razão do efeito acima: aplica uma vez, na chegada.
  }, [runNotas.fase, runNotas.resultado]);

  // As INSTRUÇÕES. Chave própria ("project-instructions"), e não a de
  // "instructions": a tela de instruções de um projeto já criado escuta
  // aquela, e aplicar o resultado lá abriria o nível dela no instante em que
  // este projeto fosse salvo.
  const runInstr = useRun("project-instructions");
  useEffect(() => {
    if (runInstr.fase !== "pronto" || typeof runInstr.resultado !== "string")
      return;
    onExtras({ ...extras, instructions: runInstr.resultado });
    limparRun("project-instructions");
    setAjudando("");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mesma razão do efeito acima: aplica uma vez, na chegada.
  }, [runInstr.fase, runInstr.resultado]);

  // As notas do vault que batem com a busca, fora as já escolhidas: tocar numa
  // que já está no projeto seria um toque sem efeito, e lista onde metade dos
  // toques é no-op ensina a desconfiar dela.
  const achadas = useMemo(() => {
    if (passo !== "notes" || !busca.trim()) return [];
    const escolhidas = new Set(extras.notes);
    return rankNotes(vaultNotes(plugin.app), busca, 30).filter(
      (n) => !escolhidas.has(n.path)
    );
  }, [passo, busca, extras.notes, plugin]);

  // Procurar ícone TOMA a tela. O formulário sai inteiro — cartão, nome — e
  // ficam três coisas: voltar, a cor e os ícones. A cor fica porque é ela que
  // decide como cada ícone aparece: trocar de cor com a grade aberta mostra na
  // hora, e é a pergunta que se faz olhando os dois juntos.
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
      {/* O cartão que vai aparecer na lista — e que agora conta as notas
          escolhidas enquanto elas são escolhidas. */}
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
          {/* O primeiro campo vazio da tela é onde a oferta faz sentido:
              daqui ela monta o projeto inteiro — nome, ícone, cor,
              instruções e as notas de origem. */}
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
            {/* O ✨ mora no campo de BUSCA: procurar notas é o que este campo
                já faz, e a assistente é o jeito de procurar sem saber o nome
                delas. Sem foco automático — a tela abre mostrando o que já foi
                escolhido, e não o teclado cobrindo a lista. */}
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

          {/* A assistente só procura com o consentimento de ver os NOMES das
              notas. A chave é a mesma das settings; aqui é onde se percebe
              que precisa dela. */}
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
          {/* Ela escreve A PARTIR do projeto: o nome e as notas escolhidas no
              passo anterior são a matéria-prima, e o que estiver escrito vai
              junto pra ser melhorado em vez de jogado fora. */}
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
