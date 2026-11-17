import { CHAT_MODES } from "../core/session";
import { tr } from "../i18n/tr";

export function extractJson(raw: string): string | null {
  const text = (raw || "").trim();
  if (!text) return null;

  const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const open = unfenced.indexOf("{");
  const close = unfenced.lastIndexOf("}");
  if (open < 0 || close <= open) return null;
  return unfenced.slice(open, close + 1);
}

export function parseObject(raw: string): Record<string, unknown> | null {
  const json = extractJson(raw);
  if (!json) return null;
  try {
    const v = JSON.parse(json) as unknown;
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function cleanText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v
    .replace(/^```(?:\w+)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim()
    .slice(0, max);
}

function oneOf(v: unknown, allowed: readonly string[], fallback: string): string {
  return typeof v === "string" && allowed.includes(v) ? v : fallback;
}

export interface SuggestedSkill {
  name: string;
  description: string;
  icon: string;
  color: string;
  mode: string;
  body: string;
}

export interface SuggestedProject {
  name: string;
  icon: string;
  color: string;
  instructions: string;

  notes: string[];
}

export function parseSkill(
  obj: Record<string, unknown> | null,
  validIcons: readonly string[],
  defaultIcon: string,
  validColors: readonly string[] = ["default"]
): SuggestedSkill | null {
  if (!obj) return null;
  const body = cleanText(obj.body, 4000);
  if (!body) return null;
  return {
    name: cleanText(obj.name, 60) || tr("Untitled skill"),
    description: cleanText(obj.description, 140),
    icon: oneOf(obj.icon, validIcons, defaultIcon),
    color: oneOf(obj.color, validColors, "default"),

    mode: oneOf(obj.mode, ["", ...CHAT_MODES], ""),
    body,
  };
}

export function parseProject(
  obj: Record<string, unknown> | null,
  validIcons: readonly string[],
  validColors: readonly string[],
  vaultNotes: readonly string[]
): SuggestedProject | null {
  if (!obj) return null;
  const name = cleanText(obj.name, 60);
  if (!name) return null;
  const notes = validNotes(obj.notes, vaultNotes);
  return {
    name,
    icon: oneOf(obj.icon, validIcons, validIcons[0] ?? "folder"),
    color: oneOf(obj.color, validColors, validColors[0] ?? "default"),
    instructions: cleanText(obj.instructions, 2000),
    notes,
  };
}

function validNotes(
  raw: unknown,
  vaultNotes: readonly string[],
  exclude: readonly string[] = []
): string[] {
  const allowed = new Set(vaultNotes);
  const taken = new Set(exclude);
  return (Array.isArray(raw) ? raw : [])
    .filter((n): n is string => typeof n === "string")
    .filter((n) => allowed.has(n) && !taken.has(n))

    .filter((n, i, all) => all.indexOf(n) === i)
    .slice(0, 10);
}

export function parseNotes(
  obj: Record<string, unknown> | null,
  vaultNotes: readonly string[],
  alreadyPicked: readonly string[] = []
): string[] {
  return obj ? validNotes(obj.notes, vaultNotes, alreadyPicked) : [];
}

export function parseText(
  obj: Record<string, unknown> | null,
  max: number
): string {
  return obj ? cleanText(obj.text, max) : "";
}

export function parseQuestion(obj: Record<string, unknown> | null): string {
  return obj ? cleanText(obj.ask, 200) : "";
}

export function parseOptions(obj: Record<string, unknown> | null): string[] {
  const raw = obj && Array.isArray(obj.options) ? obj.options : [];
  return raw
    .filter((o): o is string => typeof o === "string")
    .map((o) => o.trim().slice(0, 30))
    .filter(Boolean)
    .filter((o, i, all) => all.indexOf(o) === i)
    .slice(0, 3);
}
