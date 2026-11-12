import type { ActivityMeta } from "../store/chat";
import type { AIToolStep } from "../agent/types";
import { tr } from "../i18n/tr";

export type SummaryAction =
  | { kind: "step"; step: AIToolStep }
  | { kind: "activity"; activity: ActivityMeta }
  | { kind: "reasoning"; text: string };

export function thinkingStatus(activity?: ActivityMeta): string {
  if (
    activity?.phase === "pending" &&
    (activity.toolName || activity.iconPending !== "sparkles") &&
    activity.pendingText.trim()
  ) {
    return activity.pendingText.trim();
  }
  return "Waiting for model response";
}

function actionKey(action: SummaryAction): string {
  if (action.kind === "step") {
    return `step|${action.step.name}|${JSON.stringify(action.step.arguments ?? {})}|${action.step.ok}`;
  }
  if (action.kind === "activity") {
    const a = action.activity;
    const text =
      a.phase === "pending" ? a.pendingText : a.doneText ?? a.failedText ?? "";
    return `activity|${a.phase}|${a.toolName ?? ""}|${text}`;
  }
  return `reasoning|${action.text.trim()}`;
}

export function compactActions<T extends SummaryAction>(actions: T[]): T[] {
  const out: T[] = [];
  let previous = "";
  for (const action of actions) {
    if (action.kind === "reasoning" && !action.text.trim()) continue;
    const key = actionKey(action);
    if (key === previous) continue;
    previous = key;
    out.push(action);
  }
  return out;
}

export function thinkingLabel(activity?: ActivityMeta): string {
  return tr(thinkingStatus(activity));
}
