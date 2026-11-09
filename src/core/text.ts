export function texto(v: unknown, padrao = ""): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : padrao;
  if (typeof v === "boolean" || typeof v === "bigint") return String(v);
  return padrao;
}
