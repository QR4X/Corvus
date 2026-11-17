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
  subscribe,
  startRun,
  getRun,
  clearRun,
  type RoundResult,
} from "../assistant/store";
import type { AssistantMode } from "../assistant/prompt";
import type { AssistantTurn } from "../assistant/run";
import { mark, tr } from "../i18n/tr";

type PanelTarget =
  | "skill"
  | "project"
  | "description"
  | "instructions"
  | "notes";

interface AssistantPanelProps {

  target: PanelTarget;

  runKey?: string;

  unavailable: string | null;

  onAsk: (mode: AssistantMode, turns: AssistantTurn[]) => Promise<RoundResult>;

  onClose: () => void;

  modelPicker?: {
    current: string;
    options: string[];

    freeModels?: string[];
    onPick: (model: string) => void;
  };
}

const PROMPT_LABEL: Record<PanelTarget, string> = {
  skill: mark("Describe the skill you want, in a line."),
  project: mark("What is this project about?"),
  description: mark("Anything to steer it? (optional)"),
  instructions: mark("Anything to steer it? (optional)"),
  notes: mark("Anything to look for? (optional)"),
};

const PLACEHOLDER: Record<PanelTarget, string> = {
  skill: mark("A weekly review that reads my notes and tells me what stalled"),
  project: mark("My master's thesis on Kuhn and scientific revolutions"),
  description: mark("Optional — it writes from the prompt above"),
  instructions: mark("Optional — it writes from the project and its notes"),
  notes: mark("Optional — it looks at the project's name and instructions"),
};

const TITLE: Record<PanelTarget, string> = {
  skill: mark("Write it for me"),
  project: mark("Write it for me"),
  description: mark("Write it for me"),
  instructions: mark("Write it for me"),
  notes: mark("Find notes for me"),
};

const ACTION_LABEL: Record<PanelTarget, string> = {
  skill: mark("Write it"),
  project: mark("Write it"),
  description: mark("Write it"),
  instructions: mark("Write it"),
  notes: mark("Find them"),
};

const STARTS_EMPTY: Record<PanelTarget, boolean> = {
  skill: false,
  project: false,
  description: true,
  instructions: true,

  notes: true,
};

export function useRun(key: string) {
  return useSyncExternalStore(
    (f) => subscribe(key, f),
    () => getRun(key)
  );
}

export function AssistantPanel({
  target,
  runKey: givenKey,
  unavailable,
  onAsk,
  onClose,
  modelPicker,
}: AssistantPanelProps) {
  const runKey = givenKey ?? target;
  const run = useRun(runKey);
  const [text, setText] = useState("");

  const [typing, setTyping] = useState(false);
  const busy = run.phase === "running";
  const startsEmpty = STARTS_EMPTY[target];
  const asking = run.phase === "asking";

  const answer = (input: string, mode: AssistantMode) => {
    if (busy) return;
    const trimmed = input.trim();
    if (!trimmed && !startsEmpty && !asking) return;
    const nextTurns: AssistantTurn[] = trimmed
      ? [...run.turns, { role: "user", text: trimmed }]
      : run.turns;
    setText("");
    setTyping(false);

    startRun(runKey, nextTurns, (t) => onAsk(mode, t));
  };

  const header = (
    <div className="corvus-assist-head">
      <Icon name="sparkles" size={16} />
      <span>{tr(TITLE[target])}</span>
      {}
      {modelPicker && modelPicker.options.length > 1 && (
        <button
          type="button"
          className="corvus-assist-model"
          title={tr("Writing with {model}", { model: modelPicker.current })}
          onClick={(e) =>
            openActions(
              e,

              modelPicker.options.map((m) => ({
                label: modelPicker.freeModels?.includes(m)
                  ? tr("{model} · free", { model: prettyModelName(m) })
                  : prettyModelName(m),
                icon: modelLogo(m),
                checked: m === modelPicker.current,
                run: () => modelPicker.onPick(m),
              }))
            )
          }
        >
          <Icon name={modelLogo(modelPicker.current)} size={14} />
          <span>{prettyModelName(modelPicker.current)}</span>
          <Icon name="chevron-down" size={14} />
        </button>
      )}
      <button
        type="button"
        className="corvus-icon-btn"
        aria-label={tr("Close")}
        onClick={() => {

          if (run.phase !== "running") clearRun(runKey);
          onClose();
        }}
      >
        <Icon name="x" size={16} />
      </button>
    </div>
  );

  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setRoot(anchorRef.current?.closest<HTMLElement>(".corvus-root") ?? null);
  }, []);

  useLayoutEffect(() => {
    fieldRef.current?.focus({ preventScroll: true });
  }, [root, asking, typing]);

  const inLayer = (content: ReactNode) => {
    const layer = (
      <div className="corvus-assist-layer">
        {}
        <div
          className="corvus-scrim"
          onClick={() => {
            if (run.phase !== "running") clearRun(runKey);
            onClose();
          }}
        />
        {content}
      </div>
    );
    return (
      <>
        {}
        <span ref={anchorRef} hidden />
        {root ? createPortal(layer, root) : null}
      </>
    );
  };

  if (unavailable)
    return inLayer(
      <div className="corvus-assist">
        {header}
        <p className="corvus-assist-note">{unavailable}</p>
      </div>
    );

  return inLayer(
    <div className={asking ? "corvus-assist is-grill" : "corvus-assist"}>
      {header}

      {}
      {asking && <p className="corvus-assist-ask">{run.question}</p>}

      {}
      {asking && !typing && (
        <div className="corvus-assist-options">
          {run.options.map((o) => (
            <button
              key={o}
              type="button"
              className="corvus-assist-option"
              disabled={busy}
              onClick={() => answer(o, "guided")}
            >
              {o}
            </button>
          ))}
          <button
            type="button"
            className="corvus-assist-option is-write"
            disabled={busy}
            onClick={() => setTyping(true)}
          >
            <Icon name="pencil" size={14} />
            <span>{tr("Let me type")}</span>
          </button>
        </div>
      )}

      {}
      {(!asking || typing) && (
      <div className="corvus-assist-box">
        <textarea
          ref={fieldRef}
          className="corvus-assist-field"
          value={text}
          rows={asking ? 2 : 3}
          placeholder={
            asking ? tr("Or say it your way…") : tr(PLACEHOLDER[target])
          }
          aria-label={asking ? run.question : tr(PROMPT_LABEL[target])}
          disabled={busy}
          onChange={(e) => setText(e.currentTarget.value)}
        />
        <div className="corvus-assist-actions">
          {}
          {busy ? (
            <ThinkingInline since={run.startedAt} />
          ) : (
            <>
              {}
              {!asking && !startsEmpty && (
                <button
                  type="button"
                  className="corvus-assist-guided"
                  disabled={!text.trim()}
                  onClick={() => answer(text, "guided")}
                >
                  <Icon name="message-circle-question" size={15} />
                  <span>{tr("Grill me")}</span>
                </button>
              )}
              {}
              {typing && (
                <button
                  type="button"
                  className="corvus-assist-guided"
                  onClick={() => {
                    setTyping(false);
                    setText("");
                  }}
                >
                  <Icon name="chevron-left" size={15} />
                  <span>{tr("Options")}</span>
                </button>
              )}
              <button
                type="button"
                className="corvus-assist-cta"
                disabled={!text.trim() && !startsEmpty && !asking}
                onClick={() =>
                  answer(text, asking ? "guided" : "direct")
                }
              >
                <Icon name="sparkles" size={16} />
                <span>{asking ? tr("Send") : tr(ACTION_LABEL[target])}</span>
              </button>
            </>
          )}
        </div>
      </div>
      )}

      {}
      {busy && (
        <p className="corvus-assist-note">
          <Icon name="check" size={14} />
          <span>{tr("You can close this — it keeps writing.")}</span>
        </p>
      )}

      {run.phase === "error" && (
        <p className="corvus-assist-error" role="status">
          <Icon name="info" size={14} />
          <span>{run.error}</span>
        </p>
      )}
    </div>
  );
}

function AssistantSpark({
  onClick,
  title: title = tr("Write it for me"),
  busy,
}: {
  onClick: () => void;
  title?: string;

  busy?: boolean;
}) {
  const label = busy ? tr("{title} — writing…", { title }) : title;
  return (
    <button
      type="button"
      className={busy ? "corvus-assist-spark is-busy" : "corvus-assist-spark"}
      aria-label={label}
      title={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {}
      {busy ? <ThinkingGlyph /> : <Icon name="sparkles" size={16} />}
    </button>
  );
}

export function WithAssistant({
  children,
  open,
  onOpen,
  panel,
  busy,
  title,
}: {
  children: ReactNode;
  open: boolean;
  onOpen: () => void;

  panel: ReactNode;
  busy?: boolean;

  title?: string;
}) {
  return (
    <>
      <span className="corvus-spark-wrap">
        {children}
        {!open && (
          <AssistantSpark onClick={onOpen} busy={busy} title={title} />
        )}
      </span>
      {open && panel}
    </>
  );
}
