import { getPricing } from "./pricing";
import { getAllEmbeddingModels } from "../rag/types";
import { horaDe, inicioDoDia, type LivroDoDia } from "./dailyLedger";

export interface Preco {
  entrada: number;
  saida: number;
}

export function precoConhecido(provider: string, model: string): Preco | null {
  if (provider === "ollama") return { entrada: 0, saida: 0 };
  const p = getPricing(provider, model);
  if (p.inputPerMillion != null && p.outputPerMillion != null) {
    return { entrada: p.inputPerMillion, saida: p.outputPerMillion };
  }
  const emb = getAllEmbeddingModels().find((m) => m.model === model && !m.discovered);
  if (emb) return { entrada: emb.pricePerMillion, saida: 0 };
  return null;
}

export function ehPago(provider: string, model: string): boolean {
  const p = precoConhecido(provider, model);
  return !!p && (p.entrada > 0 || p.saida > 0);
}

export interface Gasto {

  total: number;

  semPreco: number;
}

export function gastoDesde(
  livro: LivroDoDia,
  inicio: Date,
  preco: (provider: string, model: string) => Preco | null = precoConhecido
): Gasto {
  const desde = horaDe(inicio);
  let total = 0;
  let semPreco = 0;
  for (const [hora, modelos] of Object.entries(livro)) {
    if (hora < desde) continue;
    for (const [chave, l] of Object.entries(modelos)) {
      const corte = chave.indexOf("\u0001");
      const p = preco(chave.slice(0, corte), chave.slice(corte + 1));
      if (!p) {
        semPreco += l.r;
        continue;
      }
      total += (l.i / 1_000_000) * p.entrada + (l.o / 1_000_000) * p.saida;
    }
  }
  return { total, semPreco };
}

function fusoDaMaquina(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function gastoDeHoje(livro: LivroDoDia, agora: Date, fuso = fusoDaMaquina()): Gasto {
  return gastoDesde(livro, inicioDoDia(agora, fuso));
}

export function marcosCruzados(antes: number, depois: number, limite: number): Array<80 | 100> {
  if (!(limite > 0)) return [];
  const marcos: Array<80 | 100> = [];
  for (const m of [80, 100] as const) {
    const linha = (limite * m) / 100;
    if (antes < linha && depois >= linha) marcos.push(m);
  }
  return marcos;
}

export function usd(n: number): string {
  if (n === 0) return "$0.00";
  if (n > 0 && n < 0.01) return "<$0.01";
  return `$${n.toFixed(2)}`;
}
