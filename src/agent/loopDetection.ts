function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key: string, val: unknown) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      return Object.keys(val)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = (val as Record<string, unknown>)[k];
          return acc;
        }, {});
    }
    return val;
  });
}

export function makeCallSignature(
  name: string,
  args: Record<string, unknown>
): string {
  return `${name}::${stableStringify(args)}`;
}

export function isLooping(signatures: string[], window: number): boolean {
  if (window <= 0) return false;
  const lastN = signatures.slice(-window);
  return lastN.length === window && lastN.every((s) => s === lastN[0]);
}

export function trimSignatures(signatures: string[], keep: number): void {
  if (signatures.length > keep) {
    signatures.splice(0, signatures.length - keep);
  }
}
