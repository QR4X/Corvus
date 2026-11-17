export function vaultDefault(mode: string): boolean {
  return mode === "vault-qa" || mode === "agent";
}

export function vaultEnabled(mode: string, choice: boolean | null): boolean {
  return choice ?? vaultDefault(mode);
}
