import type { App } from "obsidian";
import type { ImageAttachment } from "../providers/base";
import { ensureFolder } from "./vaultFs";
import { IMAGE_GENERATION_FOLDER } from "./vaultPaths";

export function isImageExt(ext: string): boolean {
  return ["png", "jpg", "jpeg", "webp", "gif"].includes(ext.toLowerCase());
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
  const fromName = name?.split(".").pop() ?? "";
  return isImageExt(fromName) ? fromName.toLowerCase() : "png";
}

export async function persistLocalImage(
  app: App,
  att: ImageAttachment
): Promise<ImageAttachment> {
  if (att.path || /^https?:/i.test(att.dataUrl)) return att;
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(att.dataUrl);
  if (!m) return att;
  const path = `${IMAGE_GENERATION_FOLDER}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${imageExt(m[1], att.name)}`;
  try {
    await ensureFolder(app.vault.adapter, IMAGE_GENERATION_FOLDER);
    await app.vault.adapter.writeBinary(path, base64ToArrayBuffer(m[2]));
    return { ...att, path, mimeType: m[1] };
  } catch {
    return att;
  }
}
