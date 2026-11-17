import { tr } from "../i18n/tr";

export interface SkillDraft {
  name: string;
  description: string;
  icon: string;

  color: string;

  mode: string;

  body: string;
}

export const EMPTY_SKILL_DRAFT: SkillDraft = {
  name: "",
  description: "",
  icon: "sparkles",
  color: "default",
  mode: "",
  body: "",
};

export const SKILL_ICONS: string[] = [
  "sparkles", "list", "book-open", "network", "pencil", "quote",
  "languages", "scissors", "wand", "calendar", "check-check", "brain",
  "code", "table", "mail", "megaphone", "lightbulb", "graduation-cap",
  "search", "map", "flask-conical", "target",
];

const FORBIDDEN_CHARS = /[\\/:*?"<>|#^[\]]/g;

export function skillFileName(name: string): string {
  const cleaned = name
    .replace(FORBIDDEN_CHARS, "-")

    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .trim();

  if (!/[\p{L}\p{N}]/u.test(cleaned)) return "Skill.md";
  return cleaned + ".md";
}

function yaml(v: string): string {
  return '"' + v.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

export function skillMarkdown(d: SkillDraft): string {
  const lines = [
    "---",
    `name: ${yaml(d.name.trim())}`,
    `description: ${yaml(d.description.trim())}`,
    `icon: ${yaml(d.icon || "sparkles")}`,
  ];

  if (d.color && d.color !== "default") lines.push(`color: ${yaml(d.color)}`);

  if (d.mode) lines.push(`mode: ${yaml(d.mode)}`);
  lines.push("---", "", d.body.trim(), "");
  return lines.join("\n");
}

export function skillProblem(
  d: SkillDraft,

  existing: readonly string[],

  current?: string
): string | null {
  if (!d.name.trim()) return tr("Give it a name.");
  if (!d.body.trim())
    return tr("Write the prompt — that is what the skill is.");
  const target = skillFileName(d.name);
  const collides = existing.some(
    (p) => p !== current && (p.split("/").pop() ?? p).toLowerCase() === target.toLowerCase()
  );
  if (collides) return tr("There is already a skill with that name.");
  return null;
}
