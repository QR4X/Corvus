import type { Project } from "../projects";
import { relativeShort } from "./modules";
import { blocoDeInstrucoes, blocoDeNotasAnexadas } from "../agent/conversation";
import { estimateTokens } from "../core/tokens";
import { tr } from "../i18n/tr";

export function resumoDoProjeto(
  p: Project,
  chats: readonly { id: string; title: string; date: string }[],
  agora: number = Date.now()
): { quando: string; sobre: string | null; conversas: number } {
  const ids = new Set(p.chatIds);
  const deles = chats
    .filter((c) => ids.has(c.id))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const ultima = deles[0];
  const tempo = (iso: string) => {
    const r = relativeShort(iso, agora);
    if (!r) return "";

    if (r === tr("now")) return tr("just now");

    return /^\d+[mhd]$/.test(r) ? tr("{time} ago", { time: r }) : r;
  };
  const quando = tempo(ultima ? ultima.date : p.createdAt);
  const primeira = (p.instructions ?? "")
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  const sobre =
    primeira ??
    (ultima?.title.trim()
      ? tr("Latest: {title}", { title: ultima.title.trim() })
      : null);
  return { quando, sobre, conversas: deles.length };
}

export function tokensDeEntrada(
  instrucoes: string | undefined,
  notas: readonly { path: string; content: string }[]
): number {
  const texto = blocoDeInstrucoes(instrucoes) + blocoDeNotasAnexadas(notas);
  return texto ? estimateTokens(texto) : 0;
}

export function formatarTokens(n: number): string {
  if (n <= 0) return tr("0 tokens");
  if (n < 1000) return tr("~{n} tokens", { n });
  if (n < 10_000)
    return tr("~{n}k tokens", {
      n: (n / 1000).toFixed(1).replace(/\.0$/, ""),
    });
  return tr("~{n}k tokens", { n: Math.round(n / 1000) });
}
