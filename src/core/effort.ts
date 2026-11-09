import { mark, tr } from "../i18n/tr";

export type EffortLevel = "low" | "med" | "high" | "xhigh" | "max";

export const EFFORT_LEVELS: EffortLevel[] = ["low", "med", "high", "xhigh", "max"];

export const EFFORT_LABELS: Record<EffortLevel, string> = {
  low: mark("Low"),
  med: mark("Medium"),
  high: mark("High"),
  xhigh: mark("Extra high"),
  max: mark("Max"),
};

export const EFFORT_ICONS: Record<EffortLevel, string> = {
  low: "signal-low",
  med: "signal-medium",
  high: "signal-high",
  xhigh: "signal",
  max: "flame",
};

export const EFFORT_TAGLINES: Record<EffortLevel, string> = {
  low: mark("Fast and economical"),
  med: mark("Balanced"),
  high: mark("Detailed"),
  xhigh: mark("Deep"),
  max: mark("Relentless"),
};

export interface EffortConfig {
  maxTokens: number;
  vaultTopK: number;
  vaultExcerptChars: number;
  temperature: number;
  parallelToolCalls: boolean;
  toolRetryOnError: number;
  contextReservePercent: number;
  loopDetectionWindow: number;
}

export const DEFAULT_EFFORT_CONFIGS: Record<EffortLevel, EffortConfig> = {
  low: {
    maxTokens: 512,
    vaultTopK: 3,
    vaultExcerptChars: 300,
    temperature: 0.7,
    parallelToolCalls: false,
    toolRetryOnError: 0,
    contextReservePercent: 80,
    loopDetectionWindow: 3,
  },
  med: {
    maxTokens: 2048,
    vaultTopK: 5,
    vaultExcerptChars: 500,
    temperature: 0.7,
    parallelToolCalls: false,
    toolRetryOnError: 1,
    contextReservePercent: 80,
    loopDetectionWindow: 3,
  },
  high: {
    maxTokens: 6000,
    vaultTopK: 7,
    vaultExcerptChars: 800,
    temperature: 0.5,
    parallelToolCalls: true,
    toolRetryOnError: 2,
    contextReservePercent: 80,
    loopDetectionWindow: 4,
  },
  xhigh: {
    maxTokens: 16000,
    vaultTopK: 9,
    vaultExcerptChars: 1200,
    temperature: 0.3,
    parallelToolCalls: true,
    toolRetryOnError: 3,
    contextReservePercent: 80,
    loopDetectionWindow: 5,
  },
  max: {
    maxTokens: 0,
    vaultTopK: 12,
    vaultExcerptChars: 2000,
    temperature: 0.2,
    parallelToolCalls: true,
    toolRetryOnError: 5,
    contextReservePercent: 80,
    loopDetectionWindow: 6,
  },
};

export function resolveEffortConfig(
  level: string,
  userConfigs?: Partial<Record<EffortLevel, Partial<EffortConfig>>>
): EffortConfig {
  const lvl = (isEffortLevel(level) ? level : "med");
  const base = DEFAULT_EFFORT_CONFIGS[lvl];
  const override = userConfigs?.[lvl];
  if (!override) return base;
  return {
    maxTokens: override.maxTokens ?? base.maxTokens,
    vaultTopK: override.vaultTopK ?? base.vaultTopK,
    vaultExcerptChars: override.vaultExcerptChars ?? base.vaultExcerptChars,
    temperature: override.temperature ?? base.temperature,
    parallelToolCalls: override.parallelToolCalls ?? base.parallelToolCalls,
    toolRetryOnError: override.toolRetryOnError ?? base.toolRetryOnError,
    contextReservePercent: override.contextReservePercent ?? base.contextReservePercent,
    loopDetectionWindow: override.loopDetectionWindow ?? base.loopDetectionWindow,
  };
}

export function effortToMaxTokens(level: string): number {
  const v = DEFAULT_EFFORT_CONFIGS[level as EffortLevel]?.maxTokens ?? 2048;
  return v === 0 ? 16000 : v;
}

export function effortToMaxTokensSmart(
  level: string,
  contextWindow: number,
  userConfigs?: Partial<Record<EffortLevel, Partial<EffortConfig>>>
): number {
  const cfg = resolveEffortConfig(level, userConfigs);
  if (cfg.maxTokens === 0) {

    const pct = Math.max(10, Math.min(95, cfg.contextReservePercent)) / 100;
    return Math.max(2048, Math.floor(contextWindow * pct) - 1000);
  }
  return cfg.maxTokens;
}

export function isEffortLevel(value: string): value is EffortLevel {
  return EFFORT_LEVELS.includes(value as EffortLevel);
}

export interface VaultLookupConfig {
  topK: number;
  excerptChars: number;
}

export function effortToVaultLookup(
  level: string,
  userConfigs?: Partial<Record<EffortLevel, Partial<EffortConfig>>>
): VaultLookupConfig {
  const cfg = resolveEffortConfig(level, userConfigs);
  return { topK: cfg.vaultTopK, excerptChars: cfg.vaultExcerptChars };
}

export function tokensCurtos(n: number): string {
  if (n < 1000) return String(n);
  return `${Math.round(n / 100) / 10}k`;
}

export function effortNumbers(cfg: EffortConfig): string {
  const tok =
    cfg.maxTokens === 0
      ? tr("up to {pct}% of context", { pct: cfg.contextReservePercent })
      : tr("≤{n} tok", { n: tokensCurtos(cfg.maxTokens) });
  return tok;
}

export function describeEffort(
  level: string,
  userConfigs?: Partial<Record<EffortLevel, Partial<EffortConfig>>>
): string {
  const lvl = isEffortLevel(level) ? level : "med";
  return `${tr(EFFORT_TAGLINES[lvl])} (${effortNumbers(resolveEffortConfig(lvl, userConfigs))})`;
}

export const EFFORT_DESCRIPTIONS: Record<EffortLevel, string> = {
  get low() {
    return describeEffort("low");
  },
  get med() {
    return describeEffort("med");
  },
  get high() {
    return describeEffort("high");
  },
  get xhigh() {
    return describeEffort("xhigh");
  },
  get max() {
    return describeEffort("max");
  },
};
