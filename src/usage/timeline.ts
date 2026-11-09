import type { UsageBucket } from "./aggregate";
import { mark, tr } from "../i18n/tr";

const DIA_MS = 86_400_000;

export const MESES = [
  mark("Jan"), mark("Feb"), mark("Mar"), mark("Apr"), mark("May"), mark("Jun"),
  mark("Jul"), mark("Aug"), mark("Sep"), mark("Oct"), mark("Nov"), mark("Dec"),
];

function nomeDoMes(m: number): string | null {
  const nome = MESES[m - 1];
  return nome ? tr(nome) : null;
}

export function diaCurto(iso: string, comAno = false): string {
  const [a, m, d] = iso.split("-").map(Number);
  const mes = nomeDoMes(m);
  if (!a || !mes || !d) return iso;
  return comAno
    ? tr("{month} {day}, {year}", { month: mes, day: d, year: a })
    : tr("{month} {day}", { month: mes, day: d });
}

export type Passo = "day" | "week" | "month";

export interface Coluna {

  inicio: string;

  rotulo: string;

  titulo: string;
  entrada: number;
  saida: number;
  total: number;
  chats: number;
}

function ms(dia: string): number {
  return Date.parse(`${dia}T00:00:00Z`);
}

function chave(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

export function diasEntre(de: string, ate: string): number {
  return Math.round((ms(ate) - ms(de)) / DIA_MS) + 1;
}

export function passoDe(dias: number): Passo {
  if (dias <= 31) return "day";
  if (dias <= 182) return "week";
  return "month";
}

function inicioDoPasso(t: number, passo: Passo): number {
  const d = new Date(t);
  if (passo === "week") {
    const dow = (d.getUTCDay() + 6) % 7;
    return t - dow * DIA_MS;
  }
  if (passo === "month") {
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  }
  return t;
}

function rotuloDe(inicio: string, passo: Passo): string {
  if (passo === "month") {
    const m = Number(inicio.split("-")[1]);
    return nomeDoMes(m) ?? inicio;
  }
  return diaCurto(inicio);
}

function tituloDe(inicio: string, fim: string, passo: Passo): string {
  const ano = inicio.slice(0, 4);
  if (passo === "day") return diaCurto(inicio, true);
  if (passo === "month") {
    const m = Number(inicio.split("-")[1]);
    return `${nomeDoMes(m) ?? inicio} ${ano}`;
  }
  return tr("{start} – {end}, {year}", {
    start: diaCurto(inicio),
    end: diaCurto(fim),
    year: ano,
  });
}

export function janelaDoGrafico(
  dias: number,
  byDay: Record<string, UsageBucket>,
  agora: number = Date.now()
): { de: string; ate: string } | null {
  const chaves = Object.keys(byDay).filter((k) => Number.isFinite(ms(k))).sort();
  if (chaves.length === 0) return null;
  const primeira = chaves[0];
  const ultima = chaves[chaves.length - 1];
  if (dias <= 0) return { de: primeira, ate: ultima };
  const hoje = chave(agora);
  const inicio = chave(ms(hoje) - (dias - 1) * DIA_MS);
  return {
    de: inicio < primeira ? inicio : primeira,
    ate: hoje > ultima ? hoje : ultima,
  };
}

export function serieDoTempo(
  byDay: Record<string, UsageBucket>,
  de: string,
  ate: string,
  passo: Passo
): Coluna[] {
  const inicio = ms(de);
  const fim = ms(ate);
  if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim < inicio) return [];

  const colunas: Coluna[] = [];
  const porInicio = new Map<string, Coluna>();

  for (let t = inicioDoPasso(inicio, passo); t <= fim; ) {
    const k = chave(t);
    const proximo =
      passo === "month"
        ? Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth() + 1, 1)
        : t + (passo === "week" ? 7 : 1) * DIA_MS;

    const ultimoDia = chave(Math.min(proximo - DIA_MS, fim));
    const col: Coluna = {
      inicio: k,
      rotulo: rotuloDe(k, passo),
      titulo: tituloDe(k, ultimoDia, passo),
      entrada: 0,
      saida: 0,
      total: 0,
      chats: 0,
    };
    colunas.push(col);
    porInicio.set(k, col);
    t = proximo;
  }

  for (const [dia, b] of Object.entries(byDay)) {
    const t = ms(dia);
    if (!Number.isFinite(t) || t < inicio || t > fim) continue;
    const col = porInicio.get(chave(inicioDoPasso(t, passo)));
    if (!col) continue;
    col.entrada += b.tokensIn;
    col.saida += b.tokensOut;
    col.total += b.tokensIn + b.tokensOut;
    col.chats += b.chats;
  }

  return colunas;
}

export function picoDa(colunas: readonly Coluna[]): number {
  return colunas.reduce((p, c) => (c.total > p ? c.total : p), 0);
}
