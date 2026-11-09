import type { NoteAttachment } from "../providers/base";

export const PASTE_LIMIT = 1200;

export function pasteIsBig(texto: string, limite = PASTE_LIMIT): boolean {
  return texto.length > limite;
}

export function humanSize(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k >= 10 ? Math.round(k) : k.toFixed(1)}k`;
}

export function pastedNote(texto: string): NoteAttachment {
  return {
    type: "note",
    path: `Pasted text (${humanSize(texto.length)})`,
    content: texto,
  };
}
