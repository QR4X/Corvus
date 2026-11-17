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

const MIDIA = new Set([
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
  arquivos: readonly ArtifactLike[],
  limite = 40
): ArtifactLike[] {
  return arquivos
    .filter(
      (f) =>
        f.path.startsWith(`${GENERATION_FOLDER}/`) &&
        MIDIA.has(f.extension.toLowerCase())
    )
    .slice()
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limite);
}

export function vaultArtifacts(app: App): ArtifactLike[] {
  const pasta = app.vault.getAbstractFileByPath(GENERATION_FOLDER);
  if (!(pasta instanceof TFolder)) return [];
  const saida: ArtifactLike[] = [];

  const desce = (f: TFolder): void => {
    for (const filho of f.children) {
      if (filho instanceof TFolder) desce(filho);
      else if (filho instanceof TFile) {
        saida.push({
          path: filho.path,
          basename: filho.basename,
          extension: filho.extension,
          mtime: filho.stat?.mtime ?? 0,
        });
      }
    }
  };
  desce(pasta);
  return saida;
}

export function normalizeUrl(entrada: string): string | null {
  const url = entrada.trim();
  if (!url) return null;
  const cheia = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  try {
    const u = new URL(cheia);
    return u.hostname.includes(".") ? u.toString() : null;
  } catch {
    return null;
  }
}

export function linkNote(url: string, titulo: string | null, texto: string): NoteAttachment {
  return {
    type: "note",
    path: titulo ? `${titulo} — ${url}` : url,
    content: `Fonte: ${url}\n\n${texto}`,
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
  const origem = noteKind(a.path);
  if (origem === "link") return { kind: "emoji", char: "🔗" };
  if (origem === "pasted") return { kind: "emoji", char: "📋" };
  return { kind: "emoji", char: "📄" };
}

export function attachmentLabel(a: MessageAttachment): string {
  if (a.type === "note") {

    const corte = a.path.indexOf(" — http");
    if (corte > 0) return a.path.slice(0, corte);
    if (/^https?:\/\//.test(a.path)) {
      try {
        return new URL(a.path).hostname;
      } catch {
        return a.path;
      }
    }

    const colado = /^Pasted text \(([^)]*)\)$/.exec(a.path);
    if (colado) return tr("Pasted text ({size})", { size: colado[1] });
    return a.path.split("/").pop() ?? a.path;
  }
  if (a.type === "image") return a.name ?? tr("Image");
  if (a.type === "pdf") return a.name;
  return a.path.split("/").pop() ?? tr("Audio");
}

