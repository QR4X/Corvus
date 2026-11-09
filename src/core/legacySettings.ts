export const CAMPOS_MORTOS = [
  "roleModels",
  "modelProvider",
  "uiFontFamily",
  "uiFontSize",
] as const;

export function limparCamposMortos(s: object): void {
  const r = s as Record<string, unknown>;
  for (const k of CAMPOS_MORTOS) delete r[k];
}
