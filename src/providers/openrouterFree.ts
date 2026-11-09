export interface EntradaOpenRouter {
  id: string;
  pricing?: Record<string, unknown>;
  architecture?: { output_modalities?: unknown };
  description?: unknown;
}

export function ehPrecoZero(pricing: unknown): boolean {
  const p = pricing as Record<string, unknown> | undefined;
  if (!p) return false;
  const zero = (v: unknown) => {
    if (typeof v !== "string" && typeof v !== "number") return false;
    const n = Number(v);
    return Number.isFinite(n) && n === 0;
  };
  return zero(p.prompt) && zero(p.completion);
}

export function ehGratisNoOpenRouter(m: EntradaOpenRouter): boolean {
  if (m.id.toLowerCase().endsWith(":free")) return true;
  if (!ehPrecoZero(m.pricing)) return false;
  const precos = Object.values(m.pricing ?? {}).filter(
    (v) => typeof v === "string" || typeof v === "number"
  );
  if (!precos.every((v) => Number(v) === 0)) return false;
  const saida = m.architecture?.output_modalities;
  const soTexto = !Array.isArray(saida) || saida.every((s) => s === "text");
  const citaPreco = typeof m.description === "string" && /\$\s?\d/.test(m.description);
  return soTexto && !citaPreco;
}
