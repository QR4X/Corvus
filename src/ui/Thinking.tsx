import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import type { ActivityMeta } from "../store/chat";
import { thinkingLabel } from "./thinkingSummary";

export function elapsedLabel(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const resto = s % 60;
  return `${m}m ${String(resto).padStart(2, "0")}s`;
}

export { thinkingStatus } from "./thinkingSummary";

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

export function ThinkingLine({

  count,

  since,

  activity,
  onOpen,
}: {
  count: number;
  since: number;
  activity?: ActivityMeta;
  onOpen: () => void;
}) {
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    setAgora(Date.now());
    const t = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [since]);

  const passado = Math.max(0, agora - since);
  const texto = thinkingLabel(activity);

  return (
    <button
      type="button"
      className="corvus-thinking"
      disabled={count === 0}
      onClick={onOpen}
    >
      <ThinkingGlyph />
      <span className="corvus-thinking-label">
        <span className="corvus-thinking-time">{elapsedLabel(passado)}</span>
        <span className="corvus-thinking-dot"> · </span>
        {texto}
      </span>
      {count > 0 && <Icon name="chevron-right" size={15} />}
    </button>
  );
}

export function ThinkingInline({ since }: { since: number }) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    setAgora(Date.now());
    const t = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [since]);
  const passado = Math.max(0, agora - since);
  return (
    <span className="corvus-thinking is-inline">
      <ThinkingGlyph />
      <span className="corvus-thinking-label">
        <span className="corvus-thinking-time">{elapsedLabel(passado)}</span>
        <span className="corvus-thinking-dot"> · </span>
        {thinkingLabel()}
      </span>
    </span>
  );
}
