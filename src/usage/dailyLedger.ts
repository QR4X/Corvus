export interface Lancamento {
  r: number;
  i: number;
  o: number;
}

export type LivroDoDia = Record<string, Record<string, Lancamento>>;

const SEP = "\u0001";

export function horaDe(quando: Date): string {
  return quando.toISOString().slice(0, 13);
}

export function lancar(
  livro: LivroDoDia,
  quando: Date,
  provider: string,
  model: string,
  delta: Partial<Lancamento>
): void {
  const hora = (livro[horaDe(quando)] ??= {});
  const chave = `${provider}${SEP}${model}`;
  const l = (hora[chave] ??= { r: 0, i: 0, o: 0 });
  l.r += delta.r ?? 0;
  l.i += delta.i ?? 0;
  l.o += delta.o ?? 0;
}

export function podar(livro: LivroDoDia, agora: Date, horas = 50): void {
  const limite = horaDe(new Date(agora.getTime() - horas * 3_600_000));
  for (const hora of Object.keys(livro)) {
    if (hora < limite) delete livro[hora];
  }
}

function relogioEm(quando: Date, fuso: string): { y: number; m: number; d: number; ms: number } {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(quando);
  const n = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value ?? 0);
  const y = n("year");
  const m = n("month");
  const d = n("day");
  return { y, m, d, ms: Date.UTC(y, m - 1, d, n("hour") % 24, n("minute"), n("second")) };
}

function deslocamento(quando: Date, fuso: string): number {
  const semMs = Math.floor(quando.getTime() / 1000) * 1000;
  return Math.round((relogioEm(quando, fuso).ms - semMs) / 60_000) * 60_000;
}

export function inicioDoDia(agora: Date, fuso: string): Date {
  const { y, m, d } = relogioEm(agora, fuso);
  const meiaNoite = Date.UTC(y, m - 1, d);
  const palpite = meiaNoite - deslocamento(agora, fuso);
  return new Date(meiaNoite - deslocamento(new Date(palpite), fuso));
}

export function faltaParaVirar(agora: Date, fuso: string): number {
  const inicio = inicioDoDia(agora, fuso).getTime();
  const proximo = inicioDoDia(new Date(inicio + 36 * 3_600_000), fuso).getTime();
  return Math.max(0, proximo - agora.getTime());
}

export function somarDesde(
  livro: LivroDoDia,
  inicio: Date,
  filtro: (provider: string, model: string) => boolean
): Lancamento {
  const desde = horaDe(inicio);
  const total: Lancamento = { r: 0, i: 0, o: 0 };
  for (const [hora, modelos] of Object.entries(livro)) {
    if (hora < desde) continue;
    for (const [chave, l] of Object.entries(modelos)) {
      const corte = chave.indexOf(SEP);
      const provider = chave.slice(0, corte);
      const model = chave.slice(corte + 1);
      if (!filtro(provider, model)) continue;
      total.r += l.r;
      total.i += l.i;
      total.o += l.o;
    }
  }
  return total;
}

export function modelosDesde(
  livro: LivroDoDia,
  inicio: Date,
  provider: string
): Array<{ model: string } & Lancamento> {
  const desde = horaDe(inicio);
  const porModelo = new Map<string, Lancamento>();
  for (const [hora, modelos] of Object.entries(livro)) {
    if (hora < desde) continue;
    for (const [chave, l] of Object.entries(modelos)) {
      const corte = chave.indexOf(SEP);
      if (chave.slice(0, corte) !== provider) continue;
      const model = chave.slice(corte + 1);
      const acc = porModelo.get(model) ?? { r: 0, i: 0, o: 0 };
      acc.r += l.r;
      acc.i += l.i;
      acc.o += l.o;
      porModelo.set(model, acc);
    }
  }
  return Array.from(porModelo.entries())
    .map(([model, l]) => ({ model, ...l }))
    .sort((a, b) => b.r - a.r || a.model.localeCompare(b.model));
}
