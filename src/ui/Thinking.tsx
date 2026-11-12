import { useEffect, useState } from "react";
import { tr } from "../i18n/tr";
import { elapsedLabel } from "./trace";
import { sharedTicker } from "./ticker";

export function ThinkingGlyph() {
  return (
    <span className="corvus-thinking-glyph" aria-hidden="true">
      <svg viewBox="0 0 24 24" className="corvus-glyph-a">
        <g
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          fill="none"
        >
          <line x1="12" y1="3" x2="12" y2="21" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="5.6" y1="5.6" x2="18.4" y2="18.4" />
          <line x1="18.4" y1="5.6" x2="5.6" y2="18.4" />
        </g>
      </svg>
      <svg viewBox="0 0 24 24" className="corvus-glyph-b">
        <g
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          fill="none"
        >
          <line x1="12" y1="6" x2="12" y2="18" />
          <line x1="6.8" y1="9" x2="17.2" y2="15" />
          <line x1="17.2" y1="9" x2="6.8" y2="15" />
        </g>
      </svg>
      <svg viewBox="0 0 24 24" className="corvus-glyph-c">
        <path
          d="M12 2.5c.7 4.4 2.4 6.1 6.8 6.8v1.4c-4.4.7-6.1 2.4-6.8 6.8h-1.4c-.7-4.4-2.4-6.1-6.8-6.8V9.3c4.4-.7 6.1-2.4 6.8-6.8z"
          fill="currentColor"
        />
      </svg>
    </span>
  );
}

export function ThinkingInline({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    return sharedTicker.subscribe(setNow);
  }, [since]);
  return (
    <span className="corvus-trace-toggle is-inline">
      <span className="corvus-trace-dot" aria-hidden="true" />
      <span className="corvus-trace-shimmer">{tr("Thinking…")}</span>
      <span className="corvus-trace-time">
        {elapsedLabel(Math.max(0, now - since))}
      </span>
    </span>
  );
}
