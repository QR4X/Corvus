const WINDOWS: Record<string, number> = {

  "gpt-4o": 128_000,
  "gpt-4o-mini": 128_000,
  "gpt-5": 256_000,
  "o1": 200_000,
  "o1-mini": 128_000,
  "o3": 200_000,
  "o3-mini": 200_000,
  "o4": 256_000,

  "claude-fable-5": 200_000,
  "claude-opus-4-8": 200_000,
  "claude-sonnet-4-6": 200_000,
  "claude-haiku-4-5-20251001": 200_000,
};

export function getContextWindow(model: string): number {

  if (WINDOWS[model] != null) return WINDOWS[model];

  const keys = Object.keys(WINDOWS).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (model.startsWith(key)) return WINDOWS[key];
  }
  return 128_000;
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1) + "k";
  return String(n);
}
