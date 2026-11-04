// src/ui/attachSources.ts
// As fontes de contexto do "+": além da nota do vault, o que dá pra grudar
// numa mensagem — PDF, link e o que o próprio plugin gerou (artefatos).
//
// Tudo que é decisão (o que é artefato, o que sobra de uma página web, o que
// vira rótulo) mora aqui, fora do componente, pra dar pra testar sem UI.

import { TFile, TFolder, type App } from "obsidian";
import type { ImageAttachment, MessageAttachment, NoteAttachment } from "../providers/base";
import { ensureFolder } from "../core/chatPersistence";
import { tr } from "../i18n/tr";

/** Onde o plugin salva o que gera (imagens, áudio, vídeo + sidecar .md). */
export const GENERATION_DIR = "axxa-ai/generation";

/** Onde as imagens ANEXADAS a mensagens são gravadas (uma vez, no envio). */
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

/**
 * O que o plugin gerou, mais recente primeiro. Só a MÍDIA: o sidecar `.md` de
 * cada arquivo é metadata, e listar os dois lado a lado dobraria a lista sem
 * acrescentar nada.
 */
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

/**
 * Os artefatos que o plugin gerou — lendo SÓ a pasta dele.
 *
 * Isto chamava `vault.getFiles()`, ou seja, enumerava o vault inteiro pra
 * depois o `rankArtifacts` jogar fora tudo que não estivesse em
 * `GENERATION_DIR`. Enumerar milhares de notas pra listar o que nós mesmos
 * criamos numa pasta é caro e é ver mais do que precisamos: a pasta é nossa,
 * então lê-se a pasta.
 */
export function vaultArtifacts(app: App): ArtifactLike[] {
  const pasta = app.vault.getAbstractFileByPath(GENERATION_DIR);
  if (!(pasta instanceof TFolder)) return [];
  const saida: ArtifactLike[] = [];
  // A pasta tem subpastas (uma por tipo), então desce — mas só dentro dela.
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

/**
 * Texto legível de uma página web. Não é um parser de HTML — é o suficiente
 * pra o modelo ler: tira script/style, transforma tag em espaço, desfaz as
 * entidades mais comuns e junta os brancos.
 */
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
    // Espaço colado na quebra é sobra de tag, não texto.
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return limpo.length > max ? `${limpo.slice(0, max)}\n\n[…]` : limpo;
}

/** O <title> da página, quando dá — é o que vira rótulo do chip. */
export function htmlTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const t = m ? m[1].replace(/\s+/g, " ").trim() : "";
  return t || null;
}

/** Completa o endereço digitado sem protocolo (é o que todo mundo digita). */
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

/** A página vira contexto de texto, com a fonte no topo pra ficar citável. */
export function linkNote(url: string, titulo: string | null, texto: string): NoteAttachment {
  return {
    type: "note",
    path: titulo ? `${titulo} — ${url}` : url,
    content: `Fonte: ${url}\n\n${texto}`,
  };
}

/** Ícone do artefato pelo que ele É: imagem, som ou vídeo. */
export function artifactIcon(ext: string): string {
  if (isImageExt(ext)) return "image";
  return ["mp4", "mov", "webm"].includes(ext.toLowerCase())
    ? "file-video"
    : "file-audio";
}

/** Uma "nota" anexada pode ter quatro origens, e o chip precisa saber qual:
 *  o texto colado, o link web, o transkript de reel e a nota do vault de verdade. */
export function noteKind(path: string): "link" | "pasted" | "reel" | "vault" {
  if (path.startsWith("🎞️") || path.includes("Reel (")) return "reel";
  if (path.includes(" — http") || /^https?:\/\//.test(path)) return "link";
  if (path.startsWith("Pasted text")) return "pasted";
  return "vault";
}

/**
 * O que aparece no chip: a MINIATURA de verdade quando o conteúdo é visual
 * (foto, print, imagem gerada), e um emoji correspondente quando não há o que
 * mostrar. Um ícone genérico pra tudo fazia três anexos diferentes parecerem
 * o mesmo anexo repetido.
 */
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

/** Rótulo curto: o nome do arquivo, não o caminho inteiro. */
export function attachmentLabel(a: MessageAttachment): string {
  if (a.type === "note") {
    // Link: o rótulo é o título (ou o host) — cortar na barra transformava
    // "…/spaced-repetition" em "spaced", que não diz nada.
    const corte = a.path.indexOf(" — http");
    if (corte > 0) return a.path.slice(0, corte);
    if (/^https?:\/\//.test(a.path)) {
      try {
        return new URL(a.path).hostname;
      } catch {
        return a.path;
      }
    }
    // Texto colado: o caminho (que o modelo vê) continua em inglês; o chip
    // mostra o rótulo no idioma da interface.
    const colado = /^Pasted text \(([^)]*)\)$/.exec(a.path);
    if (colado) return tr("Pasted text ({size})", { size: colado[1] });
    return a.path.split("/").pop() ?? a.path;
  }
  if (a.type === "image") return a.name ?? tr("Image");
  if (a.type === "pdf") return a.name;
  return a.path.split("/").pop() ?? tr("Audio");
}

// ── Imagem anexada → arquivo no vault ─────────────────────────────────────
// O chat .md é reescrito a cada mensagem; embutir a imagem nele (data URL)
// faria o arquivo crescer pra sempre. Então o envio grava os bytes UMA vez na
// pasta de geração e o .md persiste só o path — pequeno e estável.

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return buf;
}

/** Extensão da imagem pelo mime; fallback: a do nome do arquivo (senão png). */
function imageExt(mime: string, name: string | undefined): string {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  const nome = name?.split(".").pop() ?? "";
  return isImageExt(nome) ? nome.toLowerCase() : "png";
}

/**
 * Grava os bytes de uma imagem `data:` no vault (a pasta de geração) e devolve
 * o anexo com o `path` de volta — é esse path que persiste no .md, não os
 * bytes. URL externa (http) e falha de escrita devolvem o anexo SEM path: a
 * imagem ainda aparece no turno, só não sobrevive a um reload.
 */
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
