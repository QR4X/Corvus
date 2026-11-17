import { tr } from "./i18n/tr";

export interface Project {
  id: string;
  name: string;

  icon: string;

  color: string;

  sources: string[];

  instructions?: string;

  chatIds: string[];
  createdAt: string;
}

export const PROJECT_ICONS: string[] = [
  "folder", "dollar-sign", "book", "graduation-cap", "pencil", "feather",
  "braces", "terminal", "music", "trash-2", "scissors", "palette",
  "stethoscope", "flower", "leaf", "briefcase", "bar-chart-3", "dumbbell",
  "clipboard", "scale", "globe", "plane", "wrench", "paw-print",
  "flask-conical", "brain", "heart", "sprout",
];

export const PROJECT_COLORS: string[] = [
  "default", "#e5484d", "#e5734d", "#e5b54d", "#46a758", "#4361ee", "#a370f7",
];

export function projectColor(color: string): string {
  return color === "default" ? "var(--text-normal)" : color;
}

export function makeProjectId(): string {

  return "proj-" + Math.random().toString(36).slice(2, 10);
}

export interface ProjectDraft {
  name: string;
  icon: string;
  color: string;
}

export const EMPTY_PROJECT_DRAFT: ProjectDraft = {
  name: "",
  icon: PROJECT_ICONS[0],
  color: PROJECT_COLORS[0],
};

export function projectProblem(
  d: ProjectDraft,
  existing: readonly Project[],

  currentId?: string
): string | null {
  const name = d.name.trim();
  if (!name) return tr("Give it a name.");
  const collides = existing.some(
    (p) => p.id !== currentId && p.name.trim().toLowerCase() === name.toLowerCase()
  );
  if (collides) return tr("There is already a project with that name.");
  return null;
}

export function copyName(
  original: string,
  existing: readonly Project[]
): string {
  const used = new Set(
    existing.map((p) => p.name.trim().toLowerCase())
  );
  const base = original.trim() || tr("Project");
  const isFree = (name: string) => !used.has(name.toLowerCase());
  const copy = tr("{name} copy", { name: base });
  if (isFree(copy)) return copy;
  for (let n = 2; n <= 50; n++) {
    const attempt = tr("{name} copy {n}", { name: base, n });
    if (isFree(attempt)) return attempt;
  }
  return copy;
}
