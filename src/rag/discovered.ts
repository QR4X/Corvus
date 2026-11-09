export const EMBEDDING_PROVIDERS: readonly string[] = [
  "openai",
  "openrouter",
  "gemini",
  "nim",
  "ollama",
];

export function somarDescobertos(
  antes: readonly string[] | undefined,
  novos: readonly string[]
): string[] {
  return [...new Set([...(antes ?? []), ...novos])];
}
