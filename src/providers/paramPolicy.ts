import type { EffortLevel } from "../core/effort";

interface ParamPolicy {

  supportsTemperature: boolean;

  tempMin: number;
  tempMax: number;

  reasoning: boolean;
}

function tailOf(model: string): string {
  const id = (model || "").toLowerCase();
  return id.includes("/") ? id.slice(id.lastIndexOf("/") + 1) : id;
}

export function isReasoningModel(model: string): boolean {
  const tail = tailOf(model);

  if (/^o[1-9]([-.]|$)/.test(tail)) return true;

  if (/(^|[-/])gpt-5/.test(tail) && !tail.split("-").includes("chat")) return true;

  if (/deepseek-?(r1|reasoner)/.test(tail)) return true;

  if (/(qwq|qwen3[\w.-]*think|magistral)/.test(tail)) return true;
  return false;
}

function isClaude(provider: string, model: string): boolean {
  const id = (model || "").toLowerCase();
  return provider === "anthropic" || id.includes("claude") || id.includes("anthropic/");
}

interface ClaudeVersion {
  family: "opus" | "sonnet" | "haiku" | "fable" | "mythos";
  major: number;
  minor: number;
}

export function claudeVersion(model: string): ClaudeVersion | null {
  const id = (model || "").toLowerCase();
  let m = /claude-(opus|sonnet|haiku|fable|mythos)(?:-(\d+)(?:[-.](\d{1,2})(?!\d))?)?/.exec(id);
  if (m) {
    return {
      family: m[1] as ClaudeVersion["family"],
      major: m[2] ? Number(m[2]) : NaN,
      minor: m[3] ? Number(m[3]) : 0,
    };
  }
  m = /claude-(\d+)(?:[-.](\d))?-(opus|sonnet|haiku)/.exec(id);
  if (m) {
    return {
      family: m[3] as ClaudeVersion["family"],
      major: Number(m[1]),
      minor: m[2] ? Number(m[2]) : 0,
    };
  }
  return null;
}

function atLeast(c: ClaudeVersion, major: number, minor = 0): boolean {
  if (Number.isNaN(c.major)) return true;
  return c.major > major || (c.major === major && c.minor >= minor);
}

function isNewClaude(c: ClaudeVersion): boolean {
  return c.family === "fable" || c.family === "mythos";
}

function claudeAcceptsTemperature(model: string): boolean {
  const c = claudeVersion(model);
  if (!c || isNewClaude(c) || Number.isNaN(c.major)) return false;
  return !atLeast(c, 4, 7);
}

export function paramPolicy(provider: string, model: string): ParamPolicy {
  const reasoning = isReasoningModel(model);
  const claude = isClaude(provider, model);
  const supportsTemperature = !reasoning && (!claude || claudeAcceptsTemperature(model));

  const tempMax = claude || provider === "nim" ? 1 : 2;
  const tempMin = provider === "nim" ? 0.01 : 0;
  return { supportsTemperature, tempMin, tempMax, reasoning };
}

export function resolveTemperature(
  provider: string,
  model: string,
  requested: number | undefined
): number | undefined {
  if (requested == null || requested < 0) return undefined;
  const p = paramPolicy(provider, model);
  if (!p.supportsTemperature) return undefined;
  return Math.max(p.tempMin, Math.min(p.tempMax, requested));
}

function claudeOutputCap(c: ClaudeVersion): number {
  if (isNewClaude(c) || Number.isNaN(c.major)) return 128000;
  if (c.family !== "haiku" && atLeast(c, 4, 6)) return 128000; 
  if (atLeast(c, 4, 5)) return 64000; 
  if (c.family === "sonnet" && atLeast(c, 3, 7)) return 64000; 
  if (c.family === "opus" && atLeast(c, 4, 0)) return 32000; 
  if (atLeast(c, 3, 5)) return 8192; 
  return 4096; 
}

export function maxOutputTokens(provider: string, model: string): number {
  const id = (model || "").toLowerCase();
  const tail = tailOf(model);
  const claude = claudeVersion(model);
  if (claude) return claudeOutputCap(claude);

  if (/(^|[-/])gpt-5/.test(tail)) return 128000;
  if (/^o[1-9]([-.]|$)/.test(tail)) return 100000;
  if (/(^|[-/])gpt-4\.1/.test(tail)) return 32768;
  if (/(^|[-/])gpt-4o/.test(tail)) return 16384;

  if (/gemini-([3-9]|2\.5)/.test(id)) return 65536;
  if (/gemini/.test(id)) return 8192;

  if (/deepseek/.test(id)) return 8192;

  if (id === "openrouter/auto" || id.endsWith("/auto") || id.includes("router")) return 64000;

  if (provider === "nim") return 4096;
  return 16384;
}

export function thinksFirst(model: string): boolean {
  const id = (model || "").toLowerCase();
  if (/deepseek-v4(?:[.-]\d+)?-(flash|pro)(?:[-:]|$)/.test(id)) return true;
  if (id === "openrouter/auto" || id.endsWith("/auto") || id.includes("router")) return true;
  if (isReasoningModel(model)) return true;
  const c = claudeVersion(model);
  if (c) return isNewClaude(c) || atLeast(c, 5, 0);
  if (/gemini-2\.5-(pro|flash)(?!-lite)/.test(id) || /gemini-([3-9]|\d{2})/.test(id)) return true;
  if (/gpt-oss/.test(id)) return true;
  if (/qwen3(?![\w.-]*instruct)/.test(id)) return true;
  return false;
}

export function thinkingFloor(effort?: EffortLevel): number {
  if (effort === "xhigh" || effort === "max") return 64000;
  if (effort === "high") return 32000;
  return 16000;
}

export function resolveMaxTokens(
  provider: string,
  model: string,
  requested: number,
  effort?: EffortLevel
): number {
  const wanted = thinksFirst(model) ? Math.max(requested, thinkingFloor(effort)) : requested;
  return Math.min(wanted, maxOutputTokens(provider, model));
}

function basicEffortLevel(effort: EffortLevel): "low" | "medium" | "high" {
  return effort === "low" ? "low" : effort === "med" ? "medium" : "high";
}

function claudeEffortLevel(c: ClaudeVersion, effort: EffortLevel): string | null {
  const hasControl =
    isNewClaude(c) ||
    (c.family === "opus" && atLeast(c, 4, 5)) ||
    (c.family === "sonnet" && atLeast(c, 4, 6));
  if (!hasControl) return null;
  const hasXhigh =
    (isNewClaude(c) && !Number.isNaN(c.major)) ||
    (c.family === "opus" && atLeast(c, 4, 7)) ||
    (c.family === "sonnet" && atLeast(c, 5, 0));
  const hasMax = !(c.family === "opus" && c.major === 4 && c.minor === 5);
  if (effort === "xhigh") return hasXhigh ? "xhigh" : "high";
  if (effort === "max") return hasMax ? "max" : "high";
  return basicEffortLevel(effort);
}

type BodyEffort =
  | { field: "reasoning_effort"; value: "low" | "medium" | "high" }
  | { field: "output_config"; value: { effort: string } }
  | { field: "reasoning"; value: { effort: "low" | "medium" | "high" } };

export function providerEffort(
  provider: string,
  model: string,
  effort?: EffortLevel
): BodyEffort | null {
  if (!effort) return null;
  if (provider === "anthropic") {
    const c = claudeVersion(model);
    const level = c ? claudeEffortLevel(c, effort) : null;
    return level ? { field: "output_config", value: { effort: level } } : null;
  }
  if (!thinksFirst(model)) return null;
  const tail = tailOf(model);
  const isOpenAI = /^o[1-9]([-.]|$)/.test(tail) || /(^|[-/])gpt-5/.test(tail);
  const fixedEffort = /-pro\b/.test(tail) || /^o1-(mini|preview)/.test(tail);
  if (provider === "openai") {
    return isOpenAI && !fixedEffort ? { field: "reasoning_effort", value: basicEffortLevel(effort) } : null;
  }
  if (provider === "gemini") return { field: "reasoning_effort", value: basicEffortLevel(effort) };
  if (provider === "openrouter" && /^openai\//.test((model || "").toLowerCase()) && isOpenAI && !fixedEffort) {
    return { field: "reasoning", value: { effort: basicEffortLevel(effort) } };
  }
  return null;
}

const learnedNoReasoningWithTools = new Set<string>();

export function noReasoningWithTools(provider: string, model: string): boolean {
  if (provider !== "openai") return false;
  const tail = tailOf(model);
  if (learnedNoReasoningWithTools.has(tail)) return true;
  const m = /(?:^|[-/])gpt-(\d+)(?:\.(\d+))?/.exec(tail);
  if (!m) return false;
  const major = Number(m[1]);
  const minor = m[2] === undefined ? 0 : Number(m[2]);
  return major > 5 || (major === 5 && minor >= 4);
}

export function rememberNoReasoningWithTools(model: string): void {
  learnedNoReasoningWithTools.add(tailOf(model));
}

export function isReasoningWithToolsRejection(message: string): boolean {
  return (
    /reasoning_effort/i.test(message) &&
    /tools?\b/i.test(message) &&
    /not supported/i.test(message)
  );
}

export function applyEffort(
  body: Record<string, unknown>,
  provider: string,
  model: string,
  effort?: EffortLevel
): void {
  const e = providerEffort(provider, model, effort);
  if (e) body[e.field] = e.value;
}
