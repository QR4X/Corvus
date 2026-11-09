import type { App } from "obsidian";

export interface NoteLike {
  path: string;
  basename: string;

  mtime: number;
}

function posicao(nota: NoteLike, busca: string): number {
  const nome = nota.basename.toLowerCase();
  const caminho = nota.path.toLowerCase();
  if (nome === busca) return 0;
  if (nome.startsWith(busca)) return 1;
  if (nome.includes(busca)) return 2;
  if (caminho.includes(busca)) return 3;
  return 4;
}

export function rankNotes(
  notas: readonly NoteLike[],
  busca: string,
  limite = 30
): NoteLike[] {
  const q = busca.trim().toLowerCase();
  const candidatas = q
    ? notas.filter((n) => posicao(n, q) < 4)
    : notas.slice();
  candidatas.sort((a, b) => {
    if (q) {
      const d = posicao(a, q) - posicao(b, q);
      if (d !== 0) return d;
    }
    return b.mtime - a.mtime;
  });
  return candidatas.slice(0, limite);
}

export function notaAberta(app: App): { path: string; basename: string } | null {
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
  texto: string,
  cursor: number
): { start: number; query: string } | null {
  const antes = texto.slice(0, cursor);
  const abre = antes.lastIndexOf("[[");
  if (abre === -1) return null;
  const meio = antes.slice(abre + 2);
  if (meio.includes("]]") || meio.includes("\n")) return null;

  if (meio.length > 80) return null;
  return { start: abre, query: meio };
}
