import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import { SearchField } from "./SearchField";
import { screen, tap, warn } from "./haptics";
import { drawerInnerOf, syncSheetStrip } from "./sheetStrip";
import { tr } from "../i18n/tr";

const SheetSizeCtx = createContext<{
  expand: () => void;
  fit: () => void;
  reset: () => void;
}>({
  expand: () => {},
  fit: () => {},
  reset: () => {},
});

export function useSheetFull(): void {
  const { expand } = useContext(SheetSizeCtx);
  useEffect(() => {
    expand();
  }, [expand]);
}

export function useSheetFit(active: boolean): void {
  const { fit } = useContext(SheetSizeCtx);
  useEffect(() => {
    if (active) fit();
  }, [active, fit]);
}

export function useSheetDefault(): void {
  const { reset } = useContext(SheetSizeCtx);
  useEffect(() => {
    reset();
  }, [reset]);
}

const SheetLevelCtx = createContext<{
  push: (title: string, back: () => void) => void;
  pop: () => void;
}>({ push: () => {}, pop: () => {} });

export function useSheetLevel(title: string, back: () => void): void {
  const { push, pop } = useContext(SheetLevelCtx);

  const ref = useRef(back);
  ref.current = back;
  useEffect(() => {
    push(title, () => ref.current());
    return () => pop();
  }, [title, push, pop]);
}

const PULL_THRESHOLD = 72;

export function Sheet({
  title,
  mark,
  footer,
  progress,
  action,
  open,
  onClose,
  onBack,
  startFull,
  minSize,
  focusOnOpen = true,
  children,
}: {
  title: string;

  mark?: { icon: string; color?: string };

  footer?: ReactNode;

  progress?: ReactNode;

  action?: {
    icon: string;

    label: string;

    text?: string;
    onClick: () => void;
  };
  open: boolean;
  onClose: () => void;

  onBack?: () => void;

  startFull?: boolean;

  minSize?: "mid";

  focusOnOpen?: boolean;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setPortalRoot(panelRef.current?.closest<HTMLElement>(".corvus-root") ?? null);
  }, []);

  useLayoutEffect(() => {
    const inner = drawerInnerOf(panelRef.current);
    syncSheetStrip(inner);
    return () => {
      queueMicrotask(() => syncSheetStrip(inner));
    };
  }, [open]);

  const [size, setSize] = useState<"peek" | "full" | "fit">(
    startFull ? "full" : "peek"
  );
  const startY = useRef<number | null>(null);
  const dragY = useRef(0);

  const sizeRef = useRef(size);
  sizeRef.current = size;

  const expand = useCallback(() => setSize("full"), []);
  const fit = useCallback(() => setSize("fit"), []);
  const reset = useCallback(
    () => setSize(startFull ? "full" : "peek"),
    [startFull]
  );
  const api = useMemo(
    () => ({ expand, fit, reset }),
    [expand, fit, reset]
  );

  const [nested, setNested] = useState<{
    title: string;
    back: () => void;
  } | null>(null);
  const levelApi = useMemo(
    () => ({
      push: (title: string, back: () => void) =>
        setNested({ title, back }),
      pop: () => setNested(null),
    }),
    []
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    const doc = panelRef.current?.ownerDocument ?? document;
    doc.addEventListener("keydown", onKey);
    return () => doc.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    if (focusOnOpen) panelRef.current?.focus({ preventScroll: true });

    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [open, focusOnOpen]);

  useEffect(() => {
    const el = panelRef.current;
    if (!open || !el) return;
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") setSize("full");
    };
    el.addEventListener("focusin", onFocusIn);
    return () => el.removeEventListener("focusin", onFocusIn);
  }, [open]);

  useEffect(() => {
    const el = bodyRef.current;
    if (!open || !el) return;
    const onScroll = () => {
      if (el.scrollTop > 8) setSize("full");
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [open]);

  useEffect(() => {
    if (!open) setSize(startFull ? "full" : "peek");
  }, [open, startFull]);

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    screen();
  }, [open]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    startY.current = e.clientY;
    dragY.current = 0;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch { void 0; }
    panelRef.current?.classList.add("is-dragging");
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (startY.current === null) return;
    const dy = e.clientY - startY.current;
    dragY.current = dy;
    const el = panelRef.current;

    if (el) el.style.transform = `translateY(${Math.max(dy, dy * 0.35)}px)`;
  };

  const onPointerUp = () => {
    if (startY.current === null) return;
    const dy = dragY.current;
    startY.current = null;
    const el = panelRef.current;
    if (el) {
      el.setCssStyles({ transform: "" });
      el.classList.remove("is-dragging");
    }
    if (dy < -48) {
      setSize("full");
      tap();
    } else if (dy > 48) {
      if (size === "full") setSize("peek");
      else onClose();
      tap();
    }
  };

  useEffect(() => {
    const el = bodyRef.current;
    const panel = panelRef.current;
    if (!open || !el || !panel) return;

    let y0: number | null = null;
    let dy = 0;
    let edge: "top" | "bottom" | null = null;

    const isInTextField = (target: EventTarget | null): boolean => {
      const el = target as HTMLElement | null;
      const field = el?.closest?.(
        "input, textarea, [contenteditable='true']"
      ) as HTMLElement | null;
      if (!field) return false;

      return field.ownerDocument.activeElement === field;
    };

    const begin = (y: number) => {
      const atTop = el.scrollTop <= 0;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;

      edge = atTop ? "top" : atBottom ? "bottom" : null;
      y0 = y;
      dy = 0;
    };

    const move = (y: number): boolean => {
      if (y0 === null || edge === null) return false;
      const d = y - y0;
      const pulling =
        (edge === "top" && d > 0) || (edge === "bottom" && d < 0);
      if (!pulling) {
        dy = 0;
        panel.setCssStyles({ transform: "" });
        return false;
      }
      dy = d;
      panel.classList.add("is-dragging");

      panel.style.transform = `translateY(${d > 0 ? d : d * 0.25}px)`;
      return true;
    };

    const release = () => {
      const b = edge;
      const d = dy;
      y0 = null;
      edge = null;
      dy = 0;
      panel.setCssStyles({ transform: "" });
      panel.classList.remove("is-dragging");

      if (b === "top" && d > PULL_THRESHOLD) {
        if (sizeRef.current === "full") setSize("peek");
        else onClose();
        tap();
      } else if (b === "bottom" && d < -PULL_THRESHOLD) {
        setSize("full");
        tap();
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      if (isInTextField(e.target)) {

        y0 = null;
        edge = null;
        return;
      }
      if (e.touches.length === 1) begin(e.touches[0].clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      if (move(e.touches[0].clientY) && e.cancelable) e.preventDefault();
    };

    const onDown = (e: PointerEvent) => {
      if (isInTextField(e.target)) return;
      if (e.pointerType !== "touch") begin(e.clientY);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "touch") move(e.clientY);
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType !== "touch") release();
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", release);
    el.addEventListener("touchcancel", release);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", release);
      el.removeEventListener("touchcancel", release);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [open, onClose]);

  return (
    <div
      className={open ? "corvus-sheet-layer is-open" : "corvus-sheet-layer"}
      aria-hidden={!open}
    >
      <div className="corvus-scrim" onClick={onClose} />
      <div
        ref={panelRef}
        className={
          size === "full"
            ? "corvus-sheet is-full"
            : size === "fit"
              ? "corvus-sheet is-fit"
              : minSize === "mid"
                ? "corvus-sheet is-mid"
                : "corvus-sheet"
        }
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div
          className="corvus-sheet-drag"
          title={tr("Drag to resize")}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="corvus-sheet-grab" aria-hidden="true" />
        </div>
        <header className="corvus-sheet-head">
          <button
            type="button"
            className="corvus-icon-btn"
            aria-label={nested || onBack ? tr("Back") : tr("Close")}
            onClick={nested ? nested.back : (onBack ?? onClose)}
          >
            <Icon name={nested || onBack ? "chevron-left" : "x"} />
          </button>
          <h3 className="corvus-sheet-title">
            {}
            {mark && (
              <span
                className="corvus-sheet-mark"
                style={mark.color ? { color: mark.color } : undefined}
                aria-hidden="true"
              >
                <Icon name={mark.icon} size={16} />
              </span>
            )}
            <span className="corvus-sheet-title-text">
              {nested?.title ?? title}
            </span>
          </h3>
          {}
          {action && (
            <button
              type="button"
              className="corvus-sheet-action"
              aria-label={action.label}
              title={action.label}
              onClick={action.onClick}
            >
              <Icon name={action.icon} size={18} />
              {action.text && <span>{action.text}</span>}
            </button>
          )}
          {nested || onBack ? (
            <button
              type="button"
              className="corvus-icon-btn"
              aria-label={tr("Close")}
              onClick={onClose}
            >
              <Icon name="x" />
            </button>
          ) : (
            !action && (
              <span className="corvus-sheet-head-spacer" aria-hidden="true" />
            )
          )}
        </header>
        {progress}
        <div ref={bodyRef} className="corvus-sheet-body">
          <SheetSizeCtx.Provider value={api}>
            <SheetLevelCtx.Provider value={levelApi}>
              {children}
            </SheetLevelCtx.Provider>
          </SheetSizeCtx.Provider>
        </div>
        {footer && <div className="corvus-sheet-actions">{footer}</div>}
      </div>
      {}
      {open && footer && portalRoot
        ? createPortal(
            <div className="corvus-float-foot">
              <div className="corvus-float-foot-card">{footer}</div>
            </div>,
            portalRoot
          )
        : null}
    </div>
  );
}

export function SheetTiles({ children }: { children: ReactNode }) {
  return <div className="corvus-sheet-tiles">{children}</div>;
}

export function SheetTile({
  icon,
  label,

  hint,
  disabled,
  onClick,
}: {
  icon: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={disabled ? "corvus-sheet-tile is-off" : "corvus-sheet-tile"}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} size={26} />
      <span className="corvus-sheet-tile-label">{label}</span>
      {hint && <span className="corvus-sheet-tile-hint">{hint}</span>}
    </button>
  );
}

export function SheetSearch({
  value,
  placeholder,
  onChange,
  found,
  invalid,
  autoFocus,
}: {
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  found?: number;

  invalid?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <div className="corvus-sheet-search">
      <SearchField
        value={value}
        placeholder={placeholder}
        found={found}
        invalid={invalid}
        autoFocus={autoFocus}
        onChange={onChange}
      />
    </div>
  );
}

export function SheetGroup({
  children,
  label,
}: {
  children: ReactNode;

  label?: string;
}) {
  if (!label) return <div className="corvus-sheet-group">{children}</div>;
  return (
    <div className="corvus-sheet-block">
      <span className="corvus-sheet-group-label">{label}</span>
      <div className="corvus-sheet-group">{children}</div>
    </div>
  );
}

export function SheetTabs({
  items,
  activeId,
  onPick,
  label,
}: {
  items: { id: string; label: string; count: number }[];
  activeId: string;
  onPick: (id: string) => void;
  label: string;
}) {
  return (
    <div className="corvus-sheet-tabs" role="group" aria-label={label}>
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          className={
            it.id === activeId
              ? "corvus-sheet-tab is-active"
              : "corvus-sheet-tab"
          }
          aria-pressed={it.id === activeId}
          onClick={() => onPick(it.id)}
        >
          <span>{it.label}</span>
          <span className="corvus-sheet-tab-count">{it.count}</span>
        </button>
      ))}
    </div>
  );
}

export function SheetSeg({
  items,
  activeId,
  onPick,
  onBlocked,
  label,
}: {
  items: {
    id: string;
    icon: string;
    label: string;

    health?: "off" | "unknown" | "ok" | "fail";

    blocked?: string | null;
  }[];
  activeId: string;
  onPick: (id: string) => void;

  onBlocked?: (id: string, reason: string, insisted: boolean) => void;
  label: string;
}) {
  const index = Math.max(
    items.findIndex((i) => i.id === activeId),
    0
  );

  const [insistedId, setInsistedId] = useState<string | null>(null);
  return (
    <div
      className="corvus-sheet-seg"
      role="group"
      aria-label={label}
      style={
        {
          "--corvus-seg": index,
          "--corvus-seg-count": items.length,
        } as CSSProperties
      }
    >
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          className={
            "corvus-sheet-seg-item" +
            (it.id === activeId ? " is-active" : "") +
            (it.blocked ? " is-blocked" : "")
          }
          aria-pressed={it.id === activeId}
          aria-label={it.label}
          title={it.blocked ? `${it.label} — ${it.blocked}` : it.label}

          aria-disabled={!!it.blocked && it.id !== activeId}
          onClick={() => {
            const locked = !!it.blocked && it.id !== activeId;
            if (!locked) {
              setInsistedId(null);
              onPick(it.id);
              return;
            }
            warn();
            onBlocked?.(it.id, it.blocked ?? "", insistedId === it.id);
            setInsistedId(it.id);
          }}
        >
          <span className="corvus-sheet-seg-mark">
            <Icon name={it.icon} size={20} />
            {it.health && (
              <span
                className={`corvus-seg-dot is-${it.health}`}
                aria-hidden="true"
              />
            )}
          </span>
        </button>
      ))}
    </div>
  );
}

export function SheetNavRow({
  title,
  note,
  icon,
  onClick,
}: {
  title: string;
  note?: string;

  icon?: string;
  onClick: () => void;
}) {

  return (
    <button type="button" className="corvus-sheet-row is-nav" onClick={onClick}>
      {icon && (
        <Icon
          name={icon}
          size={20}
          className="corvus-sheet-row-icon is-badge"
        />
      )}
      <span className="corvus-sheet-row-title">{title}</span>
      {note && <span className="corvus-sheet-row-value">{note}</span>}
      <Icon name="chevron-right" size={18} className="corvus-sheet-chev" />
    </button>
  );
}

export function SheetToggleRow({
  title,
  note,
  icon,
  on,
  onToggle,
}: {
  title: string;
  note?: string;
  icon?: string;
  on: boolean;
  onToggle: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="corvus-sheet-row is-nav"
      role="switch"
      aria-checked={on}
      onClick={() => onToggle(!on)}
    >
      {icon && (
        <Icon name={icon} size={20} className="corvus-sheet-row-icon is-badge" />
      )}
      <span className="corvus-sheet-row-title">{title}</span>
      {note && <span className="corvus-sheet-row-value">{note}</span>}
      {}
      <span
        className={on ? "corvus-switch is-on" : "corvus-switch"}
        aria-hidden="true"
      >
        <span className="corvus-switch-knob" />
      </span>
    </button>
  );
}

export function SheetNote({ children }: { children: ReactNode }) {
  return <p className="corvus-sheet-note">{children}</p>;
}

export function SheetRow({
  title,
  note,
  tag,
  selected,
  dense,
  icon,
  iconTone,
  badge,
  chevron,
  action,
  onClick,
}: {
  title: string;

  note?: string;

  tag?: string;
  selected?: boolean;

  dense?: boolean;

  icon?: string;

  iconTone?: "danger";

  badge?: boolean;

  chevron?: boolean;

  action?: {
    icon: string;
    label: string;
    on?: boolean;
    onClick: () => void;
  };
  onClick: () => void;
}) {
  const row = (
    <button
      type="button"
      className={
        "corvus-sheet-row" +
        (selected ? " is-active" : "") +
        (dense ? " is-dense" : "")
      }
      aria-pressed={selected === true}
      onClick={onClick}
    >
      {icon && (
        <Icon
          name={icon}
          size={badge ? 20 : dense ? 16 : 18}
          className={
            (badge ? "corvus-sheet-row-icon is-badge" : "corvus-sheet-row-icon") +
            (iconTone === "danger" ? " is-danger" : "")
          }
        />
      )}
      {dense ? (
        <>
          <span className="corvus-sheet-row-title">
            {title}
            {tag && <span className="corvus-sheet-tag">{tag}</span>}
          </span>
          {note && <span className="corvus-sheet-row-value">{note}</span>}
        </>
      ) : (
        <span className="corvus-sheet-row-main">
          <span className="corvus-sheet-row-title">
            {title}
            {tag && <span className="corvus-sheet-tag">{tag}</span>}
          </span>
          {note && <span className="corvus-sheet-row-note">{note}</span>}
        </span>
      )}
      {selected && <Icon name="check" size={20} className="corvus-sheet-check" />}
      {chevron && (
        <Icon name="chevron-right" size={18} className="corvus-sheet-chev" />
      )}
    </button>
  );
  if (!action) return row;
  return (
    <div className="corvus-sheet-row-wrap">
      {row}
      <button
        type="button"
        className={
          action.on
            ? "corvus-sheet-row-action is-on"
            : "corvus-sheet-row-action"
        }
        aria-label={action.label}
        aria-pressed={action.on === true}
        title={action.label}
        onClick={action.onClick}
      >
        <Icon name={action.icon} size={18} />
      </button>
    </div>
  );
}
