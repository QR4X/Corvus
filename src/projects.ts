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

export const PROJECT_DRAFT_VAZIO: ProjectDraft = {
  name: "",
  icon: PROJECT_ICONS[0],
  color: PROJECT_COLORS[0],
};

export function projectProblema(
  d: ProjectDraft,
  existentes: readonly Project[],

  atualId?: string
): string | null {
  const nome = d.name.trim();
  if (!nome) return tr("Give it a name.");
  const colide = existentes.some(
    (p) => p.id !== atualId && p.name.trim().toLowerCase() === nome.toLowerCase()
  );
  if (colide) return tr("There is already a project with that name.");
  return null;
}

export function nomeDaCopia(
  original: string,
  existentes: readonly Project[]
): string {
  const usados = new Set(
    existentes.map((p) => p.name.trim().toLowerCase())
  );
  const base = original.trim() || tr("Project");
  const livre = (nome: string) => !usados.has(nome.toLowerCase());
  const copia = tr("{name} copy", { name: base });
  if (livre(copia)) return copia;
  for (let n = 2; n <= 50; n++) {
    const tentativa = tr("{name} copy {n}", { name: base, n });
    if (livre(tentativa)) return tentativa;
  }
  return copia;
}
