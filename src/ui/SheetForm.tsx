import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import { useSheetFull, useSheetLevel } from "./Sheet";
import { ICON_CATALOG, iconCatalogSize, iconCategoryOf } from "../iconCatalog";
import { peDoWizard } from "./wizard";
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

function useFocarCampo<T extends HTMLElement>(ligado?: boolean) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    if (!ligado) return;
    ref.current?.focus({ preventScroll: true });
  }, [ligado]);
  return ref;
}

export function SheetInput({
  value,
  placeholder,
  autoFocus,
  comSpark,
  onChange,
}: {
  value: string;
  placeholder?: string;
  autoFocus?: boolean;

  comSpark?: boolean;
  onChange: (v: string) => void;
}) {
  const ref = useFocarCampo<HTMLInputElement>(autoFocus);
  return (
    <input
      ref={ref}

      className={
        comSpark ? "corvus-field-input corvus-has-spark" : "corvus-field-input"
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
  comSpark,
  autoFocus,
  onChange,
}: {
  value: string;
  placeholder?: string;
  rows?: number;

  comSpark?: boolean;

  autoFocus?: boolean;
  onChange: (v: string) => void;
}) {
  const ref = useFocarCampo<HTMLTextAreaElement>(autoFocus);
  return (
    <textarea
      ref={ref}
      className={comSpark ? "corvus-textarea corvus-has-spark" : "corvus-textarea"}
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

  const curtos = icons.includes(value) ? [...icons] : [value, ...icons];

  return (
    <div className="corvus-icongrid" role="group" aria-label={tr("Icon")}>
      {curtos.map((ic) => (
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
        <span className="corvus-more-rotulo">{tr("More")}</span>
        <span className="corvus-more-conta">{iconCatalogSize()}</span>
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

  const [aba, setAba] = useState(
    () => iconCategoryOf(value) ?? ICON_CATALOG[0].id
  );
  const atual = ICON_CATALOG.find((c) => c.id === aba) ?? ICON_CATALOG[0];

  return (
    <div className="corvus-iconcat">
      {}
      {children}
      <SheetChoices
        label={tr("Icon category")}
        value={atual.id}
        onPick={setAba}
        items={ICON_CATALOG.map((c) => ({
          id: c.id,

          label: tr(c.label),
          icon: c.icon,
          count: c.icons.length,
        }))}
      />
      <div className="corvus-icongrid" role="group" aria-label={tr(atual.label)}>
        {atual.icons.map((ic) => (
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
  problema,
  onSubmit,
}: {
  label: string;
  icon?: string;

  problema?: string | null;
  onSubmit: () => void;
}) {
  return (
    <div className="corvus-form-foot">
      {problema && (
        <p className="corvus-form-problem" role="status">
          <Icon name="info" size={15} />
          <span>{problema}</span>
        </p>
      )}
      <button
        type="button"
        className="corvus-form-submit"
        aria-disabled={!!problema}
        onClick={onSubmit}
      >
        <Icon name={icon} size={18} />
        <span>{label}</span>
      </button>
    </div>
  );
}

export function SheetProgress({
  atual,
  total,
}: {

  atual: number;

  total: number;
}) {

  const passos = Math.max(total, 1);
  const feito = Math.min(Math.max(atual + 1, 1), passos);
  return (
    <div
      className="corvus-wiz-bar"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={passos}
      aria-valuenow={feito}
      aria-label={tr("Step {n} of {total}", { n: feito, total: passos })}
    >
      <span
        className="corvus-wiz-fill"
        style={{ width: `${(feito / passos) * 100}%` }}
      />
    </div>
  );
}

export function SheetWizardFoot({
  atual,
  total,
  onPasso,
  problema,
  label,
  onSubmit,
}: {
  atual: number;

  total: number;
  onPasso: (i: number) => void;

  problema?: string | null;

  label: string;
  onSubmit: () => void;
}) {

  const pe = peDoWizard({ atual, total, problema });
  return (
    <div className="corvus-form-foot">
      {pe.status === "problema" ? (

        <p className="corvus-form-problem" role="status">
          <Icon name="info" size={15} />
          <span>{problema}</span>
        </p>
      ) : pe.status === "atalho" ? (

        <button type="button" className="corvus-wiz-now" onClick={onSubmit}>
          <Icon name="check" size={15} />
          <span>{tr("{label} now", { label })}</span>
        </button>
      ) : null}

      <button
        type="button"
        className="corvus-form-submit"
        aria-disabled={pe.primario === "submit" ? !pe.pronto : undefined}
        onClick={() =>
          pe.primario === "submit" ? onSubmit() : onPasso(atual + 1)
        }
      >
        {pe.primario === "submit" ? (
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
