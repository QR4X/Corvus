import { TFile, TFolder, type App } from "obsidian";
import type { MessageAttachment, NoteAttachment } from "../providers/base";
import { isImageExt } from "../core/imageStore";
import { GENERATION_FOLDER } from "../core/vaultPaths";
import { tr } from "../i18n/tr";

export interface ArtifactLike {
  path: string;
  basename: string;
  extension: string;
  mtime: number;
}

const MEDIA_EXTS = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "mp3",
  "wav",
  "ogg",
  "webm",
  "m4a",
  "mp4",
  "mov",
]);

export function rankArtifacts(
  files: readonly ArtifactLike[],
  limit = 40
): ArtifactLike[] {
  return files
    .filter(
      (f) =>
        f.path.startsWith(`${GENERATION_FOLDER}/`) &&
        MEDIA_EXTS.has(f.extension.toLowerCase())
    )
    .slice()
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit);
}

export function vaultArtifacts(app: App): ArtifactLike[] {
  const folder = app.vault.getAbstractFileByPath(GENERATION_FOLDER);
  if (!(folder instanceof TFolder)) return [];
  const out: ArtifactLike[] = [];

  const walk = (f: TFolder): void => {
    for (const child of f.children) {
      if (child instanceof TFolder) walk(child);
      else if (child instanceof TFile) {
        out.push({
          path: child.path,
          basename: child.basename,
          extension: child.extension,
          mtime: child.stat?.mtime ?? 0,
        });
      }
    }
  };
  walk(folder);
  return out;
}

export function normalizeUrl(input: string): string | null {
  const url = input.trim();
  if (!url) return null;
  const full = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  try {
    const u = new URL(full);
    return u.hostname.includes(".") ? u.toString() : null;
  } catch {
    return null;
  }
}

export function linkNote(url: string, title: string | null, text: string): NoteAttachment {
  return {
    type: "note",
    path: title ? `${title} — ${url}` : url,
    content: `Fonte: ${url}\n\n${text}`,
  };
}

export function artifactIcon(ext: string): string {
  if (isImageExt(ext)) return "image";
  return ["mp4", "mov", "webm"].includes(ext.toLowerCase())
    ? "file-video"
    : "file-audio";
}

export function noteKind(path: string): "link" | "pasted" | "vault" {
  if (path.includes(" — http") || /^https?:\/\//.test(path)) return "link";
  if (path.startsWith("Pasted text")) return "pasted";
  return "vault";
}

export function attachmentThumb(
  a: MessageAttachment
): { kind: "image"; url: string } | { kind: "emoji"; char: string } {
  if (a.type === "image") {
    return a.dataUrl
      ? { kind: "image", url: a.dataUrl }
      : { kind: "emoji", char: "🖼️" };
  }
  if (a.type === "pdf") return { kind: "emoji", char: "📕" };
  if (a.type === "audio") return { kind: "emoji", char: "🎙️" };
  const origin = noteKind(a.path);
  if (origin === "link") return { kind: "emoji", char: "🔗" };
  if (origin === "pasted") return { kind: "emoji", char: "📋" };
  return { kind: "emoji", char: "📄" };
}

export function attachmentLabel(a: MessageAttachment): string {
  if (a.type === "note") {

    const cut = a.path.indexOf(" — http");
    if (cut > 0) return a.path.slice(0, cut);
    if (/^https?:\/\//.test(a.path)) {
      try {
        return new URL(a.path).hostname;
      } catch {
        return a.path;
      }
    }

    const pasted = /^Pasted text \(([^)]*)\)$/.exec(a.path);
    if (pasted) return tr("Pasted text ({size})", { size: pasted[1] });
    return a.path.split("/").pop() ?? a.path;
  }
  if (a.type === "image") return a.name ?? tr("Image");
  if (a.type === "pdf") return a.name;
  return a.path.split("/").pop() ?? tr("Audio");
}

