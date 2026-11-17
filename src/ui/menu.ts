import { setIcon } from "obsidian";
import { screen } from "./haptics";
import { tr } from "../i18n/tr";

export interface MenuAction {
  label: string;
  icon?: string;

  glyph?: string;

  color?: string;
  danger?: boolean;

  checked?: boolean;

  children?: MenuAction[];

  extra?: { icon: string; label: string; run: (button: HTMLButtonElement) => void };
  run?: () => void;
}

interface MenuEvent {
  clientX?: number;
  clientY?: number;
  currentTarget?: EventTarget | null;
}

const GAP = 6;
const MARGIN = 10;

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export function popoverPosition(params: {

  anchor: Pick<Box, "left" | "top" | "right" | "bottom">;

  root: Box;

  viewport: { width: number; height: number };

  popover: { width: number; height: number };
}): { x: number; y: number; origin: "top right" | "bottom right" } {
  const { anchor, root, viewport, popover } = params;

  const visTop = Math.max(0, -root.top);
  const visBottom = Math.min(root.height, viewport.height - root.top);
  const visLeft = Math.max(0, -root.left);
  const visRight = Math.min(root.width, viewport.width - root.left);

  let x = anchor.right - root.left - popover.width;
  x = Math.min(
    Math.max(x, visLeft + MARGIN),
    Math.max(visLeft + MARGIN, visRight - popover.width - MARGIN)
  );

  const below = anchor.bottom - root.top + GAP;
  const above = anchor.top - root.top - popover.height - GAP;

  let y = below + popover.height > visBottom - MARGIN ? above : below;

  y = Math.min(
    Math.max(y, visTop + MARGIN),
    Math.max(visTop + MARGIN, visBottom - popover.height - MARGIN)
  );

  return {
    x: Math.round(x),
    y: Math.round(y),

    origin: y > anchor.top - root.top ? "top right" : "bottom right",
  };
}

interface MenuOptions {

  pick?: boolean;

  onClose?: () => void;
}

export function pickSide(params: {
  anchor: Pick<Box, "top" | "bottom">;
  viewportHeight: number;

  popoverHeight: number;
}): { direction: "down" | "up"; maxHeight: number } {
  const { anchor, viewportHeight, popoverHeight } = params;
  const spaceBelow = viewportHeight - MARGIN - anchor.bottom;
  const spaceAbove = anchor.top - MARGIN;
  const direction = popoverHeight <= spaceBelow || spaceBelow >= spaceAbove ? "down" : "up";
  return {
    direction,
    maxHeight: Math.max(0, Math.floor(direction === "down" ? spaceBelow : spaceAbove)),
  };
}

export function openActions(
  ev: MenuEvent,
  actions: MenuAction[],
  opts: MenuOptions = {}
): void {
  if (actions.length === 0) return;

  const anchorEl = (ev.currentTarget as HTMLElement | null) ?? null;

  const doc = anchorEl?.ownerDocument ?? document;
  const win = doc.defaultView ?? window;

  const appRoot = anchorEl
    ? anchorEl.closest<HTMLElement>(".corvus-root")
    : doc.querySelector<HTMLElement>(".corvus-root");
  const loose = !appRoot;
  const root =
    appRoot ??
    anchorEl?.closest<HTMLElement>(".modal-container") ??
    doc.body;

  const layer = root.createDiv({
    cls: loose ? "corvus-pop-layer is-loose" : "corvus-pop-layer",
  });
  const popover = layer.createDiv({
    cls: opts.pick ? "corvus-pop is-pick" : "corvus-pop",
    attr: { role: "menu" },
  });
  let close = () => {};

  const item = (
    parent: HTMLElement,
    a: MenuAction,
    onTap: () => void
  ): HTMLButtonElement => {

    const row = a.extra ? parent.createDiv({ cls: "corvus-pop-row", attr: { role: "none" } }) : parent;
    const b = row.createEl("button", {
      cls:
        "corvus-pop-item" +
        (a.danger ? " is-danger" : "") +
        (a.checked ? " is-checked" : ""),

      attr:
        a.checked === undefined
          ? { type: "button", role: "menuitem" }
          : { type: "button", role: "menuitemradio", "aria-checked": String(a.checked) },
    });
    if (a.glyph) {
      b.createSpan({ cls: "corvus-pop-ico corvus-pop-glyph", text: a.glyph });
    } else if (a.icon) {

      const ico = b.createSpan({
        cls: a.color ? "corvus-pop-ico corvus-thing-mark" : "corvus-pop-ico",
      });
      if (a.color) ico.style.color = a.color;

      setIcon(ico, a.icon);
    }
    b.createSpan({ cls: "corvus-pop-label", text: a.label });
    if (a.checked) {
      setIcon(b.createSpan({ cls: "corvus-pop-check" }), "check");
    }
    if (a.children) {
      setIcon(b.createSpan({ cls: "corvus-pop-chev" }), "chevron-right");
    }
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      onTap();
    });
    if (a.extra) {
      const { icon, label, run } = a.extra;
      const x = row.createEl("button", {
        cls: "corvus-pop-extra",
        attr: { type: "button", role: "menuitem", "aria-label": label },
      });
      setIcon(x, icon);
      x.addEventListener("click", (e) => {

        e.stopPropagation();
        run(x);
      });
    }
    return b;
  };

  const render = (items: MenuAction[], back: (() => void) | null): void => {
    while (popover.firstChild) popover.removeChild(popover.firstChild);
    if (back) {
      const backItem = item(popover, { label: tr("Back"), icon: "chevron-left" }, back);
      backItem.classList.add("is-back");
    }
    for (const a of items) {
      item(popover, a, () => {
        if (a.children) {
          render(a.children, () => render(items, back));
          return;
        }
        close();
        a.run?.();
      });
    }
    position();
  };

  function position(): void {
    const r = anchorEl?.getBoundingClientRect?.();

    const base = layer.getBoundingClientRect();

    if (opts.pick && r && anchorEl) {

      popover.addClass("is-down");
      popover.removeClass("is-up");
      popover.setCssStyles({ width: `${r.width}px`, maxHeight: "" });
      const { direction, maxHeight } = pickSide({
        anchor: r,
        viewportHeight: win.innerHeight,
        popoverHeight: popover.offsetHeight,
      });
      const down = direction === "down";
      popover.toggleClass("is-down", down);
      popover.toggleClass("is-up", !down);
      anchorEl.toggleClass("is-open-down", down);
      anchorEl.toggleClass("is-open-up", !down);

      popover.setCssStyles({
        left: `${r.left - base.left}px`,
        top: down ? `${r.bottom - base.top}px` : "auto",
        bottom: down ? "auto" : `${base.bottom - r.top}px`,
        maxHeight: `${maxHeight}px`,
        transformOrigin: down ? "top center" : "bottom center",
      });
      return;
    }
    const anchor = r ?? {
      left: (ev.clientX ?? 0) - 1,
      right: (ev.clientX ?? 0) + 1,
      top: (ev.clientY ?? 0) - 1,
      bottom: (ev.clientY ?? 0) + 1,
    };

    const { x, y, origin } = popoverPosition({
      anchor,
      root: base,
      viewport: { width: win.innerWidth, height: win.innerHeight },

      popover: { width: popover.offsetWidth, height: popover.offsetHeight },
    });

    popover.style.left = `${x}px`;
    popover.style.top = `${y}px`;
    popover.style.transformOrigin = origin;
  }

  render(actions, null);

  const checkedItem = popover.querySelector<HTMLElement>(".corvus-pop-item.is-checked");
  if (checkedItem && popover.scrollHeight > popover.clientHeight) {
    popover.scrollTop = Math.max(
      0,
      checkedItem.offsetTop - (popover.clientHeight - checkedItem.offsetHeight) / 2
    );
  }
  layer.classList.add("is-open");
  screen();

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();

      if (loose) e.stopPropagation();
      close();
    }
  };

  const onScroll = (e: Event) => {
    if (popover.contains(e.target as Node | null)) return;
    close();
  };
  const scrollRoot: Document | HTMLElement = loose ? doc : root;
  close = () => {
    doc.removeEventListener("keydown", onKey);
    scrollRoot.removeEventListener("scroll", onScroll, { capture: true });
    anchorEl?.removeClass("is-open-down", "is-open-up");
    layer.remove();
    opts.onClose?.();
  };
  layer.addEventListener("click", close);
  doc.addEventListener("keydown", onKey);
  scrollRoot.addEventListener("scroll", onScroll, { capture: true });
}
