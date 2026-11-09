// src/ui/SkillsView.tsx
// SKILLS — os prompts que você guardou, numa FOLHA.
//
// Era uma página inteira, com barra e botão de voltar. Virou folha (0.6.57)
// pelo mesmo motivo que projetos: skill não é um LUGAR do app, é uma gaveta
// que se abre por cima do que você está fazendo e se fecha quando acabou.
// Página tem endereço e história; gaveta tem um gesto. E o gesto aqui é o
// certo: você pega um prompt e volta pra onde estava — quase sempre pra
// escrever com ele.
//
// A folha tem DOIS níveis, e não folhas empilhadas: a galeria e o formulário.
// Folha dentro de folha não funciona no nosso desenho — a de dentro é
// posicionada pelo painel da de fora e rola junto com ele.
//
// Um skill continua sendo uma nota .md na pasta de skills: é por isso que ele
// se compartilha, se versiona e se edita no Obsidian como qualquer outra nota.
// O ARQUIVO é a implementação, não a tela.

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
import { marca, tr } from "../i18n/tr";

/** As abas da galeria: o modo em que o skill abre. É a única divisão que um
 *  skill tem — o resto (nome, prompt) é assunto da busca. */
const ABAS: Array<{ id: string; label: string }> = [
  { id: "all", label: marca("All") },
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
  /** Caminho do skill em edição — null quando é criação. */
  const [editandoPath, setEditandoPath] = useState<string | null>(null);
  /**
   * O passo da CRIAÇÃO (índice em PASSOS_SKILL).
   *
   * Mora aqui, e não no formulário, porque quem desenha o rodapé é a folha
   * (prop `footer`, fora da área que rola — ver Sheet.tsx) e é o rodapé que
   * anda na fila. Estado do passo dentro do formulário deixaria os botões de
   * avançar sem como avançar.
   */
  const [passo, setPasso] = useState(0);
  /** O catálogo de ícones está aberto — é um nível da folha, e enquanto ele
   *  está na tela o rodapé sai: o catálogo tem o voltar dele. */
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
    // Modo primeiro, busca depois: a busca procura DENTRO do que está sendo
    // mostrado, senão a aba viraria mentira na tela.
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

  /** Grava o rascunho: cria a nota ou reescreve a que está sendo editada. */
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
        // Renomear ANTES de escrever: o nome do arquivo segue o nome do skill,
        // senão editar o nome deixaria a nota chamando-se como antes — e o
        // vault viraria um lugar onde o que está escrito não bate com o que
        // se lê na lista.
        if (antigo.path !== alvo) {
          await plugin.app.fileManager.renameFile(antigo, alvo);
        }
        const arquivo = plugin.app.vault.getAbstractFileByPath(alvo);
        // `instanceof` em vez de cast: se o caminho virou pasta (ou sumiu),
        // o cast entregaria um objeto errado pro modify em silêncio.
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
  /** Criando = wizard, um campo por tela. Editando = o formulário inteiro:
   *  quem veio trocar o ícone de um skill que já existe não deve atravessar
   *  cinco telas pra chegar nele. */
  const criando = noFormulario && editandoPath === null;

  /** A barra de baixo é da FOLHA, fora do que rola (ver `footer` em
   *  Sheet.tsx): grudada no fim do conteúdo com sticky, ela subia pro meio do
   *  formulário quando o teclado encolhia a área visível. */
  const rodape = procurando ? (
    // O catálogo de ícones toma a tela e traz o voltar dele. Um "Back / Next"
    // por baixo seriam dois voltares na mesma tela querendo dizer coisas
    // diferentes.
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
      // A fita de progresso vive no TOPO da folha, colada no título: as duas
      // respondem "onde eu estou". Some com o catálogo de ícones aberto —
      // ali a tela é dele, e a fila continua onde parou quando se volta.
      progress={
        criando && !procurando ? (
          <SheetProgress atual={passo} total={PASSOS_SKILL.length} />
        ) : undefined
      }
      // Criar mora na BARRA: é o que a folha oferece, não o que ela conclui.
      // Embaixo, a pílula disputava o fim da lista com o fim do assunto.
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
      // Com o catálogo aberto quem manda no título é ELE (useSheetLevel →
      // `interno` em Sheet.tsx), então não há o que dizer daqui.
      title={
        criando
          ? // O passo no TÍTULO, não só nos pontos do rodapé: "New skill"
            // cinco vezes seguidas não distingue uma tela da seguinte, e a
            // pessoa precisa saber o que a tela está perguntando antes de
            // olhar pro campo.
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
      // A seta da barra é o ÚNICO voltar da tela, e ela anda pra trás: num
      // wizard, o que está atrás é o passo anterior — sair só quando não há
      // degrau nenhum atrás (ver `voltar` em wizard.ts). Ter uma seta que sai
      // do formulário enquanto um botão no pé recua um passo era pedir pra
      // pessoa perder o que digitou no toque errado.
      onBack={
        !noFormulario
          ? undefined
          : criando &&
              peDoWizard({ atual: passo, total: PASSOS_SKILL.length }).voltar ===
                "passo"
            ? () => setPasso(passo - 1)
            : fecharNivel
      }
      // Nasce GRANDE. Skills é um acervo em grade de dois: do tamanho do
      // conteúdo, uma fileira e meia aparecia, e a primeira coisa a fazer era
      // arrastar a folha pra poder olhar. Um acervo se percorre com o olho.
      // (Projetos é o caso oposto e por isso usa `minSize="mid"`: lá a lista é
      // de uma coluna e a folha grande abriria com metade de vazio.)
      startFull
      // O painel não toma o foco: no formulário quem toma é o campo do nome, e
      // o efeito do pai roda depois do do filho (a mesma armadilha da busca).
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
        /* Pilha com respiro: na folha os blocos são irmãos soltos, e irmão
           solto não tem vão nenhum. */
        <ListaCheia>
        <div className="corvus-sheet-stack">
          {/* O MESMO segmented do resto do app (a home, o trilho de providers
              nas settings): trilho, thumb que desliza, colunas iguais. Abas
              sublinhadas eram um terceiro jeito de dizer "escolha uma", e o
              app já tinha dois demais.
              A contagem saiu junto: ela cabia na aba, mas não cabe numa
              coluna de segmented sem espremer o nome — e quem está filtrando
              vê a lista mudar de tamanho, que é a mesma informação. */}
          {skills.length > 0 && (
            <Segmented
              label={tr("Filter skills by mode")}
              value={aba}
              onChange={setAba}
              // Sem ponto: na home ele quer dizer "tem coisa te esperando
              // aqui", e usar a mesma marca pra dizer "tem item" ensinaria
              // que ela não significa nada.
              // Só o "All" se traduz: o nome do modo fica como é (Chat,
              // Vault, Agent), igual ao resto do app.
              options={ABAS.map((a) => ({
                id: a.id,
                label: a.id === "all" ? tr(a.label) : a.label,
              }))}
            />
          )}

          {/* A busca vem DEPOIS do segmented, e essa ordem é a ordem do que
              acontece: o segmented escolhe o conjunto, a busca procura DENTRO
              dele (ver `visiveis`: modo primeiro, texto depois). Em cima, ela
              parecia a busca de tudo, e trocar de modo com um texto digitado
              era uma surpresa em vez de um refinamento.
              É a mesma peça (SheetSearch) da folha de notas e da de modelos, e
              a mesma ordem dos providers nas settings. */}
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
                    {/* O prompt, como ele é. A miniatura do cartão não é
                        ilustração: é o texto que vai cair no campo quando você
                        tocar — a única pergunta que se faz olhando uma lista
                        de skills é "qual deles escreve o quê". */}
                    <span className="corvus-tile-paper">
                      <span className="corvus-tile-text">{s.body}</span>
                    </span>
                    {/* O brasão do skill no CARTÃO, não só na prévia do
                        formulário. Sem ele, a cor e o ícone que a pessoa
                        escolheu não apareciam em lugar nenhum depois de
                        salvar — e a galeria era uma grade de papéis cinzas
                        onde o nome era a única pista. */}
                    <span className="corvus-tile-head">
                      <span
                        className="corvus-thing-mark is-dense"
                        style={{ color: projectColor(s.color) }}
                        aria-hidden="true"
                      >
                        {/* 14 e não 16: dentro de um squircle de 26, o
                            desenho tem que caber com folga, senão ele encosta
                            na curva e a plaquinha some atrás dele. É a mesma
                            proporção do brasão grande (20 em 36). */}
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

/**
 * A lista de skills na folha CHEIA — sempre, inclusive ao voltar do
 * formulário.
 *
 * `startFull` só vale na montagem da folha, e a folha não desmonta entre a
 * lista e o formulário (são níveis dela). O formulário pede a folha do
 * tamanho do conteúdo (useSheetFit); sem isto, a lista voltaria herdando esse
 * tamanho — um acervo em grade mostrado numa folha que encolheu pro tamanho
 * de um campo de texto.
 */
function ListaCheia({ children }: { children: ReactNode }) {
  useSheetFull();
  return <>{children}</>;
}
