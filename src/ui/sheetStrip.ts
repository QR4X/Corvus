export const SHEET_OPEN_CLASS = "corvus-sheet-open";

export function drawerInnerOf(el: Element | null | undefined): Element | null {
  return el?.closest(".workspace-drawer-inner") ?? null;
}

export function syncSheetStrip(inner: Element | null | undefined): void {
  if (!inner) return;
  inner.classList.toggle(
    SHEET_OPEN_CLASS,
    inner.querySelector(".corvus-root .corvus-sheet-layer.is-open") !== null
  );
}
