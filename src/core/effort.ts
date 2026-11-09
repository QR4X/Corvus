// src/components/_shared/effort.ts
// Effort = intensidade do processamento. Centraliza TODOS os parâmetros que
// variam por nível (max_tokens, temperatura, vault lookup, etc).
//
// v0.1.73: expandido pra EffortConfig completo + overrides por usuário via
// Settings → Effort. Cada nível ganhou aba dedicada nas Settings, permitindo
// ajuste fino de cada knob.
//
// Hierarquia: DEFAULT_EFFORT_CONFIGS (built-in) ← user overrides (settings).
// resolveEffortConfig() faz o merge — usado por todo lugar que precisa.

import { marca, tr } from "../i18n/tr";

export type EffortLevel = "low" | "med" | "high" | "xhigh" | "max";

export const EFFORT_LEVELS: EffortLevel[] = ["low", "med", "high", "xhigh", "max"];

/** Nome por extenso. Abreviar ("Med", "xHigh") economizava três letras num
 *  lugar onde sobra espaço, e obrigava a decifrar. Só MARCADO (marca): quem
 *  mostra chama tr(), na hora de desenhar. */
export const EFFORT_LABELS: Record<EffortLevel, string> = {
  low: marca("Low"),
  med: marca("Medium"),
  high: marca("High"),
  xhigh: marca("Extra high"),
  max: marca("Max"),
};

/** O desenho de cada nível: as barras de sinal enchendo, e a chama no topo —
 *  uma escala que se lê de relance, sem precisar do nome. */
export const EFFORT_ICONS: Record<EffortLevel, string> = {
  low: "signal-low",
  med: "signal-medium",
  high: "signal-high",
  xhigh: "signal",
  max: "flame",
};

/** O jeito de cada nível em poucas palavras — o resto da descrição é número
 *  (ver describeEffort). */
export const EFFORT_TAGLINES: Record<EffortLevel, string> = {
  low: marca("Fast and economical"),
  med: marca("Balanced"),
  high: marca("Detailed"),
  xhigh: marca("Deep"),
  max: marca("Relentless"),
};

/**
 * Config completo por effort — TODOS os parâmetros que variam por nível.
 * Cada campo é independente; o user pode override qualquer um via Settings.
 *
 * temperature:
 *   -1 = não enviar (provider usa default próprio).
 *   0..2 = enviar valor literal. Effort mais alto → temp mais baixa pra
 *   incentivar precisão em raciocínio longo.
 *
 * loopDetectionWindow:
 *   Quantas tool calls passadas comparar pra detectar loop (mesmo tool+args
 *   exato N vezes seguidas = abort com mensagem clara). 0 = sem detecção.
 *
 * toolRetryOnError:
 *   Quantas vezes retentar uma tool que falhou com mensagem de erro pro LLM
 *   antes de marcar como definitiva. Mais útil em effort alto pra dar
 *   chance do LLM corrigir um path/arg.
 *
 * parallelToolCalls:
 *   true = executa toolCalls do mesmo turn em paralelo (Promise.all).
 *   false = sequencial. Default true em effort alto pra acelerar.
 *
 * contextReservePercent:
 *   Quantos % do context window reservar pra prompt+system. Só usado quando
 *   maxTokens=0 (uncapped). Sub-ditado pelo modelo: max effort em modelo
 *   de 200k → resposta de até 80% (160k tok) por default.
 */
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

/**
 * Defaults built-in — escalonados pra cada nível usar bem a janela do modelo.
 * Max pede 80% do contexto em tokens. O agente não tem teto de turnos.
 */
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

/**
 * Faz merge dos defaults com overrides do usuário (vindo das Settings).
 * Campos ausentes/undefined no override caem nos defaults built-in.
 *
 * userConfigs vem de plugin.settings.effortConfigs — Record<EffortLevel,
 * Partial<EffortConfig>>. Se Level não existe ou está vazio, usa default puro.
 */
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

/** Versao legacy (sem context window). Max retorna 16k como cap razoavel.
 *  Mantido pra compat — chamadores novos devem usar resolveEffortConfig. */
export function effortToMaxTokens(level: string): number {
  const v = DEFAULT_EFFORT_CONFIGS[level as EffortLevel]?.maxTokens ?? 2048;
  return v === 0 ? 16000 : v;
}

/**
 * Versao SMART: max retorna 80% do context window do modelo.
 * Outros niveis retornam o cap fixo do config.
 * Usado pelo CorvusApp pra mandar max_tokens pro provider.
 *
 * Quando userConfigs vem, usa override do usuário (Settings → Effort).
 */
export function effortToMaxTokensSmart(
  level: string,
  contextWindow: number,
  userConfigs?: Partial<Record<EffortLevel, Partial<EffortConfig>>>
): number {
  const cfg = resolveEffortConfig(level, userConfigs);
  if (cfg.maxTokens === 0) {
    // Uncapped: usa % do context. Subtrai 1k pra reserva pra prompt+system.
    // Piso de 2048 é contrato (ver tests): modelos reais têm window >= 4k, então
    // o piso nunca estoura a janela na prática — um teto especulativo zerava o
    // maxTokens em janelas sintéticas minúsculas. v0.1.228
    const pct = Math.max(10, Math.min(95, cfg.contextReservePercent)) / 100;
    return Math.max(2048, Math.floor(contextWindow * pct) - 1000);
  }
  return cfg.maxTokens;
}

export function isEffortLevel(value: string): value is EffortLevel {
  return EFFORT_LEVELS.includes(value as EffortLevel);
}

// Escala do Vault Q&A por effort:
//   topK = quantas notas o keyword-search retorna
//   excerptChars = tamanho do trecho de cada nota injetado no system prompt
// Total ~ topK × excerptChars chars (~ /4 tokens).
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

/** 512 → "512", 2048 → "2k", 6000 → "6k", 1500 → "1.5k". */
export function tokensCurtos(n: number): string {
  if (n < 1000) return String(n);
  return `${Math.round(n / 100) / 10}k`;
}

/** "≤2k tok" — o que separa um nível do outro, com os números que
 *  valem de verdade. */
export function effortNumbers(cfg: EffortConfig): string {
  const tok =
    cfg.maxTokens === 0
      ? tr("up to {pct}% of context", { pct: cfg.contextReservePercent })
      : tr("≤{n} tok", { n: tokensCurtos(cfg.maxTokens) });
  return tok;
}

/**
 * A descrição de um nível com os números de agora: os de fábrica somados ao
 * que a pessoa editou nas settings. Era um texto fixo — e com os níveis
 * editáveis ele passaria a mentir sobre o que o nível faz.
 */
export function describeEffort(
  level: string,
  userConfigs?: Partial<Record<EffortLevel, Partial<EffortConfig>>>
): string {
  const lvl = isEffortLevel(level) ? level : "med";
  return `${tr(EFFORT_TAGLINES[lvl])} (${effortNumbers(resolveEffortConfig(lvl, userConfigs))})`;
}

/** As descrições de FÁBRICA (sem nada editado). Quem mostra o nível pra
 *  pessoa usa describeEffort com as settings. Getters: a descrição passa pelo
 *  tr(), então é montada na LEITURA — no import ela ficaria presa no idioma
 *  daquela hora. */
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
