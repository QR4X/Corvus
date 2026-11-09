import { Platform } from "obsidian";

let enabled = true;

export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

function can(): boolean {
  return (
    enabled &&
    Platform.isMobile &&
    typeof navigator !== "undefined" &&
    typeof navigator.vibrate === "function"
  );
}

function buzz(pattern: number | number[]): void {
  if (!can()) return;
  try {
    navigator.vibrate(pattern);
  } catch { void 0; }
}

export function tap(): void {
  buzz(8);
}

export function screen(): void {
  buzz(14);
}

export function commit(): void {
  buzz([12, 30, 18]);
}

export function warn(): void {
  buzz([20, 45, 20]);
}

const FOLGA = 8;

const LIMITE_MS = 700;

export function ehToque(dx: number, dy: number, ms: number): boolean {
  return Math.abs(dx) <= FOLGA && Math.abs(dy) <= FOLGA && ms <= LIMITE_MS;
}

export function hapticsOn(root: HTMLElement): () => void {
  let alvo: Element | null = null;
  let x = 0;
  let y = 0;
  let em = 0;

  const acionavel = (e: Event): Element | null => {
    const el = e.target as HTMLElement | null;
    if (!el?.closest) return null;
    return el.closest(
      'button, a, [role="button"], input[type="checkbox"], .checkbox-container, select, .corvus-sheet-row, .corvus-seg-item'
    );
  };

  const onDown = (e: Event) => {
    const p = e as PointerEvent;
    alvo = acionavel(e);
    x = p.clientX;
    y = p.clientY;
    em = Date.now();
  };

  const onUp = (e: Event) => {
    const p = e as PointerEvent;
    const era = alvo;
    alvo = null;
    if (!era) return;

    if (era !== acionavel(e)) return;
    if (!ehToque(p.clientX - x, p.clientY - y, Date.now() - em)) return;
    tap();
  };

  const onCancel = () => {
    alvo = null;
  };

  root.addEventListener("pointerdown", onDown, { capture: true });
  root.addEventListener("pointerup", onUp, { capture: true });
  root.addEventListener("pointercancel", onCancel, { capture: true });
  return () => {
    root.removeEventListener("pointerdown", onDown, true);
    root.removeEventListener("pointerup", onUp, true);
    root.removeEventListener("pointercancel", onCancel, true);
  };
}
