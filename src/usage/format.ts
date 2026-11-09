export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";

  if (abs >= 1_000) return (n / 1_000).toFixed(abs >= 10_000 ? 0 : 1) + "k";
  return String(n);
}
