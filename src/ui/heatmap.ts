import type { ChatSummary } from "../core/chatPersistence";
import { uiLocale } from "../i18n/tr";

export interface Celula {

  dia: string | null;
  tokens: number;

  nivel: number;

  futuro?: boolean;
}

export interface Heatmap {

  celulas: Celula[];

  linhas: number;

  pico: number;

  total: number;

  rotulo: string;
}

export function diaLocal(t: number): string {
  const d = new Date(t);
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

export function nivelDoDia(tokens: number, pico: number): number {
  if (tokens <= 0 || pico <= 0) return 0;
  const f = tokens / pico;
  if (f > 0.75) return 4;
  if (f > 0.5) return 3;
  if (f > 0.25) return 2;
  return 1;
}

function porDia(chats: readonly ChatSummary[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const c of chats) {
    const t = Date.parse(c.date);
    if (!Number.isFinite(t)) continue;
    const dia = diaLocal(t);
    const tin = Number.isFinite(c.tokensIn) ? c.tokensIn : 0;
    const tout = Number.isFinite(c.tokensOut) ? c.tokensOut : 0;
    mapa.set(dia, (mapa.get(dia) ?? 0) + tin + tout);
  }
  return mapa;
}

export function heatmapDoMes(
  chats: readonly ChatSummary[],
  agora: number = Date.now()
): Heatmap {
  const somas = porDia(chats);
  const hoje = new Date(agora);
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();

  const primeiro = new Date(ano, mes, 1);
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();

  const vazioInicial = (primeiro.getDay() + 6) % 7;
  const linhas = Math.ceil((vazioInicial + diasNoMes) / 7);

  const celulas: Celula[] = [];
  let pico = 0;
  let total = 0;
  for (let i = 0; i < linhas * 7; i++) {
    const diaDoMes = i - vazioInicial + 1;
    if (diaDoMes < 1 || diaDoMes > diasNoMes) {
      celulas.push({ dia: null, tokens: 0, nivel: 0 });
      continue;
    }
    const d = new Date(ano, mes, diaDoMes);

    if (d.getTime() > agora) {
      celulas.push({ dia: null, tokens: 0, nivel: 0, futuro: true });
      continue;
    }
    const chave = diaLocal(d.getTime());
    const tokens = somas.get(chave) ?? 0;
    if (tokens > pico) pico = tokens;
    total += tokens;
    celulas.push({ dia: chave, tokens, nivel: 0 });
  }

  for (const c of celulas) c.nivel = nivelDoDia(c.tokens, pico);

  return {
    celulas,
    linhas,
    pico,
    total,
    rotulo: primeiro.toLocaleDateString(uiLocale(), { month: "long" }),
  };
}

export function inicioDoMes(agora: number = Date.now()): string {
  const d = new Date(agora);
  return diaLocal(new Date(d.getFullYear(), d.getMonth(), 1).getTime());
}
