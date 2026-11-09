import type { CSSProperties } from "react";

export interface SegmentOption {
  id: string;
  label: string;

  dot?: boolean;
}

export function Segmented({
  options,
  value,
  label,
  onChange,
}: {
  options: SegmentOption[];
  value: string;

  label: string;
  onChange: (id: string) => void;
}) {

  const idx = Math.max(
    options.findIndex((o) => o.id === value),
    0
  );

  return (
    <div
      className="corvus-modes"
      role="group"
      aria-label={label}
      style={
        {
          "--corvus-seg": idx,
          "--corvus-seg-n": options.length,
        } as CSSProperties
      }
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={o.id === value ? "corvus-mode is-active" : "corvus-mode"}
          aria-pressed={o.id === value}
          onClick={() => onChange(o.id)}
        >
          <span>{o.label}</span>
          {o.dot && <span className="corvus-seg-dot" aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}
