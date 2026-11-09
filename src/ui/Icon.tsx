import { setIcon } from "obsidian";
import { useEffect, useRef } from "react";

export function Icon({
  name,
  size,
  className,
}: {
  name: string;

  size?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
    setIcon(el, name);
    if (size) {
      const svg = el.querySelector("svg");
      svg?.setAttribute("width", String(size));
      svg?.setAttribute("height", String(size));
    }
  }, [name, size]);

  return (
    <span
      ref={ref}
      className={className ? `corvus-icon ${className}` : "corvus-icon"}
      aria-hidden="true"
    />
  );
}
