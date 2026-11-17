export interface OpenRouterEntry {
  id: string;
  pricing?: Record<string, unknown>;
  architecture?: { output_modalities?: unknown };
  description?: unknown;
}

export function isZeroPrice(pricing: unknown): boolean {
  const p = pricing as Record<string, unknown> | undefined;
  if (!p) return false;
  const zero = (v: unknown) => {
    if (typeof v !== "string" && typeof v !== "number") return false;
    const n = Number(v);
    return Number.isFinite(n) && n === 0;
  };
  return zero(p.prompt) && zero(p.completion);
}

export function isFreeOnOpenRouter(m: OpenRouterEntry): boolean {
  if (m.id.toLowerCase().endsWith(":free")) return true;
  if (!isZeroPrice(m.pricing)) return false;
  const prices = Object.values(m.pricing ?? {}).filter(
    (v) => typeof v === "string" || typeof v === "number"
  );
  if (!prices.every((v) => Number(v) === 0)) return false;
  const outputs = m.architecture?.output_modalities;
  const textOnly = !Array.isArray(outputs) || outputs.every((s) => s === "text");
  const mentionsPrice = typeof m.description === "string" && /\$\s?\d/.test(m.description);
  return textOnly && !mentionsPrice;
}
