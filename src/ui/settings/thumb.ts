export interface Thumb {
  x: string;
  w: string;
}

export function thumbOf(row: HTMLElement): Thumb {
  return {
    x: row.style.getPropertyValue("--corvus-seg-x"),
    w: row.style.getPropertyValue("--corvus-seg-w"),
  };
}

export function seedThumb(row: HTMLElement, t: Thumb | null | undefined): void {
  if (!t?.x) return;
  row.style.setProperty("--corvus-seg-x", t.x);
  row.style.setProperty("--corvus-seg-w", t.w);
}

export function putThumb(row: HTMLElement): void {
  const active = row.querySelector<HTMLElement>(".corvus-seg-item.is-active");

  if (!active || active.offsetWidth === 0) return;
  const primeira = thumbOf(row).x === "";
  if (primeira) row.addClass("is-placing");
  row.style.setProperty("--corvus-seg-x", `${active.offsetLeft}px`);
  row.style.setProperty("--corvus-seg-w", `${active.offsetWidth}px`);
  if (primeira) {

    void row.offsetWidth;
    row.removeClass("is-placing");
  }
}
