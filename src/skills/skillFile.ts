import { tr } from "../i18n/tr";

export interface SkillDraft {
  name: string;
  description: string;
  icon: string;

  color: string;

  mode: string;

  body: string;
}

export const SKILL_DRAFT_VAZIO: SkillDraft = {
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

const PROIBIDOS = /[\\/:*?"<>|#^[\]]/g;

export function skillFileName(nome: string): string {
  const limpo = nome
    .replace(PROIBIDOS, "-")

    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .trim();

  if (!/[\p{L}\p{N}]/u.test(limpo)) return "Skill.md";
  return limpo + ".md";
}

function yaml(v: string): string {
  return '"' + v.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

export function skillMarkdown(d: SkillDraft): string {
  const linhas = [
    "---",
    `name: ${yaml(d.name.trim())}`,
    `description: ${yaml(d.description.trim())}`,
    `icon: ${yaml(d.icon || "sparkles")}`,
  ];

  if (d.color && d.color !== "default") linhas.push(`color: ${yaml(d.color)}`);

  if (d.mode) linhas.push(`mode: ${yaml(d.mode)}`);
  linhas.push("---", "", d.body.trim(), "");
  return linhas.join("\n");
}

export function skillProblema(
  d: SkillDraft,

  existentes: readonly string[],

  atual?: string
): string | null {
  if (!d.name.trim()) return tr("Give it a name.");
  if (!d.body.trim())
    return tr("Write the prompt — that is what the skill is.");
  const alvo = skillFileName(d.name);
  const colide = existentes.some(
    (p) => p !== atual && (p.split("/").pop() ?? p).toLowerCase() === alvo.toLowerCase()
  );
  if (colide) return tr("There is already a skill with that name.");
  return null;
}
