import type { App } from "obsidian";

export interface NoteLike {
  path: string;
  basename: string;

  mtime: number;
}

function matchRank(note: NoteLike, query: string): number {
  const name = note.basename.toLowerCase();
  const path = note.path.toLowerCase();
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  if (name.includes(query)) return 2;
  if (path.includes(query)) return 3;
  return 4;
}

export function rankNotes(
  notes: readonly NoteLike[],
  query: string,
  limit = 30
): NoteLike[] {
  const q = query.trim().toLowerCase();
  const candidates = q
    ? notes.filter((n) => matchRank(n, q) < 4)
    : notes.slice();
  candidates.sort((a, b) => {
    if (q) {
      const d = matchRank(a, q) - matchRank(b, q);
      if (d !== 0) return d;
    }
    return b.mtime - a.mtime;
  });
  return candidates.slice(0, limit);
}

export function activeNote(app: App): { path: string; basename: string } | null {
  const f = app.workspace.getActiveFile();
  return f && f.extension === "md" ? { path: f.path, basename: f.basename } : null;
}

export function vaultNotes(app: App): NoteLike[] {
  return app.vault.getMarkdownFiles().map((f) => ({
    path: f.path,
    basename: f.basename,
    mtime: f.stat?.mtime ?? 0,
  }));
}

export async function readNote(
  app: App,
  path: string
): Promise<{ path: string; content: string } | null> {
  const file = app.vault.getAbstractFileByPath(path);

  if (!file || !("stat" in file)) return null;
  try {
    const content = await app.vault.cachedRead(file as never);
    return { path, content };
  } catch {
    return null;
  }
}

export function wikilinkQuery(
  text: string,
  cursor: number
): { start: number; query: string } | null {
  const before = text.slice(0, cursor);
  const openAt = before.lastIndexOf("[[");
  if (openAt === -1) return null;
  const typed = before.slice(openAt + 2);
  if (typed.includes("]]") || typed.includes("\n")) return null;

  if (typed.length > 80) return null;
  return { start: openAt, query: typed };
}
