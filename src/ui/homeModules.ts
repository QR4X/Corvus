import type { ChatSummary } from "../core/chatPersistence";
import { diaLocal, type Celula } from "./heatmap";

export function sequenciaDeDias(
  chats: readonly ChatSummary[],
  agora: number = Date.now()
): number {
  const usados = new Set<string>();
  for (const c of chats) {
    const t = Date.parse(c.date);
    if (!Number.isFinite(t)) continue;
    const tin = Number.isFinite(c.tokensIn) ? c.tokensIn : 0;
    const tout = Number.isFinite(c.tokensOut) ? c.tokensOut : 0;
    if (tin + tout <= 0 && !Number.isFinite(c.messageCount)) continue;
    usados.add(diaLocal(t));
  }
  if (usados.size === 0) return 0;

  const hoje = new Date(agora);
  const cursor = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

  if (!usados.has(diaLocal(cursor.getTime()))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  let n = 0;
  while (usados.has(diaLocal(cursor.getTime()))) {
    n += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return n;
}

export interface DiasAtivos {
  ativos: number;
  total: number;
}

export function diasAtivos(celulas: readonly Celula[]): DiasAtivos {
  const dias = celulas.filter((c) => c.dia !== null);
  return {
    ativos: dias.filter((c) => c.tokens > 0).length,
    total: dias.length,
  };
}

export interface Trabalho {

  acoes: number;
  mensagens: number;
}

export function trabalhoDoPeriodo(
  chats: readonly ChatSummary[],
  desde: string
): Trabalho {
  let acoes = 0;
  let mensagens = 0;
  for (const c of chats) {
    if (desde && (c.date ?? "").slice(0, 10) < desde) continue;
    acoes += Number.isFinite(c.toolCount) ? c.toolCount : 0;
    mensagens += Number.isFinite(c.messageCount) ? c.messageCount : 0;
  }
  return { acoes, mensagens };
}

export interface ModeloUsado {
  model: string;
  provider: string;
  tokens: number;
  chats: number;

  pct: number;
}

export function modelosMaisUsados(
  chats: readonly ChatSummary[],
  desde: string,
  limite: number = 3
): ModeloUsado[] {
  const porModelo = new Map<string, ModeloUsado>();
  let total = 0;
  for (const c of chats) {
    if (desde && (c.date ?? "").slice(0, 10) < desde) continue;
    if (!c.model) continue;
    const tin = Number.isFinite(c.tokensIn) ? c.tokensIn : 0;
    const tout = Number.isFinite(c.tokensOut) ? c.tokensOut : 0;
    const atual = porModelo.get(c.model) ?? {
      model: c.model,
      provider: c.provider,
      tokens: 0,
      chats: 0,
      pct: 0,
    };
    atual.tokens += tin + tout;
    atual.chats += 1;
    if (!atual.provider) atual.provider = c.provider;
    porModelo.set(c.model, atual);
    total += tin + tout;
  }

  const lista = [...porModelo.values()].sort((a, b) => {
    if (b.tokens !== a.tokens) return b.tokens - a.tokens;

    if (b.chats !== a.chats) return b.chats - a.chats;
    return a.model.localeCompare(b.model);
  });
  for (const m of lista) {
    m.pct = total > 0 ? Math.round((m.tokens / total) * 100) : 0;
  }
  return lista.slice(0, limite);
}
