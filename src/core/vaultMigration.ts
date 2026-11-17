import { Notice, type DataAdapter } from "obsidian";
import type { CorvusSettings } from "../settings";
import { tr } from "../i18n/tr";
import { CHATS_FOLDER, HIDDEN_MOVES, legacyModeMoves, shouldMigrate } from "./vaultPaths";
import { CHAT_MODES } from "./session";

async function hasEntries(ad: DataAdapter, folder: string): Promise<boolean> {
  if (!(await ad.exists(folder))) return false;
  try {
    const listing = await ad.list(folder);
    return listing.files.length + listing.folders.length > 0;
  } catch {
    return true;
  }
}

async function moveFolder(ad: DataAdapter, from: string, to: string): Promise<void> {
  if (!(await ad.exists(to))) await ad.mkdir(to);
  const listing = await ad.list(from);
  for (const sub of listing.folders) {
    await moveFolder(ad, sub, `${to}/${sub.split("/").pop()}`);
  }
  for (const file of listing.files) {
    const target = `${to}/${file.split("/").pop()}`;
    await ad.writeBinary(target, await ad.readBinary(file));
    if (!(await ad.exists(target))) throw new Error(`failed to write ${target}`);
    await ad.remove(file);
  }
  const left = await ad.list(from);
  if (left.files.length === 0 && left.folders.length === 0) await ad.rmdir(from, false);
}

export async function migrateLegacyFolders(
  ad: DataAdapter,
  settings: CorvusSettings,
  save: () => Promise<void>
): Promise<void> {
  let moved = false;
  for (const mv of HIDDEN_MOVES) {
    const go = shouldMigrate({
      currentPath: settings[mv.field],
      legacy: mv.legacy,
      target: mv.target,
      sourceExists: await ad.exists(mv.legacy),
      targetExists: await hasEntries(ad, mv.target),
    });
    if (!go) continue;
    try {
      await moveFolder(ad, mv.legacy, mv.target);
      settings[mv.field] = mv.target;
      moved = true;
    } catch (err) {
      console.error(`[corvus] migration of ${mv.legacy} failed:`, err);
    }
  }
  const appRoot = CHATS_FOLDER.split("/")[0];
  for (const m of legacyModeMoves(appRoot, CHATS_FOLDER, CHAT_MODES)) {
    if (!(await ad.exists(m.from))) continue;
    if ((await ad.list(m.from)).files.length === 0) continue;
    try {
      await moveFolder(ad, m.from, m.to);
      moved = true;
    } catch (err) {
      console.error(`[corvus] migration of ${m.from} failed:`, err);
    }
  }
  if (!moved) return;
  await save();
  new Notice(
    tr(
      "Corvus moved your chats into a visible folder — file-sync plugins (Google Drive, Obsidian Sync…) copy them between devices now, and they show up in the vault's search and file list."
    ),
    10000
  );
}
