import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import { useSheetFull, useSheetLevel } from "./Sheet";
import { ICON_CATALOG, iconCatalogSize, iconCategoryOf } from "../iconCatalog";
import { wizardFoot } from "./wizard";
import { tr } from "../i18n/tr";

export function SheetField({
  label,
  hint,
  children,
}: {
  label: string;

  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="corvus-field">
      <span className="corvus-field-label">{label}</span>
      {hint && <span className="corvus-field-hint">{hint}</span>}
      {children}
    </div>
  );
}

function useAutoFocus<T extends HTMLElement>(enabled?: boolean) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    if (!enabled) return;
    ref.current?.focus({ preventScroll: true });
  }, [enabled]);
  return ref;
}

export function SheetInput({
  value,
  placeholder,
  autoFocus,
  withSpark,
  onChange,
}: {
  value: string;
  placeholder?: string;
  autoFocus?: boolean;

  withSpark?: boolean;
  onChange: (v: string) => void;
}) {
  const ref = useAutoFocus<HTMLInputElement>(autoFocus);
  return (
    <input
      ref={ref}

      className={
        withSpark ? "corvus-field-input corvus-has-spark" : "corvus-field-input"
      }
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.currentTarget.value)}
    />
  );
}

export function SheetTextarea({
  value,
  placeholder,
  rows = 6,
  withSpark,
  autoFocus,
  onChange,
}: {
  value: string;
  placeholder?: string;
  rows?: number;

  withSpark?: boolean;

  autoFocus?: boolean;
  onChange: (v: string) => void;
}) {
  const ref = useAutoFocus<HTMLTextAreaElement>(autoFocus);
  return (
    <textarea
      ref={ref}
      className={withSpark ? "corvus-textarea corvus-has-spark" : "corvus-textarea"}
      value={value}
      placeholder={placeholder}
      rows={rows}
      onChange={(e) => onChange(e.currentTarget.value)}
    />
  );
}

export function SheetChoices({
  items,
  value,
  onPick,
  label,
}: {
  items: Array<{
    id: string;
    label: string;
    icon?: string;

    count?: number;
  }>;
  value: string;
  onPick: (id: string) => void;
  label: string;
}) {
  return (
    <div className="corvus-choices" role="group" aria-label={label}>
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          className={it.id === value ? "corvus-choice is-on" : "corvus-choice"}
          aria-pressed={it.id === value}

          aria-label={
            it.count === undefined
              ? undefined
              : tr("{label}, {n} icons", { label: it.label, n: it.count })
          }
          onClick={() => onPick(it.id)}
        >
          {it.icon && <Icon name={it.icon} size={16} />}
          <span>{it.label}</span>
          {it.count !== undefined && (
            <sup className="corvus-choice-count" aria-hidden="true">
              {it.count}
            </sup>
          )}
        </button>
      ))}
    </div>
  );
}

function IconTile({
  icon,
  on,
  tint,
  onPick,
}: {
  icon: string;
  on: boolean;
  tint?: string;
  onPick: (icon: string) => void;
}) {
  return (
    <button
      type="button"
      className={
        "corvus-icontile" + (on ? " is-on" : "") + (on && tint ? " is-tinted" : "")
      }
      aria-label={icon}
      aria-pressed={on}

      style={on && tint ? { color: tint } : undefined}
      onClick={() => onPick(icon)}
    >
      <Icon name={icon} size={20} />
    </button>
  );
}

export function SheetIconGrid({
  icons,
  value,
  onPick,
  onBrowse,

  tint,
}: {
  icons: readonly string[];
  value: string;
  onPick: (icon: string) => void;

  onBrowse: () => void;
  tint?: string;
}) {

  const shortlist = icons.includes(value) ? [...icons] : [value, ...icons];

  return (
    <div className="corvus-icongrid" role="group" aria-label={tr("Icon")}>
      {shortlist.map((ic) => (
        <IconTile
          key={ic}
          icon={ic}
          on={ic === value}
          tint={tint}
          onPick={onPick}
        />
      ))}
      {}
      <button
        type="button"
        className="corvus-icontile is-more"
        aria-label={tr("More icons — {n} to choose from", {
          n: iconCatalogSize(),
        })}
        onClick={onBrowse}
      >
        <Icon name="plus" size={18} />
        <span className="corvus-more-label">{tr("More")}</span>
        <span className="corvus-more-count">{iconCatalogSize()}</span>
      </button>
    </div>
  );
}

export function SheetIconCatalog({
  value,
  onPick,
  onBack,
  tint,
  children,
}: {
  value: string;
  onPick: (icon: string) => void;
  onBack: () => void;
  tint?: string;

  children?: ReactNode;
}) {

  useSheetFull();

  useSheetLevel(tr("Icon"), onBack);

  const [category, setCategory] = useState(
    () => iconCategoryOf(value) ?? ICON_CATALOG[0].id
  );
  const current = ICON_CATALOG.find((c) => c.id === category) ?? ICON_CATALOG[0];

  return (
    <div className="corvus-iconcat">
      {}
      {children}
      <SheetChoices
        label={tr("Icon category")}
        value={current.id}
        onPick={setCategory}
        items={ICON_CATALOG.map((c) => ({
          id: c.id,

          label: tr(c.label),
          icon: c.icon,
          count: c.icons.length,
        }))}
      />
      <div className="corvus-icongrid" role="group" aria-label={tr(current.label)}>
        {current.icons.map((ic) => (
          <IconTile
            key={ic}
            icon={ic}
            on={ic === value}
            tint={tint}
            onPick={onPick}
          />
        ))}
      </div>
    </div>
  );
}

export function SheetSwatches({
  colors,
  value,
  onPick,
  resolve,
}: {
  colors: readonly string[];
  value: string;
  onPick: (color: string) => void;

  resolve: (color: string) => string;
}) {
  return (
    <div className="corvus-swatches" role="group" aria-label={tr("Color")}>
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          className={c === value ? "corvus-swatch is-on" : "corvus-swatch"}
          aria-label={c}
          aria-pressed={c === value}
          onClick={() => onPick(c)}
        >
          <span
            className="corvus-swatch-fill"
            style={{ backgroundColor: resolve(c) }}
          />
        </button>
      ))}
    </div>
  );
}

export function SheetSubmit({
  label,
  icon = "check",
  problem,
  onSubmit,
}: {
  label: string;
  icon?: string;

  problem?: string | null;
  onSubmit: () => void;
}) {
  return (
    <div className="corvus-form-foot">
      {problem && (
        <p className="corvus-form-problem" role="status">
          <Icon name="info" size={15} />
          <span>{problem}</span>
        </p>
      )}
      <button
        type="button"
        className="corvus-form-submit"
        aria-disabled={!!problem}
        onClick={onSubmit}
      >
        <Icon name={icon} size={18} />
        <span>{label}</span>
      </button>
    </div>
  );
}

export function SheetProgress({
  current,
  total,
}: {

  current: number;

  total: number;
}) {

  const steps = Math.max(total, 1);
  const done = Math.min(Math.max(current + 1, 1), steps);
  return (
    <div
      className="corvus-wiz-bar"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={steps}
      aria-valuenow={done}
      aria-label={tr("Step {n} of {total}", { n: done, total: steps })}
    >
      <span
        className="corvus-wiz-fill"
        style={{ width: `${(done / steps) * 100}%` }}
      />
    </div>
  );
}

export function SheetWizardFoot({
  current,
  total,
  onStep,
  problem,
  label,
  onSubmit,
}: {
  current: number;

  total: number;
  onStep: (i: number) => void;

  problem?: string | null;

  label: string;
  onSubmit: () => void;
}) {

  const foot = wizardFoot({ current, total, problem });
  return (
    <div className="corvus-form-foot">
      {foot.status === "problem" ? (

        <p className="corvus-form-problem" role="status">
          <Icon name="info" size={15} />
          <span>{problem}</span>
        </p>
      ) : foot.status === "shortcut" ? (

        <button type="button" className="corvus-wiz-now" onClick={onSubmit}>
          <Icon name="check" size={15} />
          <span>{tr("{label} now", { label })}</span>
        </button>
      ) : null}

      <button
        type="button"
        className="corvus-form-submit"
        aria-disabled={foot.primary === "submit" ? !foot.ready : undefined}
        onClick={() =>
          foot.primary === "submit" ? onSubmit() : onStep(current + 1)
        }
      >
        {foot.primary === "submit" ? (
          <>
            <Icon name="check" size={18} />
            <span>{label}</span>
          </>
        ) : (
          <>
            <span>{tr("Next")}</span>
            <Icon name="chevron-right" size={18} />
          </>
        )}
      </button>
    </div>
  );
}
