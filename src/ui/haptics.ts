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

const TAP_SLOP = 8;

const TAP_MAX_MS = 700;

export function isTap(dx: number, dy: number, ms: number): boolean {
  return Math.abs(dx) <= TAP_SLOP && Math.abs(dy) <= TAP_SLOP && ms <= TAP_MAX_MS;
}

export function hapticsOn(root: HTMLElement): () => void {
  let target: Element | null = null;
  let x = 0;
  let y = 0;
  let downAt = 0;

  const tappable = (e: Event): Element | null => {
    const el = e.target as HTMLElement | null;
    if (!el?.closest) return null;
    return el.closest(
      'button, a, [role="button"], input[type="checkbox"], .checkbox-container, select, .corvus-sheet-row, .corvus-seg-item'
    );
  };

  const onDown = (e: Event) => {
    const p = e as PointerEvent;
    target = tappable(e);
    x = p.clientX;
    y = p.clientY;
    downAt = Date.now();
  };

  const onUp = (e: Event) => {
    const p = e as PointerEvent;
    const pressed = target;
    target = null;
    if (!pressed) return;

    if (pressed !== tappable(e)) return;
    if (!isTap(p.clientX - x, p.clientY - y, Date.now() - downAt)) return;
    tap();
  };

  const onCancel = () => {
    target = null;
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
