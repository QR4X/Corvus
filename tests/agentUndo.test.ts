import { beforeEach, describe, expect, it } from "vitest";
import { TFile, TFolder, type App } from "obsidian";
import {
  UndoConflict,
  snapshotBefore,
  deleteGoesToTrash,
  buildUndo,
  undo,
  clearUndos,
  canUndo,
  registerUndo,
} from "../src/agent/undo";
import {
  toolVaultCreate,
  toolVaultCreateFolder,
  toolVaultDelete,
  toolVaultEdit,
  toolVaultMove,
} from "../src/agent/tools";

const enc = new TextEncoder();
const dec = new TextDecoder();

function fakeVault(trashOption: string | null = "local") {
  const bytes = new Map<string, Uint8Array>();
  const nodes = new Map<string, TFile | TFolder>();
  const trash: string[] = [];
  const root = Object.assign(new TFolder(), { path: "", name: "", children: [] as unknown[] });
  nodes.set("", root);
  const parentOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
  const nameOf = (p: string) => p.slice(p.lastIndexOf("/") + 1);
  const register = (node: TFile | TFolder, p: string) => {
    nodes.set(p, node);
    const parent = nodes.get(parentOf(p)) as TFolder | undefined;
    if (parent) (parent.children as unknown[]).push(node);
  };
  const forget = (p: string) => {
    const node = nodes.get(p);
    const parent = nodes.get(parentOf(p)) as TFolder | undefined;
    if (parent && node) {
      const c = parent.children as unknown[];
      c.splice(c.indexOf(node), 1);
    }
    nodes.delete(p);
  };
  const newFile = (p: string) =>
    Object.assign(new TFile(), {
      path: p,
      name: nameOf(p),
      extension: p.split(".").pop(),
      stat: { size: 0 },
    });
  const pathOf = (f: TFile | TFolder) => (f as unknown as { path: string }).path;

  const vault = {
    getConfig: (k: string) => (k === "trashOption" ? trashOption : undefined),
    getRoot: () => root,
    getAbstractFileByPath: (p: string) => nodes.get(p) ?? null,
    async read(f: TFile) {
      return dec.decode(bytes.get(pathOf(f)) ?? new Uint8Array());
    },
    async readBinary(f: TFile) {
      const b = bytes.get(pathOf(f)) ?? new Uint8Array();
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    },
    async create(p: string, c: string) {
      const f = newFile(p);
      bytes.set(p, enc.encode(c));
      register(f, p);
      return f;
    },
    async createBinary(p: string, b: ArrayBuffer) {
      const f = newFile(p);
      bytes.set(p, new Uint8Array(b));
      register(f, p);
      return f;
    },
    async createFolder(p: string) {
      const d = Object.assign(new TFolder(), { path: p, name: nameOf(p), children: [] as unknown[] });
      register(d, p);
      return d;
    },
    async process(f: TFile, fn: (s: string) => string) {
      const p = pathOf(f);
      const next = fn(dec.decode(bytes.get(p) ?? new Uint8Array()));
      bytes.set(p, enc.encode(next));
      return next;
    },
  };
  const fileManager = {
    async renameFile(node: TFile | TFolder, target: string) {
      const from = pathOf(node);
      const b = bytes.get(from);
      forget(from);
      (node as unknown as { path: string }).path = target;
      if (b) {
        bytes.delete(from);
        bytes.set(target, b);
      }
      register(node, target);
    },
    async trashFile(node: TFile | TFolder) {
      const p = pathOf(node);
      trash.push(p);
      bytes.delete(p);
      forget(p);
    },
  };
  const app = { vault, fileManager } as unknown as App;
  const text = async (p: string) => {
    const f = nodes.get(p);
    return f instanceof TFile ? vault.read(f) : null;
  };
  return { app, vault, trash, text, exists: (p: string) => nodes.has(p) };
}
const ctxOf = (app: App) => ({ app, vectorIndex: null, appDataPaths: [] }) as any;

async function runAsAgent(
  app: App,
  id: string,
  name: string,
  args: Record<string, unknown>,
  tool: () => Promise<string>
) {
  const before = await snapshotBefore(app, name, args);
  await tool();
  const revert = before ? await buildUndo(app, before) : null;
  if (revert) registerUndo(id, revert);
}

beforeEach(() => clearUndos());

describe("the Obsidian trash setting decides whether YOLO deletes on its own", () => {
  it("treats system and local as trash but not none or unknown", () => {
    expect(deleteGoesToTrash(fakeVault("system").app)).toBe(true);
    expect(deleteGoesToTrash(fakeVault("local").app)).toBe(true);
    expect(deleteGoesToTrash(fakeVault("none").app)).toBe(false);
    expect(deleteGoesToTrash(fakeVault(null).app)).toBe(false);
  });
});

describe("undoing each agent change", () => {
  it("edit: restores the note to its previous text", async () => {
    const v = fakeVault();
    await v.vault.create("a.md", "one two three");
    const args = { path: "a.md", oldStr: "two", newStr: "TWO" };
    await runAsAgent(v.app, "e1", "vault_edit", args, () => toolVaultEdit(ctxOf(v.app), args));
    expect(await v.text("a.md")).toBe("one TWO three");
    expect(canUndo("e1")).toBe(true);
    expect(await undo("e1")).toBe("Restored a.md");
    expect(await v.text("a.md")).toBe("one two three");
    expect(canUndo("e1")).toBe(false);
  });

  it("edit changed later by the user: stops with a conflict and force overrides it", async () => {
    const v = fakeVault();
    await v.vault.create("a.md", "x");
    const args = { path: "a.md", oldStr: "x", newStr: "y" };
    await runAsAgent(v.app, "e2", "vault_edit", args, () => toolVaultEdit(ctxOf(v.app), args));
    await v.vault.process(v.vault.getAbstractFileByPath("a.md") as TFile, () => "y + user change");
    await expect(undo("e2")).rejects.toBeInstanceOf(UndoConflict);
    expect(await v.text("a.md")).toBe("y + user change");
    expect(canUndo("e2")).toBe(true);
    expect(await undo("e2", true)).toBe("Restored a.md");
    expect(await v.text("a.md")).toBe("x");
  });

  it("create: moves the file to the trash", async () => {
    const v = fakeVault();
    const args = { path: "new/b.md", content: "hi" };
    await runAsAgent(v.app, "c1", "vault_create", args, () => toolVaultCreate(ctxOf(v.app), args as never));
    expect(v.exists("new/b.md")).toBe(true);
    expect(await undo("c1")).toBe("Removed new/b.md");
    expect(v.exists("new/b.md")).toBe(false);
    expect(v.trash).toEqual(["new/b.md"]);
  });

  it("move: moves back through renameFile so links are rewritten", async () => {
    const v = fakeVault();
    await v.vault.create("c.md", "content");
    const args = { from: "c.md", to: "archive/c.md" };
    await runAsAgent(v.app, "m1", "vault_move", args, () => toolVaultMove(ctxOf(v.app), args));
    expect(v.exists("archive/c.md")).toBe(true);
    expect(await undo("m1")).toBe("Moved back to c.md");
    expect(v.exists("c.md")).toBe(true);
    expect(await v.text("c.md")).toBe("content");
  });

  it("delete: restores the same bytes even when deletion is permanent", async () => {
    const v = fakeVault("none");
    await v.vault.create("d.md", "keep me ✓");
    const args = { path: "d.md" };
    await runAsAgent(v.app, "d1", "vault_delete", args, () => toolVaultDelete(ctxOf(v.app), args));
    expect(v.exists("d.md")).toBe(false);
    expect(await undo("d1")).toBe("Restored d.md");
    expect(await v.text("d.md")).toBe("keep me ✓");
  });

  it("delete then path reused: does not restore over the new file", async () => {
    const v = fakeVault();
    await v.vault.create("e.md", "old");
    const args = { path: "e.md" };
    await runAsAgent(v.app, "d2", "vault_delete", args, () => toolVaultDelete(ctxOf(v.app), args));
    await v.vault.create("e.md", "new");
    await expect(undo("d2")).rejects.toThrow(/exists again/);
    expect(await v.text("e.md")).toBe("new");
  });

  it("create folder: removes it while empty and keeps it once it has files", async () => {
    const v = fakeVault();
    const args = { path: "projects" };
    await runAsAgent(v.app, "f1", "vault_create_folder", args, () => toolVaultCreateFolder(ctxOf(v.app), args));
    expect(await undo("f1")).toBe("Removed folder projects");
    expect(v.exists("projects")).toBe(false);
    await runAsAgent(v.app, "f2", "vault_create_folder", args, () => toolVaultCreateFolder(ctxOf(v.app), args));
    await v.vault.create("projects/x.md", "");
    await expect(undo("f2", true)).rejects.toThrow(/has files/);
    expect(v.exists("projects")).toBe(true);
  });

  it("existing folder: the tool did nothing so there is no undo", async () => {
    const v = fakeVault();
    await v.vault.createFolder("existing");
    const args = { path: "existing" };
    await runAsAgent(v.app, "f3", "vault_create_folder", args, () => toolVaultCreateFolder(ctxOf(v.app), args));
    expect(canUndo("f3")).toBe(false);
  });

  it("read, list and search take no snapshot", async () => {
    const v = fakeVault();
    expect(await snapshotBefore(v.app, "vault_read", { path: "x.md" })).toBeNull();
    expect(await snapshotBefore(v.app, "vault_search", { query: "x" })).toBeNull();
  });
});
