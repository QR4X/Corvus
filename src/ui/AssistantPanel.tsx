// src/ui/AssistantPanel.tsx
// A ASSISTENTE dentro do formulário — o "escreve pra mim".
//
// Ela mora DENTRO do formulário, acima dos campos, e não numa tela própria. A
// razão é o que acontece depois: a assistente não salva nada, ela PREENCHE. O
// resultado aparece nos mesmos campos que a pessoa já estava olhando, e ela
// edita o que quiser antes de salvar. Numa tela separada, o resultado chegaria
// como um fato consumado; aqui chega como um rascunho.
//
// Três coisas a separam do resto do app, e as três são de propósito:
//
// 1. ELA É UM MODAL ACIMA DO TECLADO, SEMPRE — e sobe pelo MESMO mecanismo do
//    composer do chat, que já funcionava: ela é `absolute` colada na base da
//    `.corvus-root`, e a raiz encolhe junto com a gaveta quando o teclado abre.
//    Sem conta nenhuma.
//
//    Isso custou quatro tentativas erradas, e todas erraram igual: eu tentava
//    CALCULAR a folga (somar `--keyboard-height`, medir a sobra da tela, medir
//    a sobra da camada) com a camada em `position: fixed`. Fixed dentro da
//    gaveta não é fixo à tela — a gaveta tem transform —, e ela encolhe num
//    momento diferente do aviso do viewport. Cada estado intermediário dessa
//    dança era uma chance de a conta sair velha. O composer nunca teve esse
//    problema porque nunca fez conta: ele só mora no fim de uma caixa que já
//    tem o tamanho certo.
//
// 2. ELA TEM CARA PRÓPRIA. Tudo no app é superfície neutra tirada do tema do
//    Obsidian. Esta caixa é a única em accent, com a borda acesa e um brilho no
//    topo. Não é enfeite: ela é o único lugar da tela onde o texto não foi
//    escrito por você nem pelo app — foi escrito por um modelo. Quem olha de
//    relance precisa saber disso sem ler nada.
//
// 3. ELA PERGUNTA COM PASTILHAS. Responder três perguntas por escrito num
//    celular é trabalho; tocar em três pastilhas é um gesto. O campo continua
//    ali pra quem quiser dizer outra coisa — as opções são atalho, não gaiola.
//
// 4. ELA NÃO PARA QUANDO VOCÊ SAI. O estado da rodada vive fora do React (ver
//    assistant/store.ts): fechar o painel, a folha ou trocar de nível não
//    cancela nada. Num modelo free uma volta leva de cinco a vinte segundos, e
//    ninguém fica olhando um botão por vinte segundos.

import {
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import { openActions } from "./menu";
import { ThinkingGlyph, ThinkingInline } from "./Thinking";
import { prettyModelName } from "../providers/modelDescriptions";
import { modelLogo } from "../providers/modelLogo";
import {
  assinar,
  comecarRodada,
  lerRun,
  limparRun,
  type Rodada,
} from "../assistant/store";
import type { ModoAssistente } from "../assistant/prompt";
import type { TurnoAssistente } from "../assistant/run";
import { marca, tr } from "../i18n/tr";

// O nome do modelo é o NOSSO, nunca o da API.
//
// Eu tinha escrito um encurtador aqui — tirava o vendor e o `:free` e pronto.
// Era um segundo jeito de escrever a mesma coisa: o app já tem
// `prettyModelName`, que é o que aparece na pílula do composer e na folha de
// modelos. Dois jeitos significam que um dia eles divergem, e aí o mesmo
// modelo tem dois nomes em duas telas do mesmo app.

export type AlvoAssistente =
  | "skill"
  | "project"
  | "description"
  | "instructions"
  | "notes";

export interface AssistantPanelProps {
  /** O que a assistente vai montar — muda o convite, o exemplo e a CHAVE da
   *  rodada no store (uma por tipo; ver store.ts). */
  para: AlvoAssistente;
  /**
   * A chave da rodada no store, quando ela não pode ser a de `para`.
   *
   * É o caso das instruções no WIZARD de projeto: a tela de instruções de um
   * projeto já criado também escuta a rodada "instructions", e aplica o
   * resultado abrindo o nível dela. Com a mesma chave, escrever as instruções
   * durante a criação jogaria a folha nesse nível no instante em que o projeto
   * fosse salvo. Mesmo texto, mesmo pedido — só outra caixa de correio.
   */
  chave?: string;
  /** null = pronta. Com texto, o painel só explica o que falta. */
  indisponivel: string | null;
  /** Faz a chamada. O painel não espera por ela — quem espera é o store. */
  onPedir: (modo: ModoAssistente, turnos: TurnoAssistente[]) => Promise<Rodada>;
  /** Fecha o painel. */
  onFechar: () => void;
  /** Quem está escrevendo, e como trocar — aqui mesmo. */
  modelo?: {
    atual: string;
    opcoes: string[];
    /** Quais da lista são grátis — a etiqueta sai daqui. */
    livres?: string[];
    onTrocar: (model: string) => void;
  };
}

const CONVITE: Record<AlvoAssistente, string> = {
  skill: marca("Describe the skill you want, in a line."),
  project: marca("What is this project about?"),
  description: marca("Anything to steer it? (optional)"),
  instructions: marca("Anything to steer it? (optional)"),
  notes: marca("Anything to look for? (optional)"),
};

const EXEMPLO: Record<AlvoAssistente, string> = {
  skill: marca("A weekly review that reads my notes and tells me what stalled"),
  project: marca("My master's thesis on Kuhn and scientific revolutions"),
  description: marca("Optional — it writes from the prompt above"),
  instructions: marca("Optional — it writes from the project and its notes"),
  notes: marca("Optional — it looks at the project's name and instructions"),
};

/** O título do painel e o verbo do botão. Achar notas não é escrever — um
 *  "Write it" que devolve uma lista de arquivos promete uma coisa e faz outra. */
const TITULO: Record<AlvoAssistente, string> = {
  skill: marca("Write it for me"),
  project: marca("Write it for me"),
  description: marca("Write it for me"),
  instructions: marca("Write it for me"),
  notes: marca("Find notes for me"),
};

const VERBO: Record<AlvoAssistente, string> = {
  skill: marca("Write it"),
  project: marca("Write it"),
  description: marca("Write it"),
  instructions: marca("Write it"),
  notes: marca("Find them"),
};

/**
 * Onde o contexto JÁ está na tela, escrever não depende de digitar nada: o
 * prompt do skill e as notas do projeto são a entrada. Nestes o botão nasce
 * ligado, e o campo vira ajuste fino em vez de requisito.
 */
const PARTE_DO_VAZIO: Record<AlvoAssistente, boolean> = {
  skill: false,
  project: false,
  description: true,
  instructions: true,
  // O projeto na tela (nome, instruções) JÁ é a entrada.
  notes: true,
};

/** Lê a rodada do store e re-renderiza quando ela muda. */
export function useRun(chave: string) {
  return useSyncExternalStore(
    (f) => assinar(chave, f),
    () => lerRun(chave)
  );
}

export function AssistantPanel({
  para,
  chave: chaveDada,
  indisponivel,
  onPedir,
  onFechar,
  modelo,
}: AssistantPanelProps) {
  const chave = chaveDada ?? para;
  const run = useRun(chave);
  const [texto, setTexto] = useState("");
  /**
   * A pessoa escolheu a quarta pastilha ("Let me type") nesta pergunta.
   *
   * Enquanto ela não escolhe, o campo de texto nem aparece: depois da frase do
   * objetivo, o interrogatório é de TOQUE. Um campo aberto ao lado das
   * pastilhas transforma cada pergunta numa redação opcional — e quem está no
   * celular responde a redação, porque ela parece o caminho "certo".
   */
  const [digitando, setDigitando] = useState(false);
  const ocupado = run.fase === "rodando";
  const partirDoVazio = PARTE_DO_VAZIO[para];
  const perguntando = run.fase === "perguntando";

  /** Manda uma resposta — do campo ou de uma pastilha. */
  const responder = (dito: string, modo: ModoAssistente) => {
    if (ocupado) return;
    const limpo = dito.trim();
    if (!limpo && !partirDoVazio && !perguntando) return;
    const proximos: TurnoAssistente[] = limpo
      ? [...run.turnos, { quem: "pessoa", texto: limpo }]
      : run.turnos;
    setTexto("");
    setDigitando(false);
    // Dispara e esquece: o resultado chega pelo store, e o store sobrevive a
    // este componente sair da tela.
    comecarRodada(chave, proximos, (t) => onPedir(modo, t));
  };

  const cabecalho = (
    <div className="corvus-assist-head">
      <Icon name="sparkles" size={16} />
      <span>{tr(TITULO[para])}</span>
      {/* Quem escreve, e a troca — no lugar onde se percebe que precisa
          trocar. */}
      {modelo && modelo.opcoes.length > 1 && (
        <button
          type="button"
          className="corvus-assist-modelo"
          title={tr("Writing with {model}", { model: modelo.atual })}
          onClick={(e) =>
            openActions(
              e,
              // O logo de QUEM FEZ o modelo, não um símbolo de preço: numa
              // lista de nomes parecidos, a marca é o que se acha com o olho.
              // O grátis continua dito — na etiqueta, onde é informação e não
              // identidade.
              modelo.opcoes.map((m) => ({
                label: modelo.livres?.includes(m)
                  ? tr("{model} · free", { model: prettyModelName(m) })
                  : prettyModelName(m),
                icon: modelLogo(m),
                checked: m === modelo.atual,
                run: () => modelo.onTrocar(m),
              }))
            )
          }
        >
          <Icon name={modelLogo(modelo.atual)} size={14} />
          <span>{prettyModelName(modelo.atual)}</span>
          <Icon name="chevron-down" size={14} />
        </button>
      )}
      <button
        type="button"
        className="corvus-icon-btn"
        aria-label={tr("Close")}
        onClick={() => {
          // Fechar não cancela: o que está a caminho continua e o resultado
          // espera o formulário. Só a pergunta pendente some junto — ela só
          // faz sentido com o painel aberto.
          if (run.fase !== "rodando") limparRun(chave);
          onFechar();
        }}
      >
        <Icon name="x" size={16} />
      </button>
    </div>
  );

  /**
   * A camada sai da FOLHA por um portal, e isto não é arrumação de código.
   *
   * `.corvus-sheet` tem `transform` e `will-change: transform` — e um ancestral
   * transformado vira o bloco de contenção de todo `position: fixed` que
   * estiver dentro dele. O modal, sendo filho do formulário, não era fixo à
   * TELA: era fixo à folha, e ainda por cima recortado pelo `overflow: hidden`
   * da camada dela. No preview isso passou despercebido porque a folha estava
   * grande e o fundo dela coincidia com o fundo da tela; no aparelho, com a
   * folha em 62%, o modal nascia atrás do rodapé — invisível.
   *
   * É a mesma armadilha que fazia o teclado ser ignorado: preso à folha, a
   * conta de `--keyboard-height` (que é sobre a tela) não queria dizer nada.
   *
   * O portal leva a camada pra `.corvus-root`, que não tem transform nenhum —
   * então `fixed` volta a ser fixo de verdade, e o CSS continua no escopo
   * `.corvus-root` de sempre.
   */
  /**
   * O campo toma o foco ao abrir — e é isso que chama o teclado.
   *
   * Sem isto, tocar no ✨ abria um cartão com um campo esperando um SEGUNDO
   * toque pra começar a escrever. Pior no meio de um formulário: se o teclado
   * já estava em pé por causa de outro campo, ele continuava lá, apontando pra
   * lugar nenhum — o cursor tinha ido embora e o teclado ficou.
   *
   * `useLayoutEffect` e não `useEffect`: o foco precisa acontecer no mesmo
   * quadro em que o cartão aparece, senão o WebView já decidiu o que fazer com
   * o teclado e a chamada chega tarde.
   */
  const campoRef = useRef<HTMLTextAreaElement>(null);
  const ancora = useRef<HTMLSpanElement>(null);
  const [raiz, setRaiz] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setRaiz(ancora.current?.closest<HTMLElement>(".corvus-root") ?? null);
  }, []);

  // `raiz` na lista NÃO é enfeite: no primeiro render ela é null, então o
  // portal não existe e o campo também não — o foco cairia num ref vazio. Ele
  // só tem onde pousar no render seguinte, quando a camada finalmente montou.
  useLayoutEffect(() => {
    campoRef.current?.focus({ preventScroll: true });
  }, [raiz, perguntando, digitando]);

  const camada = (dentro: ReactNode) => {
    const layer = (
      <div className="corvus-assist-layer">
        {/* Tocar fora fecha — mas não cancela o que está a caminho (ver o X). */}
        <div
          className="corvus-scrim"
          onClick={() => {
            if (run.fase !== "rodando") limparRun(chave);
            onFechar();
          }}
        />
        {dentro}
      </div>
    );
    return (
      <>
        {/* A âncora fica na árvore original só pra achar a raiz — ela não
            desenha nada. */}
        <span ref={ancora} hidden />
        {raiz ? createPortal(layer, raiz) : null}
      </>
    );
  };

  if (indisponivel)
    return camada(
      <div className="corvus-assist">
        {cabecalho}
        <p className="corvus-assist-note">{indisponivel}</p>
      </div>
    );

  return camada(
    <div className={perguntando ? "corvus-assist is-grill" : "corvus-assist"}>
      {cabecalho}

      {/* A pergunta dela é FALA, não rótulo: sem caixa, no tamanho do texto —
          o que vem abaixo é a resposta. */}
      {perguntando && <p className="corvus-assist-ask">{run.pergunta}</p>}

      {/* As pastilhas: a resposta em um toque. Elas mandam NA HORA, sem passar
          pelo campo — parar pra digitar depois de escolher seria cobrar duas
          vezes pela mesma decisão.
          Três dela e uma NOSSA. A quarta é a saída, e existe em toda pergunta
          com o mesmo texto e no mesmo lugar: saída que muda de nome e de
          posição não é saída. */}
      {perguntando && !digitando && (
        <div className="corvus-assist-opcoes">
          {run.opcoes.map((o) => (
            <button
              key={o}
              type="button"
              className="corvus-assist-opcao"
              disabled={ocupado}
              onClick={() => responder(o, "guiado")}
            >
              {o}
            </button>
          ))}
          <button
            type="button"
            className="corvus-assist-opcao is-escrever"
            disabled={ocupado}
            onClick={() => setDigitando(true)}
          >
            <Icon name="pencil" size={14} />
            <span>{tr("Let me type")}</span>
          </button>
        </div>
      )}

      {/* A caixa só aparece quando é ela que responde: na frase do OBJETIVO
          (antes da primeira pergunta) e quando a pessoa pede pra digitar. */}
      {(!perguntando || digitando) && (
      <div className="corvus-assist-box">
        <textarea
          ref={campoRef}
          className="corvus-assist-campo"
          value={texto}
          rows={perguntando ? 2 : 3}
          placeholder={
            perguntando ? tr("Or say it your way…") : tr(EXEMPLO[para])
          }
          aria-label={perguntando ? run.pergunta : tr(CONVITE[para])}
          disabled={ocupado}
          onChange={(e) => setTexto(e.currentTarget.value)}
        />
        <div className="corvus-assist-acoes">
          {/* Enquanto escreve, a fileira de ações dá lugar à ESPERA — a mesma
              das conversas: o asterisco que respira, o relógio e o verbo que
              troca. Um botão desligado escrito "Writing…" não diz há quanto
              tempo, e é essa a única pergunta de quem espera. */}
          {ocupado ? (
            <ThinkingInline since={run.inicio} />
          ) : (
            <>
              {/* O guiado some depois da primeira pergunta: a conversa já está
                  acontecendo, e dois botões ali só ofereceriam sair dela pelo
                  meio. */}
              {!perguntando && !partirDoVazio && (
                <button
                  type="button"
                  className="corvus-assist-guiado"
                  disabled={!texto.trim()}
                  onClick={() => responder(texto, "guiado")}
                >
                  <Icon name="message-circle-question" size={15} />
                  <span>{tr("Grill me")}</span>
                </button>
              )}
              {/* Voltar pras pastilhas: escolher "eu escrevo" e mudar de ideia
                  não pode ser um beco. */}
              {digitando && (
                <button
                  type="button"
                  className="corvus-assist-guiado"
                  onClick={() => {
                    setDigitando(false);
                    setTexto("");
                  }}
                >
                  <Icon name="chevron-left" size={15} />
                  <span>{tr("Options")}</span>
                </button>
              )}
              <button
                type="button"
                className="corvus-assist-cta"
                disabled={!texto.trim() && !partirDoVazio && !perguntando}
                onClick={() =>
                  responder(texto, perguntando ? "guiado" : "direto")
                }
              >
                <Icon name="sparkles" size={16} />
                <span>{perguntando ? tr("Send") : tr(VERBO[para])}</span>
              </button>
            </>
          )}
        </div>
      </div>
      )}

      {/* Que dá pra sair só é dito ENQUANTO ela escreve: no resto do tempo
          seria papel de parede. */}
      {ocupado && (
        <p className="corvus-assist-note">
          <Icon name="check" size={14} />
          <span>{tr("You can close this — it keeps writing.")}</span>
        </p>
      )}

      {run.fase === "erro" && (
        <p className="corvus-assist-erro" role="status">
          <Icon name="info" size={14} />
          <span>{run.erro}</span>
        </p>
      )}
    </div>
  );
}

/**
 * O convite, DENTRO do campo que ele preenche.
 *
 * Era uma pílula solta acima do formulário, e ali ela era mais um item da
 * pilha: a pessoa lia "Write it for me", "Name", "Prompt" como três coisas do
 * mesmo nível. Dentro do campo, ela vira o que é — uma oferta sobre AQUELE
 * espaço vazio, no lugar onde o olho já está quando percebe que não sabe o que
 * escrever. É o mesmo lugar em que a lupa mora numa busca.
 *
 * `onMouseDown` com `preventDefault` porque o campo pode estar com o foco: sem
 * isso o toque tira o cursor de lá antes do clique, e num celular isso fecha o
 * teclado — a tela inteira salta no instante em que se toca no botão.
 */
export function AssistantSpark({
  onClick,
  titulo = tr("Write it for me"),
  ocupado,
}: {
  onClick: () => void;
  titulo?: string;
  /** Uma rodada deste campo está rodando em algum lugar — o ícone gira, pra
   *  quem fechou o painel saber que ainda tem coisa vindo. */
  ocupado?: boolean;
}) {
  const rotulo = ocupado ? tr("{title} — writing…", { title: titulo }) : titulo;
  return (
    <button
      type="button"
      className={ocupado ? "corvus-assist-spark is-busy" : "corvus-assist-spark"}
      aria-label={rotulo}
      title={rotulo}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {/* O mesmo glifo das conversas: quem fechou o painel vê no campo o
          mesmo desenho que veria se tivesse ficado. */}
      {ocupado ? <ThinkingGlyph /> : <Icon name="sparkles" size={16} />}
    </button>
  );
}

/**
 * O campo com o botão dentro.
 *
 * `position: relative` no invólucro e o botão por cima; o respiro pra ele vem
 * de uma classe no próprio campo (ver `.corvus-has-spark`), senão o texto passa
 * por baixo do botão exatamente quando fica comprido.
 */
export function ComAssistente({
  children,
  aberto,
  onAbrir,
  painel,
  ocupado,
  titulo,
}: {
  children: ReactNode;
  aberto: boolean;
  onAbrir: () => void;
  /** O painel, renderizado LOGO ABAIXO do campo quando aberto. */
  painel: ReactNode;
  ocupado?: boolean;
  /** O nome do ✨ pra leitor de tela — "Find notes for me" no campo de busca
   *  de notas, onde "Write it for me" diria outra coisa. */
  titulo?: string;
}) {
  return (
    <>
      <span className="corvus-spark-wrap">
        {children}
        {!aberto && (
          <AssistantSpark onClick={onAbrir} ocupado={ocupado} titulo={titulo} />
        )}
      </span>
      {aberto && painel}
    </>
  );
}
