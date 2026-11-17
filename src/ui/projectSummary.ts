import type { Project } from "../projects";
import { relativeShort } from "./modules";
import { instructionsSection, attachedNotesSection } from "../agent/conversation";
import { estimateTokens } from "../core/tokens";
import { tr } from "../i18n/tr";

export function summarizeProject(
  p: Project,
  chats: readonly { id: string; title: string; date: string }[],
  now: number = Date.now()
): { when: string; about: string | null; chatCount: number } {
  const ids = new Set(p.chatIds);
  const own = chats
    .filter((c) => ids.has(c.id))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const latest = own[0];
  const ago = (iso: string) => {
    const r = relativeShort(iso, now);
    if (!r) return "";

    if (r === tr("now")) return tr("just now");

    return /^\d+[mhd]$/.test(r) ? tr("{time} ago", { time: r }) : r;
  };
  const when = ago(latest ? latest.date : p.createdAt);
  const firstLine = (p.instructions ?? "")
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  const about =
    firstLine ??
    (latest?.title.trim()
      ? tr("Latest: {title}", { title: latest.title.trim() })
      : null);
  return { when, about, chatCount: own.length };
}

export function projectInputTokens(
  instructions: string | undefined,
  notes: readonly { path: string; content: string }[]
): number {
  const text = instructionsSection(instructions) + attachedNotesSection(notes);
  return text ? estimateTokens(text) : 0;
}

export function formatTokens(n: number): string {
  if (n <= 0) return tr("0 tokens");
  if (n < 1000) return tr("~{n} tokens", { n });
  if (n < 10_000)
    return tr("~{n}k tokens", {
      n: (n / 1000).toFixed(1).replace(/\.0$/, ""),
    });
  return tr("~{n}k tokens", { n: Math.round(n / 1000) });
}
