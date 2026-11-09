import { TFile, TFolder, type App, parseYaml, normalizePath } from "obsidian";
import { texto } from "../core/text";

export interface Skill {
  id: string;
  name: string;
  description: string;

  icon: string;

  color: string;

  mode?: string;

  body: string;
  path: string;

  mtime: number;
}

function parseSkillFile(
  path: string,
  raw: string,
  mtime = 0
): Skill | null {
  let fm: Record<string, unknown> = {};
  let body = raw;
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (m) {
    try {
      fm = (parseYaml(m[1]) as Record<string, unknown>) ?? {};
    } catch {
      fm = {};
    }
    body = m[2];
  }
  body = body.trim();
  if (!body) return null;
  const base = (path.replace(/\.md$/i, "").split("/").pop() ?? path).trim();
  const name = texto(fm.name) || base;
  return {
    id: "skill-" + base.toLowerCase().replace(/[^\w-]+/g, "-"),
    name,
    description: texto(fm.description),
    icon: texto(fm.icon) || "sparkles",

    color: texto(fm.color) || "default",
    mode: texto(fm.mode) || undefined,
    body,
    path,
    mtime,
  };
}

export function skillsFolderPrefix(folderPath: string): string {
  const folder = normalizePath(folderPath || "corvus-ai/skills");
  return folder.endsWith("/") ? folder : folder + "/";
}

export function isSkillFilePath(path: string, folderPath: string): boolean {
  if (!path || !path.toLowerCase().endsWith(".md")) return false;
  return normalizePath(path).startsWith(skillsFolderPrefix(folderPath));
}

export async function loadSkills(
  app: App,
  folderPath: string
): Promise<Skill[]> {

  const prefix = skillsFolderPrefix(folderPath);
  const raiz = app.vault.getAbstractFileByPath(prefix.replace(/\/$/, ""));
  if (!(raiz instanceof TFolder)) return [];
  const files: TFile[] = [];
  const desce = (pasta: TFolder): void => {
    for (const filho of pasta.children) {
      if (filho instanceof TFolder) desce(filho);
      else if (filho instanceof TFile && filho.extension === "md") {
        files.push(filho);
      }
    }
  };
  desce(raiz);
  files.sort((a, b) => a.path.localeCompare(b.path));
  const skills: Skill[] = [];

  const seenIds = new Set<string>();
  for (const f of files) {
    try {
      const raw = await app.vault.cachedRead(f);
      const s = parseSkillFile(f.path, raw, f.stat?.mtime ?? 0);
      if (!s) continue;
      if (seenIds.has(s.id)) {
        let n = 2;
        while (seenIds.has(`${s.id}-${n}`)) n++;
        s.id = `${s.id}-${n}`;
      }
      seenIds.add(s.id);
      skills.push(s);
    } catch { void 0; }
  }
  skills.sort((a, b) => a.name.localeCompare(b.name));
  return skills;
}

const EXAMPLE_SKILLS: { file: string; content: string }[] = [
  {
    file: "TL;DR Summary.md",
    content: `---
name: TL;DR Summary
description: Summarize content in 3 bullets + 1 action item
icon: list
mode: chat
---
Summarize the content below in **3 short bullets** and end with **one suggested action**. Be direct.

`,
  },
  {
    file: "Literature note.md",
    content: `---
name: Literature note
description: Turn source material into a literature note (Zettelkasten)
icon: book-open
mode: chat
---
Create a *literature note* from the material below:
- 1-paragraph summary.
- 3 to 5 key takeaways in bullets.
- A **Connections** section suggesting possible [[links]] for my vault.

`,
  },
  {
    file: "Build MOC.md",
    content: `---
name: Build MOC
description: Generate a Map of Content on a topic using your notes
icon: network
mode: vault-qa
---
Build a **Map of Content (MOC)** on the topic below using my notes.
List relevant notes as [[links]] grouped by subtopic, cite sources, and suggest 2-3 missing notes to create.

Topic: `,
  },
];

export async function seedExampleSkills(
  app: App,
  folderPath: string
): Promise<number> {
  const folder = normalizePath(folderPath || "corvus-ai/skills");
  if (!(await app.vault.adapter.exists(folder))) {
    await app.vault.adapter.mkdir(folder);
  }
  let created = 0;
  for (const ex of EXAMPLE_SKILLS) {
    const p = normalizePath(`${folder}/${ex.file}`);

    if (app.vault.getAbstractFileByPath(p)) continue;
    try {
      await app.vault.create(p, ex.content);
      created++;
    } catch { void 0; }
  }
  return created;
}
