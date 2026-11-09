import { CHAT_MODES } from "../core/session";
import { tr } from "../i18n/tr";

export interface RespostaAssistente<T> {

  ask?: string;

  draft?: T;
}

export function recortarJson(bruto: string): string | null {
  const texto = (bruto || "").trim();
  if (!texto) return null;

  const semCerca = texto.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const abre = semCerca.indexOf("{");
  const fecha = semCerca.lastIndexOf("}");
  if (abre < 0 || fecha <= abre) return null;
  return semCerca.slice(abre, fecha + 1);
}

export function lerObjeto(bruto: string): Record<string, unknown> | null {
  const recorte = recortarJson(bruto);
  if (!recorte) return null;
  try {
    const v = JSON.parse(recorte) as unknown;
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function texto(v: unknown, teto: number): string {
  if (typeof v !== "string") return "";
  return v
    .replace(/^```(?:\w+)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim()
    .slice(0, teto);
}

function daLista(v: unknown, lista: readonly string[], padrao: string): string {
  return typeof v === "string" && lista.includes(v) ? v : padrao;
}

export interface SkillSugerido {
  name: string;
  description: string;
  icon: string;
  color: string;
  mode: string;
  body: string;
}

export interface ProjetoSugerido {
  name: string;
  icon: string;
  color: string;
  instructions: string;

  notes: string[];
}

export function lerSkill(
  obj: Record<string, unknown> | null,
  iconesValidos: readonly string[],
  iconePadrao: string,
  coresValidas: readonly string[] = ["default"]
): SkillSugerido | null {
  if (!obj) return null;
  const body = texto(obj.body, 4000);
  if (!body) return null;
  return {
    name: texto(obj.name, 60) || tr("Untitled skill"),
    description: texto(obj.description, 140),
    icon: daLista(obj.icon, iconesValidos, iconePadrao),
    color: daLista(obj.color, coresValidas, "default"),

    mode: daLista(obj.mode, ["", ...CHAT_MODES], ""),
    body,
  };
}

export function lerProjeto(
  obj: Record<string, unknown> | null,
  iconesValidos: readonly string[],
  coresValidas: readonly string[],
  notasDoVault: readonly string[]
): ProjetoSugerido | null {
  if (!obj) return null;
  const name = texto(obj.name, 60);
  if (!name) return null;
  const notes = notasValidas(obj.notes, notasDoVault);
  return {
    name,
    icon: daLista(obj.icon, iconesValidos, iconesValidos[0] ?? "folder"),
    color: daLista(obj.color, coresValidas, coresValidas[0] ?? "default"),
    instructions: texto(obj.instructions, 2000),
    notes,
  };
}

function notasValidas(
  cruas: unknown,
  notasDoVault: readonly string[],
  fora: readonly string[] = []
): string[] {
  const permitidas = new Set(notasDoVault);
  const jaTem = new Set(fora);
  return (Array.isArray(cruas) ? cruas : [])
    .filter((n): n is string => typeof n === "string")
    .filter((n) => permitidas.has(n) && !jaTem.has(n))

    .filter((n, i, todas) => todas.indexOf(n) === i)
    .slice(0, 10);
}

export function lerNotas(
  obj: Record<string, unknown> | null,
  notasDoVault: readonly string[],
  jaEscolhidas: readonly string[] = []
): string[] {
  return obj ? notasValidas(obj.notes, notasDoVault, jaEscolhidas) : [];
}

export function lerTexto(
  obj: Record<string, unknown> | null,
  teto: number
): string {
  return obj ? texto(obj.text, teto) : "";
}

export function lerPergunta(obj: Record<string, unknown> | null): string {
  return obj ? texto(obj.ask, 200) : "";
}

export function lerOpcoes(obj: Record<string, unknown> | null): string[] {
  const cruas = obj && Array.isArray(obj.options) ? obj.options : [];
  return cruas
    .filter((o): o is string => typeof o === "string")
    .map((o) => o.trim().slice(0, 30))
    .filter(Boolean)
    .filter((o, i, todas) => todas.indexOf(o) === i)
    .slice(0, 3);
}
