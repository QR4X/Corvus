interface WizardFoot {

  isLast: boolean;

  back: "step" | "exit";

  primary: "next" | "submit";

  ready: boolean;

  status: "problem" | "shortcut" | null;
}

export function wizardFoot(p: {

  current: number;

  total: number;

  problem?: string | null;
}): WizardFoot {

  const isLast = p.current >= p.total - 1;
  const missing = !!p.problem;
  return {
    isLast,
    back: p.current > 0 ? "step" : "exit",
    primary: isLast ? "submit" : "next",
    ready: !missing,
    status: isLast ? (missing ? "problem" : null) : missing ? null : "shortcut",
  };
}
