import type { AssistantTurn } from "./run";
import { tr } from "../i18n/tr";

type RunPhase =
  | "idle"
  | "running"
  | "asking"
  | "done"
  | "error";

export interface Run {
  phase: RunPhase;

  turns: AssistantTurn[];

  question: string;
  options: string[];

  result: unknown;
  error: string;

  startedAt: number;
}

const IDLE_RUN: Run = {
  phase: "idle",
  turns: [],
  question: "",
  options: [],
  result: null,
  error: "",
  startedAt: 0,
};

const runs = new Map<string, Run>();
const listeners = new Map<string, Set<() => void>>();

function notify(key: string): void {
  for (const f of listeners.get(key) ?? []) f();
}

export function getRun(key: string): Run {
  return runs.get(key) ?? IDLE_RUN;
}

export function subscribe(key: string, listener: () => void): () => void {
  const set = listeners.get(key) ?? new Set();
  set.add(listener);
  listeners.set(key, set);
  return () => set.delete(listener);
}

function patchRun(key: string, patch: Partial<Run>): void {
  runs.set(key, { ...getRun(key), ...patch });
  notify(key);
}

export interface RoundResult {
  question?: string;
  options?: string[];
  error?: string;
  draft?: unknown;
}

export function startRun(
  key: string,
  turns: AssistantTurn[],
  call: (turns: AssistantTurn[]) => Promise<RoundResult>,
  onDone?: (r: Run) => void
): void {
  patchRun(key, {
    phase: "running",
    startedAt: Date.now(),
    turns,
    question: "",
    options: [],
    error: "",
    result: null,
  });
  void call(turns)
    .then((r) => {
      if (r.error) {
        patchRun(key, { phase: "error", error: r.error });
      } else if (r.question) {

        patchRun(key, {
          phase: "asking",
          question: r.question,
          options: r.options ?? [],
          turns: [...turns, { role: "assistant", text: r.question }],
        });
      } else {
        patchRun(key, { phase: "done", result: r.draft ?? null });
      }
      onDone?.(getRun(key));
    })
    .catch((e: unknown) => {

      patchRun(key, {
        phase: "error",
        error: (e as Error)?.message || tr("The assistant could not answer."),
      });
      onDone?.(getRun(key));
    });
}

export function clearRun(key: string): void {
  runs.delete(key);
  notify(key);
}

export function _resetRuns(): void {
  runs.clear();
  listeners.clear();
}
