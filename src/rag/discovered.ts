export function somarDescobertos(
  antes: readonly string[] | undefined,
  novos: readonly string[]
): string[] {
  return [...new Set([...(antes ?? []), ...novos])];
}
