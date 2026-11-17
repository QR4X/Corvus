import { useEffect, useRef } from "react";
import { Icon } from "./Icon";
import { tr } from "../i18n/tr";

export function SearchField({
  value,
  placeholder,
  onChange,
  found,
  invalid,
  autoFocus,
  label,
  onOpen,
}: {
  value: string;
  placeholder: string;
  onChange: (v: string) => void;

  found?: number;

  invalid?: boolean;

  autoFocus?: boolean;

  label?: string;

  onOpen?: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {

    if (!autoFocus) return;

    ref.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const searching = value.trim().length > 0;

  if (onOpen) {
    return (
      <button
        type="button"
        className="corvus-search-field is-trigger"
        aria-label={label ?? placeholder}
        onClick={onOpen}
      >
        <Icon name="search" size={18} />
        <span className={searching ? "corvus-search-text" : "corvus-search-text is-empty"}>
          {searching ? value : placeholder}
        </span>
        {searching && found !== undefined && (
          <span className="corvus-search-found">
            {found === 1 ? tr("1 found") : tr("{n} found", { n: found })}
          </span>
        )}
      </button>
    );
  }

  return (
    <label className={invalid ? "corvus-search-field is-bad" : "corvus-search-field"}>
      <Icon name="search" size={18} />
      <input
        ref={ref}
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        onChange={(e) => onChange(e.currentTarget.value)}
      />
      {searching && found !== undefined && (
        <span className="corvus-search-found">
          {}
          {invalid ? `${tr("literal")} · ` : ""}
          {found === 1 ? tr("1 found") : tr("{n} found", { n: found })}
        </span>
      )}
    </label>
  );
}
