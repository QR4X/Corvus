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
import { mark, tr } from "../i18n/tr";

export type AlvoAssistente =
  | "skill"
  | "project"
  | "description"
  | "instructions"
  | "notes";

export interface AssistantPanelProps {

  para: AlvoAssistente;

  chave?: string;

  indisponivel: string | null;

  onPedir: (modo: ModoAssistente, turnos: TurnoAssistente[]) => Promise<Rodada>;

  onFechar: () => void;

  modelo?: {
    atual: string;
    opcoes: string[];

    livres?: string[];
    onTrocar: (model: string) => void;
  };
}

const CONVITE: Record<AlvoAssistente, string> = {
  skill: mark("Describe the skill you want, in a line."),
  project: mark("What is this project about?"),
  description: mark("Anything to steer it? (optional)"),
  instructions: mark("Anything to steer it? (optional)"),
  notes: mark("Anything to look for? (optional)"),
};

const EXEMPLO: Record<AlvoAssistente, string> = {
  skill: mark("A weekly review that reads my notes and tells me what stalled"),
  project: mark("My master's thesis on Kuhn and scientific revolutions"),
  description: mark("Optional — it writes from the prompt above"),
  instructions: mark("Optional — it writes from the project and its notes"),
  notes: mark("Optional — it looks at the project's name and instructions"),
};

const TITULO: Record<AlvoAssistente, string> = {
  skill: mark("Write it for me"),
  project: mark("Write it for me"),
  description: mark("Write it for me"),
  instructions: mark("Write it for me"),
  notes: mark("Find notes for me"),
};

const VERBO: Record<AlvoAssistente, string> = {
  skill: mark("Write it"),
  project: mark("Write it"),
  description: mark("Write it"),
  instructions: mark("Write it"),
  notes: mark("Find them"),
};

const PARTE_DO_VAZIO: Record<AlvoAssistente, boolean> = {
  skill: false,
  project: false,
  description: true,
  instructions: true,

  notes: true,
};

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

  const [digitando, setDigitando] = useState(false);
  const ocupado = run.fase === "rodando";
  const partirDoVazio = PARTE_DO_VAZIO[para];
  const perguntando = run.fase === "perguntando";

  const responder = (dito: string, modo: ModoAssistente) => {
    if (ocupado) return;
    const limpo = dito.trim();
    if (!limpo && !partirDoVazio && !perguntando) return;
    const proximos: TurnoAssistente[] = limpo
      ? [...run.turnos, { quem: "pessoa", texto: limpo }]
      : run.turnos;
    setTexto("");
    setDigitando(false);

    comecarRodada(chave, proximos, (t) => onPedir(modo, t));
  };

  const cabecalho = (
    <div className="corvus-assist-head">
      <Icon name="sparkles" size={16} />
      <span>{tr(TITULO[para])}</span>
      {}
      {modelo && modelo.opcoes.length > 1 && (
        <button
          type="button"
          className="corvus-assist-modelo"
          title={tr("Writing with {model}", { model: modelo.atual })}
          onClick={(e) =>
            openActions(
              e,

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

          if (run.fase !== "rodando") limparRun(chave);
          onFechar();
        }}
      >
        <Icon name="x" size={16} />
      </button>
    </div>
  );

  const campoRef = useRef<HTMLTextAreaElement>(null);
  const ancora = useRef<HTMLSpanElement>(null);
  const [raiz, setRaiz] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setRaiz(ancora.current?.closest<HTMLElement>(".corvus-root") ?? null);
  }, []);

  useLayoutEffect(() => {
    campoRef.current?.focus({ preventScroll: true });
  }, [raiz, perguntando, digitando]);

  const camada = (dentro: ReactNode) => {
    const layer = (
      <div className="corvus-assist-layer">
        {}
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
        {}
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

      {}
      {perguntando && <p className="corvus-assist-ask">{run.pergunta}</p>}

      {}
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

      {}
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
          {}
          {ocupado ? (
            <ThinkingInline since={run.inicio} />
          ) : (
            <>
              {}
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
              {}
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

      {}
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

export function AssistantSpark({
  onClick,
  titulo = tr("Write it for me"),
  ocupado,
}: {
  onClick: () => void;
  titulo?: string;

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
      {}
      {ocupado ? <ThinkingGlyph /> : <Icon name="sparkles" size={16} />}
    </button>
  );
}

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

  painel: ReactNode;
  ocupado?: boolean;

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
