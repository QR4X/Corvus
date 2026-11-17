import { TFile, TFolder, type App, type TAbstractFile } from "obsidian";
import { tr } from "../i18n/tr";

export class UndoConflict extends Error {}

interface UndoAction {

  run(force?: boolean): Promise<string>;
}

type Snapshot =
  | { tool: "vault_create"; path: string }
  | { tool: "vault_edit"; path: string; content: string }
  | { tool: "vault_move"; from: string; to: string }
  | { tool: "vault_delete"; path: string; isFolder: true }
  | { tool: "vault_delete"; path: string; isFolder: false; bytes: ArrayBuffer }
  | { tool: "vault_create_folder"; path: string };

const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

function cleanPath(p: unknown): string {
  return (typeof p === "string" ? p : "")
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
}

function parentDir(p: string): string {
  return p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
}

async function ensureFolder(app: App, folder: string): Promise<void> {
  if (!folder || app.vault.getAbstractFileByPath(folder)) return;
  await ensureFolder(app, parentDir(folder));
  await app.vault.createFolder(folder);
}

function vaultTrashMode(app: App): "system" | "local" | "none" | null {
  const vault = app.vault as unknown as { getConfig?: (k: string) => unknown };
  try {
    const v = vault.getConfig?.("trashOption");
    return v === "system" || v === "local" || v === "none" ? v : null;
  } catch {
    return null;
  }
}

export function deleteGoesToTrash(app: App): boolean {
  const l = vaultTrashMode(app);
  return l === "system" || l === "local";
}

export async function snapshotBefore(
  app: App,
  name: string,
  args: Record<string, unknown>
): Promise<Snapshot | null> {
  switch (name) {
    case "vault_create":
      return { tool: name, path: cleanPath(args.path) };
    case "vault_edit": {
      const path = cleanPath(args.path);
      const f = app.vault.getAbstractFileByPath(path);
      if (!(f instanceof TFile)) return null;
      return { tool: name, path, content: await app.vault.read(f) };
    }
    case "vault_move":
      return { tool: name, from: cleanPath(args.from), to: cleanPath(args.to) };
    case "vault_delete": {
      const path = cleanPath(args.path);
      const f = app.vault.getAbstractFileByPath(path);
      if (f instanceof TFolder) return { tool: name, path, isFolder: true };
      if (!(f instanceof TFile)) return null;
      if ((f.stat?.size ?? 0) > MAX_BACKUP_BYTES) return null;

      return { tool: name, path, isFolder: false, bytes: await app.vault.readBinary(f) };
    }
    case "vault_create_folder": {
      const path = cleanPath(args.path);

      if (app.vault.getAbstractFileByPath(path)) return null;
      return { tool: name, path };
    }
    default:
      return null;
  }
}

async function readText(app: App, path: string): Promise<{ f: TFile; text: string } | null> {
  const f = app.vault.getAbstractFileByPath(path);
  if (!(f instanceof TFile)) return null;
  return { f, text: await app.vault.read(f) };
}

export async function buildUndo(app: App, snapshot: Snapshot): Promise<UndoAction | null> {
  switch (snapshot.tool) {
    case "vault_create": {
      const now = await readText(app, snapshot.path);
      if (!now) return null;
      const written = now.text;
      return {
        async run(force) {
          const current = await readText(app, snapshot.path);
          if (!current) throw new Error(tr("{path} no longer exists.", { path: snapshot.path }));
          if (current.text !== written && !force) {
            throw new UndoConflict(
              tr("{path} changed after the agent created it.", { path: snapshot.path })
            );
          }
          await app.fileManager.trashFile(current.f);
          return tr("Removed {path}", { path: snapshot.path });
        },
      };
    }
    case "vault_edit": {
      const now = await readText(app, snapshot.path);
      if (!now) return null;
      const written = now.text;
      return {
        async run(force) {
          const current = await readText(app, snapshot.path);
          if (!current) throw new Error(tr("{path} no longer exists.", { path: snapshot.path }));
          if (current.text !== written && !force) {
            throw new UndoConflict(
              tr("{path} changed after the agent's edit.", { path: snapshot.path })
            );
          }
          await app.vault.process(current.f, () => snapshot.content);
          return tr("Restored {path}", { path: snapshot.path });
        },
      };
    }
    case "vault_move":
      return {
        async run() {
          const target: TAbstractFile | null = app.vault.getAbstractFileByPath(snapshot.to);
          if (!target) throw new Error(tr("Nothing at {path} anymore.", { path: snapshot.to }));
          if (app.vault.getAbstractFileByPath(snapshot.from)) {
            throw new Error(tr("{path} is taken now — move it by hand.", { path: snapshot.from }));
          }
          await ensureFolder(app, parentDir(snapshot.from));

          await app.fileManager.renameFile(target, snapshot.from);
          return tr("Moved back to {path}", { path: snapshot.from });
        },
      };
    case "vault_delete":
      return {
        async run() {
          if (app.vault.getAbstractFileByPath(snapshot.path)) {
            throw new Error(
              tr("{path} exists again — nothing to restore over.", { path: snapshot.path })
            );
          }
          await ensureFolder(app, parentDir(snapshot.path));
          if (snapshot.isFolder) {
            await app.vault.createFolder(snapshot.path);
          } else {
            await app.vault.createBinary(snapshot.path, snapshot.bytes);
          }
          return tr("Restored {path}", { path: snapshot.path });
        },
      };
    case "vault_create_folder":
      return {
        async run() {
          const d = app.vault.getAbstractFileByPath(snapshot.path);
          if (!(d instanceof TFolder)) {
            throw new Error(tr("{path} no longer exists.", { path: snapshot.path }));
          }

          if (d.children.length > 0) {
            throw new Error(tr("{path} has files in it now.", { path: snapshot.path }));
          }
          await app.fileManager.trashFile(d);
          return tr("Removed folder {path}", { path: snapshot.path });
        },
      };
  }
}

const undoRegistry = new Map<string, UndoAction>();

export function registerUndo(id: string, d: UndoAction): void {
  undoRegistry.set(id, d);
}

export function canUndo(id: string | undefined): boolean {
  return !!id && undoRegistry.has(id);
}

export async function undo(id: string, force = false): Promise<string> {
  const d = undoRegistry.get(id);
  if (!d) throw new Error(tr("This change can no longer be undone."));
  const message = await d.run(force);
  undoRegistry.delete(id);
  return message;
}

export function clearUndos(): void {
  undoRegistry.clear();
}
