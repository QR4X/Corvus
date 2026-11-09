const FRACAO = 0.4;

const MINIMO = 72;

export function composerMaxHeight(
  alturaJanela: number,
  alturaTeclado = 0,
  alturaViewport?: number
): number {
  const candidatos = [alturaJanela - alturaTeclado];
  if (alturaViewport && alturaViewport > 0) candidatos.push(alturaViewport);
  const visivel = Math.min(...candidatos.filter((n) => n > 0));

  const base = Number.isFinite(visivel) && visivel > 0 ? visivel : alturaJanela;

  return Math.max(MINIMO, Math.floor(base * FRACAO));
}

export function readKeyboardHeight(doc: Document): number {
  const bruto = doc.documentElement.style.getPropertyValue("--keyboard-height");
  const n = parseFloat(bruto);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
