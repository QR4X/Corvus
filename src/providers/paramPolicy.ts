import type { EffortLevel } from "../core/effort";

export interface ParamPolicy {

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

export interface ClaudeVersao {
  familia: "opus" | "sonnet" | "haiku" | "fable" | "mythos";
  maior: number;
  menor: number;
}

export function claudeVersao(model: string): ClaudeVersao | null {
  const id = (model || "").toLowerCase();
  let m = /claude-(opus|sonnet|haiku|fable|mythos)(?:-(\d+)(?:[-.](\d{1,2})(?!\d))?)?/.exec(id);
  if (m) {
    return {
      familia: m[1] as ClaudeVersao["familia"],
      maior: m[2] ? Number(m[2]) : NaN,
      menor: m[3] ? Number(m[3]) : 0,
    };
  }
  m = /claude-(\d+)(?:[-.](\d))?-(opus|sonnet|haiku)/.exec(id);
  if (m) {
    return {
      familia: m[3] as ClaudeVersao["familia"],
      maior: Number(m[1]),
      menor: m[2] ? Number(m[2]) : 0,
    };
  }
  return null;
}

function noMinimo(c: ClaudeVersao, maior: number, menor = 0): boolean {
  if (Number.isNaN(c.maior)) return true;
  return c.maior > maior || (c.maior === maior && c.menor >= menor);
}

function claudeNovo(c: ClaudeVersao): boolean {
  return c.familia === "fable" || c.familia === "mythos";
}

function claudeAceitaTemperatura(model: string): boolean {
  const c = claudeVersao(model);
  if (!c || claudeNovo(c) || Number.isNaN(c.maior)) return false;
  return !noMinimo(c, 4, 7);
}

export function paramPolicy(provider: string, model: string): ParamPolicy {
  const reasoning = isReasoningModel(model);
  const claude = isClaude(provider, model);
  const supportsTemperature = !reasoning && (!claude || claudeAceitaTemperatura(model));

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

function tetoClaude(c: ClaudeVersao): number {
  if (claudeNovo(c) || Number.isNaN(c.maior)) return 128000;
  if (c.familia !== "haiku" && noMinimo(c, 4, 6)) return 128000; 
  if (noMinimo(c, 4, 5)) return 64000; 
  if (c.familia === "sonnet" && noMinimo(c, 3, 7)) return 64000; 
  if (c.familia === "opus" && noMinimo(c, 4, 0)) return 32000; 
  if (noMinimo(c, 3, 5)) return 8192; 
  return 4096; 
}

export function maxOutputTokens(provider: string, model: string): number {
  const id = (model || "").toLowerCase();
  const tail = tailOf(model);
  const claude = claudeVersao(model);
  if (claude) return tetoClaude(claude);

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

export function pensaAntes(_provider: string, model: string): boolean {
  const id = (model || "").toLowerCase();
  if (/deepseek-v4(?:[.-]\d+)?-(flash|pro)(?:[-:]|$)/.test(id)) return true;
  if (id === "openrouter/auto" || id.endsWith("/auto") || id.includes("router")) return true;
  if (isReasoningModel(model)) return true;
  const c = claudeVersao(model);
  if (c) return claudeNovo(c) || noMinimo(c, 5, 0);
  if (/gemini-2\.5-(pro|flash)(?!-lite)/.test(id) || /gemini-([3-9]|\d{2})/.test(id)) return true;
  if (/gpt-oss/.test(id)) return true;
  if (/qwen3(?![\w.-]*instruct)/.test(id)) return true;
  return false;
}

export function pisoPensando(effort?: EffortLevel): number {
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
  const pedido = pensaAntes(provider, model) ? Math.max(requested, pisoPensando(effort)) : requested;
  return Math.min(pedido, maxOutputTokens(provider, model));
}

function degrauBasico(effort: EffortLevel): "low" | "medium" | "high" {
  return effort === "low" ? "low" : effort === "med" ? "medium" : "high";
}

function nivelClaude(c: ClaudeVersao, effort: EffortLevel): string | null {
  const temControle =
    claudeNovo(c) ||
    (c.familia === "opus" && noMinimo(c, 4, 5)) ||
    (c.familia === "sonnet" && noMinimo(c, 4, 6));
  if (!temControle) return null;
  const temXhigh =
    (claudeNovo(c) && !Number.isNaN(c.maior)) ||
    (c.familia === "opus" && noMinimo(c, 4, 7)) ||
    (c.familia === "sonnet" && noMinimo(c, 5, 0));
  const temMax = !(c.familia === "opus" && c.maior === 4 && c.menor === 5);
  if (effort === "xhigh") return temXhigh ? "xhigh" : "high";
  if (effort === "max") return temMax ? "max" : "high";
  return degrauBasico(effort);
}

export type EsforcoNoCorpo =
  | { campo: "reasoning_effort"; valor: "low" | "medium" | "high" }
  | { campo: "output_config"; valor: { effort: string } }
  | { campo: "reasoning"; valor: { effort: "low" | "medium" | "high" } };

export function esforcoDoProvider(
  provider: string,
  model: string,
  effort?: EffortLevel
): EsforcoNoCorpo | null {
  if (!effort) return null;
  if (provider === "anthropic") {
    const c = claudeVersao(model);
    const nivel = c ? nivelClaude(c, effort) : null;
    return nivel ? { campo: "output_config", valor: { effort: nivel } } : null;
  }
  if (!pensaAntes(provider, model)) return null;
  const tail = tailOf(model);
  const daOpenAI = /^o[1-9]([-.]|$)/.test(tail) || /(^|[-/])gpt-5/.test(tail);
  const semEscolha = /-pro\b/.test(tail) || /^o1-(mini|preview)/.test(tail);
  if (provider === "openai") {
    return daOpenAI && !semEscolha ? { campo: "reasoning_effort", valor: degrauBasico(effort) } : null;
  }
  if (provider === "gemini") return { campo: "reasoning_effort", valor: degrauBasico(effort) };
  if (provider === "openrouter" && /^openai\//.test((model || "").toLowerCase()) && daOpenAI && !semEscolha) {
    return { campo: "reasoning", valor: { effort: degrauBasico(effort) } };
  }
  return null;
}

const aprendidosSemRaciocinioComFerramentas = new Set<string>();

export function semRaciocinioComFerramentas(provider: string, model: string): boolean {
  if (provider !== "openai") return false;
  const tail = tailOf(model);
  if (aprendidosSemRaciocinioComFerramentas.has(tail)) return true;
  const m = /(?:^|[-/])gpt-(\d+)(?:\.(\d+))?/.exec(tail);
  if (!m) return false;
  const maior = Number(m[1]);
  const menor = m[2] === undefined ? 0 : Number(m[2]);
  return maior > 5 || (maior === 5 && menor >= 4);
}

export function lembrarSemRaciocinioComFerramentas(model: string): void {
  aprendidosSemRaciocinioComFerramentas.add(tailOf(model));
}

export function ehRecusaDeRaciocinioComFerramentas(mensagem: string): boolean {
  return (
    /reasoning_effort/i.test(mensagem) &&
    /tools?\b/i.test(mensagem) &&
    /not supported/i.test(mensagem)
  );
}

export function aplicarEsforco(
  body: Record<string, unknown>,
  provider: string,
  model: string,
  effort?: EffortLevel
): void {
  const e = esforcoDoProvider(provider, model, effort);
  if (e) body[e.campo] = e.valor;
}
