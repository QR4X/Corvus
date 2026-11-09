// src/ui/ProjectsView.tsx
// PROJETOS — um assunto que dura mais que uma conversa, numa FOLHA.
//
// Um projeto é duas coisas juntas: as NOTAS que entram como contexto toda vez
// que se começa uma conversa ali, e as CONVERSAS que nasceram dele. É a
// diferença entre anexar as mesmas três notas dez vezes e anexá-las uma vez.
//
// Era uma página inteira; virou folha na 0.6.57. Projeto não é um LUGAR do
// app — é uma gaveta que se abre por cima do que você está fazendo, entrega o
// que você foi buscar (uma conversa naquele assunto) e se fecha.
//
// A folha tem NÍVEIS, e não folhas empilhadas: lista → projeto → (notas,
// instruções, formulário). Folha dentro de folha não funciona no nosso
// desenho — a de dentro é posicionada pelo painel da de fora e rola junto com
// ele. O nível também dá de graça a regra de navegação da casa: a seta
// desfaz o toque que trouxe você.
//
// Nada disso vive no vault: projeto é agrupamento, e mora nas settings. Apagar
// um projeto não apaga nota nem conversa nenhuma — some o agrupamento, e a
// confirmação diz isso com todas as letras.

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
  /** Qual projeto está aberto. Vem de fora (App) pra sobreviver à ida e volta
   *  de uma conversa: entrar numa conversa fecha a folha, e voltar reabre
   *  no projeto de onde se saiu. */
  abertoId: string | null;
  onAbrir: (id: string | null) => void;
  /** Conversa esperando um projeto: veio do ⋯ de uma conversa, por
   *  "Add to project ▸ New project…". O projeto criado já nasce com ela. */
  chatPendente?: string | null;
  onChatPendente?: (id: string | null) => void;
  /** A folha está aberta pra ESCOLHER um projeto pra esta conversa (o "See
   *  all" do menu de uma conversa). Enquanto vale, tocar numa linha ADICIONA
   *  em vez de abrir o projeto. */
  escolhaPara?: string | null;
  onEscolha?: () => void;
  onOpenChat: () => void;
  onClose: () => void;
}) {
  const [, force] = useReducer((n: number) => n + 1, 0);
  const setAbertoId = onAbrir;
  const [draft, setDraft] = useState<ProjectDraft | null>(null);
  /** Id do projeto em edição — null quando é criação. */
  const [editandoId, setEditandoId] = useState<string | null>(null);
  /** O passo do wizard de CRIAÇÃO (índice em PASSOS_PROJETO). Mora aqui, e não
   *  no formulário, pelo mesmo motivo do de skills: quem anda na fila é o
   *  rodapé, e o rodapé é da folha. */
  const [passo, setPasso] = useState(0);
  /** O catálogo de ícones do formulário está aberto — um nível da folha. */
  const [procurando, setProcurando] = useState(false);
  /** Está no nível das notas? E, dentro dele, escolhendo uma do vault? */
  const [vendoNotas, setVendoNotas] = useState(false);
  const [escolhendo, setEscolhendo] = useState(false);
  const [noteQuery, setNoteQuery] = useState("");
  /** O texto das instruções em edição (null = fora desse nível; "" é válido). */
  const [instrucoes, setInstrucoes] = useState<string | null>(null);
  /** A assistente aberta no campo de instruções. */
  const [ajudandoInstrucoes, setAjudandoInstrucoes] = useState(false);
  const { indisponivel, pedirInstrucoes, alvo, modelos, livres, escolherModelo } = useAssistant(plugin);
  const modeloAssist = {
    atual: alvo?.model ?? "",
    opcoes: modelos,
    livres,
    onTrocar: (m: string) => void escolherModelo(m),
  };

  // A rodada das instruções vive fora daqui (assistant/store.ts).
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
  // Quantos tokens de entrada cada projeto custa ao abrir uma conversa — o
  // número do pé do cartão. Só com a lista à vista: é ela que mostra.
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

  /**
   * As NOTAS e as INSTRUÇÕES do projeto sendo feito.
   *
   * Elas não cabem no `ProjectDraft` (que é nome/ícone/cor) porque só existem
   * depois que o projeto existe — fonte é caminho anexado a um id, e instrução
   * é campo do projeto, não do formulário. Ficam aqui esperando o `salvar`.
   *
   * Criando, elas são escolhidas à vista nos passos do wizard (a assistente
   * ajuda nos dois). Editando, só recebem o que o ✨ do nome sugerir — e isso
   * SOMA ao que o projeto já tinha, nunca troca.
   */
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
                // Editando, o que a assistente sugeriu SOMA ao que já havia:
                // ela não sabe o que você anexou antes dela, e apagar fonte
                // por conta própria seria a coisa mais cara que ela poderia
                // fazer aqui.
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
        // A conversa que pediu o projeto entra junto: quem criou o projeto a
        // partir do menu dela não devia ter que voltar lá e repetir o caminho.
        chatIds: chatPendente ? [chatPendente] : [],
        createdAt: new Date().toISOString(),
      };
      await update((prev) => [p, ...prev]);
      // Cai DENTRO do projeto recém-criado: criar é meio do caminho, não fim.
      // Quem acabou de nomear um projeto vai querer pôr as notas dele — e
      // voltar pra lista obrigaria a um toque só pra desfazer o nosso.
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

  /**
   * Duplicar: um projeto é quase um MOLDE — a identidade, as notas de origem
   * e as instruções são o que custou a montar, e refazer isso à mão pra uma
   * variante ("Tese · capítulo 3") é repetir o trabalho inteiro.
   *
   * As conversas NÃO vêm junto: elas são o que aconteceu no projeto velho, e
   * a cópia existe pra começar de novo. Vir com elas faria a cópia mentir
   * sobre a própria idade.
   */
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

  /** Exporta o índice do projeto e diz onde ele caiu. */
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

  /**
   * O ⋯ de um projeto — o mesmo de dentro dele e o da linha da lista.
   *
   * Um menu só, porque é o mesmo objeto: dois menus com itens diferentes pro
   * mesmo projeto ensinariam que uma ação existe "só de um lado", e aí toda
   * ação vira uma busca.
   *
   * A ordem é: o que se VEM fazer (conversar), o que o projeto TEM (as
   * instruções e as notas — as duas coisas que ele de fato guarda, e que hoje
   * só se alcança entrando nele), e por fim lidar com ele. Apagar por último e
   * marcado, como em toda parte do app.
   */
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
    // O que já é fonte não aparece: escolher de novo não faria nada, e uma
    // lista onde metade dos toques é no-op ensina a desconfiar dela.
    return aberto ? todas.filter((n) => !aberto.sources.includes(n.path)) : todas;
  }, [plugin, aberto, noteQuery]);

  // ── Qual nível está à vista ───────────────────────────────────────────────
  // A ordem importa: o formulário e as instruções são abertos DE DENTRO de um
  // projeto, então eles vêm antes dele na conta.
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

  /** Criando = wizard; editando = o formulário inteiro (ver ProjectSheet). */
  const criando = nivel === "form" && editandoId === null;

  const TITULOS: Record<string, string> = {
    // O passo no título, como no de skills: "New project" cinco vezes seguidas
    // não distingue uma tela da seguinte.
    form: editandoId
      ? tr("Edit project")
      : tr("New project · {step}", { step: tr(PASSOS_PROJETO[passo].label) }),
    instrucoes: tr("Custom instructions"),
    escolher: tr("Add a note"),
    notas: tr("Project notes"),
    projeto: aberto?.name ?? tr("Project"),
    lista: escolhaPara ? tr("Add to project") : tr("Projects"),
  };

  /** A seta de voltar de cada nível — ela desfaz o toque que trouxe você. */
  const voltar: Record<string, (() => void) | undefined> = {
    // A seta é o ÚNICO voltar da tela, e ela anda pra trás: no wizard recua
    // um passo, e só sai quando não há passo atrás (ver `voltar` em wizard.ts).
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

  /** A barra de baixo, por nível. Ela é da FOLHA (fora do que rola), não do
   *  conteúdo — ver a prop `footer` em Sheet.tsx. */
  const rodape =
    nivel === "form" ? (
      // Com o catálogo de ícones aberto o rodapé sai: o catálogo traz o voltar
      // dele, e dois voltares querendo dizer coisas diferentes é armadilha.
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
        {/* Editar e apagar ficam à esquerda e em texto, e não num ⋯ da barra
            de cima: lá o canto direito já é do X, e um menu escondido ao lado
            do fechar é convite pra fechar sem querer. */}
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
      // Nasce média, mesmo com dois projetos. Sendo "a altura do conteúdo", a
      // folha contava quantos projetos existem antes de a pessoa ler um: quem
      // tinha dois abria uma faixa de dois dedos, quem tinha oito abria meia
      // tela. Com o piso ela abre no mesmo lugar toda vez — e o espaço vazio
      // embaixo dos dois primeiros é onde os próximos vão entrar.
      minSize="mid"
      // Criar mora na barra, como na folha de skills: é o que esta lista
      // oferece. O rodapé continua sendo de quem CONCLUI (salvar, ou começar
      // a conversa de um projeto aberto).
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
      // Nasce do tamanho do conteúdo, e cresce sozinha quando um campo
      // pega o foco (ver Sheet.tsx). Nascer grande fazia um projeto sem nota
      // nenhuma abrir uma folha de tela inteira com três linhas dentro.
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

      {/* Fora do formulário a folha volta ao tamanho com que nasce (o médio):
          o formulário pede a do tamanho do conteúdo, e a folha não desmonta
          entre os níveis. */}
      {nivel !== "form" && <TamanhoDaCasa />}

      {nivel === "instrucoes" && (
        <>
          <SheetField
            label={tr("Instructions")}
            hint={tr(
              "Sent with every new chat in this project — it adds to how the app already works, it does not replace it."
            )}
          >
            {/* Ela escreve A PARTIR do projeto: o nome e as notas já
                anexadas são a matéria-prima, e o que estiver escrito vai
                junto pra ser melhorado em vez de jogado fora. */}
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
                  // Volta pra lista do projeto em vez de fechar: quem veio pôr
                  // notas quase sempre põe mais de uma, e ver a que acabou de
                  // entrar é a confirmação de que entrou.
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
        /* Pilha com respiro: dentro da folha os blocos são irmãos soltos, e
           irmão solto não tem vão nenhum — as pílulas encostavam na caixa, que
           encostava nos cartões. */
        <div className="corvus-sheet-stack">
          {/* As pílulas dizem ONDE isto mora — o projeto é agrupamento e vive
              nos dados do plugin, dentro do vault, não num serviço nosso. Não
              dizem "privado": as notas daqui vão como contexto pro modelo
              quando você conversa, e uma pílula que promete o contrário
              mentiria. */}
          {/* Uma etiqueta só, e ela INFORMA: sem contorno e sem superfície de
              botão, porque não há nada pra tocar aqui. A do nome saiu — ele já
              está na barra da folha, com a cor e o ícone do projeto. */}
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

          {/* A caixa de cima responde "o que este projeto faz por mim" — e a
              resposta muda conforme ele tem ou não notas, porque a pergunta de
              quem tem zero não é a mesma de quem tem seis. */}
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

          {/* Os dois lados do projeto, lado a lado: o que ele SABE e como ele
              deve responder. */}
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
              {/* Rótulo DA FOLHA, não da home: dentro dela o versalete
                  miúdo é a letra de grupo, e o da home é palavra normal. */}
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
                      // No modo escolha a linha faz o que a pessoa veio
                      // fazer: põe a conversa ali e fecha. Abrir o projeto
                      // seria trocar o destino no meio do caminho.
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
                        {/* A DATA na linha do título, à direita — como na
                            lista de conversas: é onde o olho procura "quando". */}
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
                        {/* E o DO QUE SE TRATA logo abaixo do nome, no lugar
                            que era da data. Duas linhas reservadas sempre, pra
                            todo cartão ter a mesma altura (o mesmo motivo dos
                            cartões de skill). Curta de propósito, a dica: numa
                            lista de projetos novos ela se repete em cartão
                            após cartão. */}
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
                      {/* O preço de abrir uma conversa aqui: tudo que o
                          projeto soma ao prompt (instruções + o conteúdo das
                          notas). Só aparece depois de as notas serem lidas —
                          um "0" enquanto lê seria o cartão mentindo por um
                          instante. */}
                      {tokensPorProjeto[p.id] !== undefined && (
                        <span
                          className="corvus-proj-card-stat"
                          title={tr(
                            "Input tokens each new chat here starts with: the instructions plus the full text of its notes."
                          )}
                        >
                          {/* Seta pra CIMA: é o que SAI do aparelho pro
                              modelo a cada conversa nova — do ponto de vista de
                              quem paga, tokens de entrada são uma saída. */}
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
                      /* Sem "Open": tocar no cartão já abre o projeto, e
                         gastar a primeira posição do menu repetindo o gesto
                         mais óbvio da tela é desperdiçar o lugar que o polegar
                         alcança primeiro. */
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

/** Devolve a folha ao tamanho com que ela nasce — ver useSheetDefault. */
function TamanhoDaCasa() {
  useSheetDefault();
  return null;
}

/**
 * Os tokens de ENTRADA de cada projeto (ver `tokensDeEntrada`), por id.
 *
 * Lê o conteúdo das notas-fonte — do jeito que `newChatInProject` lê
 * (`cachedRead`), porque é isso que vai pro prompt. Nota que sumiu do vault
 * não conta: ela também não vai (a sessão avisa que não achou e segue sem
 * ela).
 *
 * Recalcula quando a lista de projetos muda (nota entrou ou saiu, instrução
 * mudou) e quando a folha abre — o conteúdo de uma nota pode ter mudado
 * desde a última vez, e a leitura em cache é barata.
 */
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
          } catch {
            /* ilegível: também não iria pro prompt */
          }
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
