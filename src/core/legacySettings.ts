export const DEAD_FIELDS = [
  "roleModels",
  "modelProvider",
  "uiFontFamily",
  "uiFontSize",
  "language",
] as const;

export const RENAMED_FIELDS = {
  ollamaPadraoRevisto: "ollamaDefaultReviewed",
  ollamaVistos: "ollamaSeenModels",
  usoDoDia: "dailyUsage",
  limitesDiarios: "dailyLimits",
  limiteGastoDiario: "dailySpendLimit",
  travarNoLimite: "blockAtLimit",
} as const;

export function migrateLegacyFields(s: object): void {
  const r = s as Record<string, unknown>;
  for (const [from, to] of Object.entries(RENAMED_FIELDS)) {
    if (from in r) {
      if (!(to in r)) r[to] = r[from];
      delete r[from];
    }
  }
  for (const k of DEAD_FIELDS) delete r[k];
}
