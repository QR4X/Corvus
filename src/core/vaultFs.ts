import type { DataAdapter } from "obsidian";

export async function ensureFolder(adapter: DataAdapter, path: string): Promise<void> {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const partial = parts.slice(0, i + 1).join("/");
    if (!(await adapter.exists(partial))) {
      try {
        await adapter.mkdir(partial);
      } catch { void 0; }
    }
  }
}
