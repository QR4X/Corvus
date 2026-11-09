export interface PeDoWizard {

  ultimo: boolean;

  voltar: "passo" | "sair";

  primario: "next" | "submit";

  pronto: boolean;

  status: "problema" | "atalho" | null;
}

export function peDoWizard(p: {

  atual: number;

  total: number;

  problema?: string | null;
}): PeDoWizard {

  const ultimo = p.atual >= p.total - 1;
  const falta = !!p.problema;
  return {
    ultimo,
    voltar: p.atual > 0 ? "passo" : "sair",
    primario: ultimo ? "submit" : "next",
    pronto: !falta,
    status: ultimo ? (falta ? "problema" : null) : falta ? null : "atalho",
  };
}
