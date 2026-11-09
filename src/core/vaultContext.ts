export function vaultDefault(mode: string): boolean {
  return mode === "vault-qa" || mode === "agent";
}

export function vaultAtivo(mode: string, escolha: boolean | null): boolean {
  return escolha ?? vaultDefault(mode);
}
