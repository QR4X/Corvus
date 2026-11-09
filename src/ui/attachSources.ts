import { TFile, TFolder, type App } from "obsidian";
import type { ImageAttachment, MessageAttachment, NoteAttachment } from "../providers/base";
import { ensureFolder } from "../core/chatPersistence";
import { tr } from "../i18n/tr";

export const GENERATION_DIR = "corvus-ai/generation";

export const IMAGE_GENERATION_DIR = `${GENERATION_DIR}/images`;

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

export function isImageExt(ext: string): boolean {
  return ["png", "jpg", "jpeg", "webp", "gif"].includes(ext.toLowerCase());
}

export function rankArtifacts(
  arquivos: readonly ArtifactLike[],
  limite = 40
): ArtifactLike[] {
  return arquivos
    .filter(
      (f) =>
        f.path.startsWith(`${GENERATION_DIR}/`) &&
        MIDIA.has(f.extension.toLowerCase())
    )
    .slice()
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limite);
}

export function vaultArtifacts(app: App): ArtifactLike[] {
  const pasta = app.vault.getAbstractFileByPath(GENERATION_DIR);
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

export function htmlToText(html: string, max = 20000): string {
  const limpo = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")

    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return limpo.length > max ? `${limpo.slice(0, max)}\n\n[…]` : limpo;
}

export function htmlTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const t = m ? m[1].replace(/\s+/g, " ").trim() : "";
  return t || null;
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

export function noteKind(path: string): "link" | "pasted" | "reel" | "vault" {
  if (path.startsWith("🎞️") || path.includes("Reel (")) return "reel";
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
  if (origem === "reel") return { kind: "emoji", char: "🎞️" };
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

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return buf;
}

function imageExt(mime: string, name: string | undefined): string {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  const nome = name?.split(".").pop() ?? "";
  return isImageExt(nome) ? nome.toLowerCase() : "png";
}

export async function persistLocalImage(
  app: App,
  att: ImageAttachment
): Promise<ImageAttachment> {
  if (att.path || /^https?:/i.test(att.dataUrl)) return att;
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(att.dataUrl);
  if (!m) return att;
  const path = `${IMAGE_GENERATION_DIR}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${imageExt(m[1], att.name)}`;
  try {
    await ensureFolder(app.vault.adapter, IMAGE_GENERATION_DIR);
    await app.vault.adapter.writeBinary(path, base64ToArrayBuffer(m[2]));
    return { ...att, path, mimeType: m[1] };
  } catch {
    return att;
  }
}
