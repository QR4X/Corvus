export function mergeDiscovered(
  previous: readonly string[] | undefined,
  added: readonly string[]
): string[] {
  return [...new Set([...(previous ?? []), ...added])];
}
