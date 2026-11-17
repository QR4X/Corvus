import { Notice, type App } from "obsidian";
import { UndoConflict, undo, canUndo } from "../agent/undo";
import { useChatStore, type ActivityMeta } from "../store/chat";
import { ConfirmModal } from "./modals";
import { tr } from "../i18n/tr";

export function undoableId(a: ActivityMeta | undefined): string | null {
  if (!a || a.undone || a.phase !== "done") return null;
  return canUndo(a.undoId) ? (a.undoId as string) : null;
}

export function undoableIds(activities: Array<ActivityMeta | undefined>): string[] {
  return activities.map(undoableId).filter((id): id is string => id !== null);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function undoOne(app: App, id: string): Promise<boolean> {
  try {
    const summary = await undo(id);
    useChatStore.getState().markUndone(id);
    new Notice(summary);
    return true;
  } catch (err) {
    if (!(err instanceof UndoConflict)) {
      new Notice(tr("Could not undo: {error}", { error: errorMessage(err) }));
      return false;
    }
    const ok = await new ConfirmModal(app, {
      title: tr("Undo anyway?"),
      body: tr("{message} Undoing now throws away what changed since.", {
        message: err.message,
      }),
      confirmLabel: tr("Undo anyway"),
      danger: true,
    }).openAndWait();
    if (!ok) return false;
    try {
      const summary = await undo(id, true);
      useChatStore.getState().markUndone(id);
      new Notice(summary);
      return true;
    } catch (err2) {
      new Notice(tr("Could not undo: {error}", { error: errorMessage(err2) }));
      return false;
    }
  }
}

export async function undoTurn(app: App, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const ok = await new ConfirmModal(app, {
    title:
      ids.length === 1
        ? tr("Undo the agent's change?")
        : tr("Undo the agent's {n} changes?", { n: ids.length }),
    body: tr(
      "Notes go back to how they were before this turn. Anything you changed by hand since is kept."
    ),
    confirmLabel: tr("Undo"),
  }).openAndWait();
  if (!ok) return;
  let undone = 0;
  let skipped = 0;
  const failures: string[] = [];
  for (const id of [...ids].reverse()) {
    try {
      await undo(id);
      useChatStore.getState().markUndone(id);
      undone++;
    } catch (err) {
      if (err instanceof UndoConflict) skipped++;
      else failures.push(errorMessage(err));
    }
  }
  const parts = [
    undone === 1 ? tr("1 change undone") : tr("{n} changes undone", { n: undone }),
  ];
  if (skipped > 0) {
    parts.push(
      skipped === 1
        ? tr("1 kept because the note changed since (undo it from the action list to force)")
        : tr(
            "{n} kept because the note changed since (undo them from the action list to force)",
            { n: skipped }
          )
    );
  }
  if (failures.length > 0) {
    parts.push(
      failures.length === 1
        ? tr("1 failed: {error}", { error: failures[0] })
        : tr("{n} failed: {error}", { n: failures.length, error: failures[0] })
    );
  }
  new Notice(parts.join(" · "), failures.length || skipped ? 8000 : 4000);
}
