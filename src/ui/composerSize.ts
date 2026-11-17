const HEIGHT_FRACTION = 0.4;

const MIN_HEIGHT = 72;

export function composerMaxHeight(
  windowHeight: number,
  keyboardHeight = 0,
  viewportHeight?: number
): number {
  const candidates = [windowHeight - keyboardHeight];
  if (viewportHeight && viewportHeight > 0) candidates.push(viewportHeight);
  const visible = Math.min(...candidates.filter((n) => n > 0));

  const base = Number.isFinite(visible) && visible > 0 ? visible : windowHeight;

  return Math.max(MIN_HEIGHT, Math.floor(base * HEIGHT_FRACTION));
}

export function readKeyboardHeight(doc: Document): number {
  const raw = doc.documentElement.style.getPropertyValue("--keyboard-height");
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
