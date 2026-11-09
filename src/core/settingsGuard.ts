export function settingsReadLooksBroken(p: {

  chavesLidas: number;

  arquivoExiste: boolean;

  tamanhoBruto: number;
}): boolean {
  if (p.chavesLidas > 0) return false;
  if (!p.arquivoExiste) return false;
  return p.tamanhoBruto > 2;
}
