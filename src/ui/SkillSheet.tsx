// src/ui/SkillSheet.tsx
// O FORMULÁRIO de um skill — o conteúdo, não a folha.
//
// Ele já foi uma folha própria. Deixou de ser quando Skills virou uma folha
// inteira (0.6.57): folha dentro de folha não funciona no nosso desenho (a de
// dentro é posicionada pelo painel da de fora e some junto com a rolagem
// dele), e mesmo que funcionasse seriam duas cascas empilhadas pro mesmo
// assunto. Agora ele é um NÍVEL da folha de Skills, como "escolher nota" é um
// nível da folha de projetos.
//
// O botão de concluir NÃO está aqui: ele é da folha (prop `footer`),
// fora da área que rola — sticky no fim do conteúdo pousava no meio do
// formulário quando o teclado encolhia a área visível.
//
// A ordem das perguntas é a ordem da cabeça de quem cria: primeiro COMO SE
// CHAMA e O QUE ELE ESCREVE — que é o skill inteiro —, e só depois os
// enfeites. Quem parar de responder no meio já tem um skill que funciona.

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
import { marca, tr } from "../i18n/tr";

/**
 * Os passos da CRIAÇÃO, um por tela.
 *
 * A ordem é a da cabeça de quem cria, não a do arquivo: primeiro O QUE ELE
 * ESCREVE — que é o skill inteiro —, depois como se chama, e só então os
 * enfeites. Quem desistir no meio já tem um skill que funciona, e é por isso
 * que o "Create" fica disponível desde o passo em que o rascunho passa a ser
 * válido, em vez de esperar o fim da fila.
 *
 * Um campo por tela porque um formulário de sete blocos num celular é uma
 * parede: a pessoa rola, vê tudo vazio de uma vez e fecha. Uma pergunta por
 * vez ela responde.
 */
export const PASSOS_SKILL = [
  { id: "body", label: marca("Prompt") },
  { id: "name", label: marca("Name") },
  { id: "description", label: marca("Description") },
  { id: "mode", label: marca("Opens in") },
  { id: "color", label: marca("Color") },
  { id: "icon", label: marca("Icon") },
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
  /** O campo do nome toma o foco (a folha acabou de abrir neste nível). */
  focar: boolean;
  onDraft: (d: SkillDraft) => void;
  plugin: CorvusPlugin;
  /** Qual passo mostrar. `undefined` = o formulário INTEIRO, que é o modo de
   *  EDITAR: ali a pessoa veio mexer num campo específico, e uma fila de cinco
   *  telas pra trocar uma palavra seria um pedágio. */
  passo?: PassoSkill;
  /** O catálogo de ícones está aberto. Ele é um NÍVEL da folha, não um estado
   *  deste formulário, e por isso mora lá fora: o rodapé é da folha, e um
   *  "Back / Next" por baixo do catálogo seria um segundo voltar querendo
   *  dizer outra coisa. */
  procurando: boolean;
  onProcurar: (p: boolean) => void;
}) {
  const set = (campo: Partial<SkillDraft>) => onDraft({ ...draft, ...campo });
  const setProcurando = onProcurar;
  // A folha do TAMANHO DO CONTEÚDO enquanto o formulário está na tela: fechado
  // o teclado, ela encolhe até o campo em vez de deixar um vão até o botão. O
  // catálogo de ícones pede a cheia (é uma grade), e ao fechar ele isto volta.
  useSheetFit(!procurando);
  /** Qual campo está com a assistente aberta. Um de cada vez: dois painéis no
   *  mesmo formulário seriam duas conversas disputando os mesmos campos. */
  const [ajudando, setAjudando] = useState<"" | "body" | "desc">("");
  const { indisponivel, pedirSkill, pedirDescricao, alvo, modelos, livres, escolherModelo } = useAssistant(plugin);
  const modelo = {
    atual: alvo?.model ?? "",
    opcoes: modelos,
    livres,
    onTrocar: (m: string) => void escolherModelo(m),
  };

  // As duas rodadas deste formulário, lidas do store (assistant/store.ts). Elas
  // vivem FORA daqui: fechar o painel ou a folha não cancela nada, e o
  // resultado espera este formulário voltar.
  const runBody = useRun("skill");
  const runDesc = useRun("description");

  // APLICAR é daqui, não do painel: o painel pode nem estar na tela quando a
  // resposta chegar. Quem sabe onde o texto vai é o formulário.
  useEffect(() => {
    if (runBody.fase !== "pronto" || !runBody.resultado) return;
    set(runBody.resultado);
    limparRun("skill");
    setAjudando("");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `set` vem do formulário e muda a cada tecla; listá-lo re-aplicaria a sugestão por cima do que está sendo escrito.
  }, [runBody.fase, runBody.resultado]);

  useEffect(() => {
    if (runDesc.fase !== "pronto" || typeof runDesc.resultado !== "string")
      return;
    set({ description: runDesc.resultado });
    limparRun("description");
    setAjudando("");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mesma razão do efeito acima.
  }, [runDesc.fase, runDesc.resultado]);
  const cor = projectColor(draft.color);

  // Procurar ícone toma a tela, como nos projetos. Aqui nem a cor sobra: skill
  // não tem paleta, então fica o voltar e os ícones. Sair de cima de um
  // textarea de sete linhas também evita o pior esbarrão possível — o que
  // apaga o prompt inteiro.
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

  /** Este campo aparece agora? Sem `passo` (editar), todos aparecem. */
  const mostra = (p: PassoSkill) => passo === undefined || passo === p;

  return (
    <>
      {/* O skill como ele vai aparecer na lista. Não é enfeite: é o que faz o
          seletor de ícone e a descrição terem sentido antes de salvar —
          senão são dois campos que só se explicam depois. Num wizard ele ganha
          um segundo trabalho: é a única coisa que fica na tela de um passo pro
          outro, e é por isso que a fila não parece cinco formulários seguidos.
          Cada resposta muda o cartão na hora — o que se está montando está
          sempre à vista. */}
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
            // No wizard o foco é do campo do PASSO, não sempre do nome: chegar
            // no passo do nome com o teclado já aberto é uma tela a menos pra
            // atravessar, e chegar no do ícone com ele aberto é meia tela de
            // grade coberta por nada.
            autoFocus={focar}
            onChange={(name) => set({ name })}
          />
        </SheetField>
      )}

      {/* O campo que IMPORTA, e por isso é o PRIMEIRO passo: sem corpo o
          parser descarta a nota e o skill some da lista no mesmo segundo em
          que foi criado. E é aqui que a assistente devolve o skill INTEIRO —
          começar por ele é o que permite uma resposta só encerrar a fila. */}
      {mostra("body") && (
      <SheetField
        label={tr("Prompt")}
        hint={tr("What gets written for you when you use the skill.")}
      >
        {/* A assistente mora DENTRO deste campo: é ele que ela escreve, e é
            olhando pra ele vazio que a pessoa percebe que não sabe começar. */}
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
            // Sete linhas em todo lugar. O wizard já teve dez, com o
            // argumento de que a tela era dele — mas a tela dele é o que sobra
            // ACIMA do teclado, que são uns 210px: dez linhas não cabiam nem
            // perto, e o campo aparecia cortado no meio em toda foto. Sete
            // também não cabem inteiras, e tudo bem: a diferença é entre um
            // campo que rola e um campo que parece quebrado.
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
        {/* Aqui ela escreve A PARTIR do que já está na tela: o prompt acima é
            a matéria-prima, então o botão nasce ligado e o campo de entrada
            vira ajuste fino em vez de requisito. */}
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

      {/* "Opens in" e não "Mode": o que a pessoa escolhe aqui é ONDE o skill
          vai cair quando ela tocar nele. */}
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

      {/* A cor vem ANTES do ícone, como nos projetos: ela é o `tint` da grade
          logo abaixo, então escolher o desenho antes do tom é escolher no
          escuro. Duas telas, e não uma: elas já andaram juntas por um passo
          só, com o argumento de serem "a mesma decisão" — mas a regra é uma
          pergunta por tela, e o cartão de prévia já mostra o ícone tingido,
          então não se perde nada vendo uma de cada vez. */}
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
