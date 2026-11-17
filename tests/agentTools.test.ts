import { describe, it, expect } from "vitest";
import { TFile, TFolder } from "obsidian";
import {
  toolVaultRead,
  toolVaultCreate,
  toolVaultCreateFolder,
  toolVaultEdit,
  toolVaultMove,
  toolVaultDelete,
  normalizePath,
  isTransientError,
} from "../src/agent/tools";

function makeApp() {
  const files = new Map<string, string>();
  const nodes = new Map<string, TFile | TFolder>();

  const trash: string[] = [];
  const renamed: Array<[string, string]> = [];
  const adapterAccess: string[] = [];

  const root = Object.assign(new TFolder(), { path: "", name: "", children: [] as unknown[] });
  nodes.set("", root);

  const parentOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
  const nameOf = (p: string) => p.slice(p.lastIndexOf("/") + 1);

  function register(node: TFile | TFolder, p: string) {
    nodes.set(p, node);
    const parent = nodes.get(parentOf(p)) as TFolder | undefined;
    if (parent) (parent.children as unknown[]).push(node);
  }
  function forget(p: string) {
    const node = nodes.get(p);
    const parent = nodes.get(parentOf(p)) as TFolder | undefined;
    if (parent && node) {
      const c = parent.children as unknown[];
      const i = c.indexOf(node);
      if (i >= 0) c.splice(i, 1);
    }
    nodes.delete(p);
  }

  const adapter = new Proxy(
    {},
    {
      get(_target, key) {
        adapterAccess.push(String(key));
        return () => {
          throw new Error(`adapter.${String(key)} must not be used`);
        };
      },
    }
  );

  const vault = {
    adapter,
    getRoot: () => root,
    getAbstractFileByPath: (p: string) => nodes.get(p) ?? null,
    async read(f: TFile) {
      return files.get((f as unknown as { path: string }).path) ?? "";
    },
    async create(p: string, c: string) {
      const f = Object.assign(new TFile(), { path: p, name: nameOf(p), extension: "md" });
      files.set(p, c);
      register(f, p);
      return f;
    },
    async createFolder(p: string) {
      const d = Object.assign(new TFolder(), { path: p, name: nameOf(p), children: [] as unknown[] });
      register(d, p);
      return d;
    },
    async process(f: TFile, fn: (s: string) => string) {
      const p = (f as unknown as { path: string }).path;
      const next = fn(files.get(p) ?? "");
      files.set(p, next);
      return next;
    },
  };

  const fileManager = {
    async renameFile(node: TFile | TFolder, destination: string) {
      const from = (node as unknown as { path: string }).path;
      renamed.push([from, destination]);
      forget(from);
      if (files.has(from)) {
        files.set(destination, files.get(from)!);
        files.delete(from);
      }
      (node as unknown as { path: string; name: string }).path = destination;
      (node as unknown as { path: string; name: string }).name = nameOf(destination);
      register(node, destination);
    },
    async trashFile(node: TFile | TFolder) {
      const p = (node as unknown as { path: string }).path;
      trash.push(p);
      forget(p);
      files.delete(p);
    },
  };
  return { app: { vault, fileManager }, files, trash, renamed, adapterAccess } as {
    app: unknown;
    files: Map<string, string>;
    trash: string[];
    renamed: Array<[string, string]>;
    adapterAccess: string[];
  };
}
function makeCtx(app: unknown, appDataPaths: string[] = []): any {
  return { app, vectorIndex: null, appDataPaths, embed: {} };
}

describe("path sandboxing against traversal", () => {
  const malicious = [
    "../secret.md",
    "../../etc/passwd",
    "notes/../../escape.md",
    "C:\\Windows\\System32",
    "drive:/x",
    "a/" + "b/".repeat(40) + "deep.md",
    "",
  ];
  for (const p of malicious) {
    it(`rejects "${p.slice(0, 24)}"`, async () => {
      const { app, files } = makeApp();
      const ctx = makeCtx(app);
      await expect(toolVaultRead(ctx, { path: p })).rejects.toThrow();

      expect(files.size).toBe(0);
    });
  }

  it("accepts a normal path and reads the existing file", async () => {
    const { app } = makeApp();
    const ctx = makeCtx(app);
    await toolVaultCreate(ctx, { path: "notes/ok.md", content: "hi" });
    expect(await toolVaultRead(ctx, { path: "notes/ok.md" })).toBe("hi");
  });
});

describe("hidden folders are off limits to the agent", () => {
  const forbidden = [
    ".obsidian/plugins/x/main.js",
    ".obsidian/app.json",
    ".corvus/chats/some.md",
    ".git/config",
    ".trash/note.md",
    "notes/.obsidian/x.json",
    "a/.git/config",
  ];
  for (const p of forbidden) {
    it(`rejects "${p}"`, () => {
      expect(() => normalizePath(p)).toThrow(/hidden folders/i);
    });
  }

  it("still accepts a regular note with a dot in its name", () => {
    expect(normalizePath("notes/v1.2.md")).toBe("notes/v1.2.md");
    expect(normalizePath("Dr. Smith/appointment.md")).toBe("Dr. Smith/appointment.md");
  });

  it("routes every tool through the sandbox", async () => {
    const { app, files } = makeApp();
    const ctx = makeCtx(app);
    const target = ".obsidian/plugins/evil/main.js";
    await expect(toolVaultCreate(ctx, { path: target, content: "x" })).rejects.toThrow(
      /hidden folders/i
    );
    await expect(toolVaultRead(ctx, { path: target })).rejects.toThrow(/hidden folders/i);
    await expect(
      toolVaultEdit(ctx, { path: target, oldStr: "a", newStr: "b" })
    ).rejects.toThrow(/hidden folders/i);
    await expect(toolVaultDelete(ctx, { path: target })).rejects.toThrow(/hidden folders/i);
    await expect(
      toolVaultMove(ctx, { from: "a.md", to: target })
    ).rejects.toThrow(/hidden folders/i);
    expect(files.size).toBe(0);
  });
});

describe("visible app storage (chat folder) is off limits to the agent", () => {
  it("normalizePath blocks the exact prefix and everything below it", () => {
    const folders = ["corvus/chats", ".corvus/index"];
    for (const p of ["corvus/chats", "corvus/chats/chat/c1.md", "corvus/chats/agent/x.md", ".corvus/index/embeddings.json"]) {
      expect(() => normalizePath(p, folders)).toThrow(/off limits/i);
    }

    expect(normalizePath("corvus/notes/plan.md", folders)).toBe("corvus/notes/plan.md");
    expect(normalizePath("corvus-chats/anything.md", folders)).toBe("corvus-chats/anything.md");
  });

  it("no tool writes into the visible app storage", async () => {
    const { app, files } = makeApp();
    const ctx = makeCtx(app, ["corvus/chats"]);
    await expect(
      toolVaultCreate(ctx, { path: "corvus/chats/chat/e.md", content: "x" })
    ).rejects.toThrow(/off limits/i);
    await expect(toolVaultRead(ctx, { path: "corvus/chats/chat/e.md" })).rejects.toThrow(
      /off limits/i
    );
    expect(files.size).toBe(0);
  });
});

describe("normalizePath", () => {
  it("normalizes slashes and strips the leading slash", () => {
    expect(normalizePath("/notes//a.md")).toBe("notes/a.md");
    expect(normalizePath("notes\\sub\\a.md")).toBe("notes/sub/a.md");
  });
  it("rejects .., drive colons and excessive depth", () => {
    expect(() => normalizePath("../x")).toThrow();
    expect(() => normalizePath("c:/x")).toThrow();
    expect(() => normalizePath("a/" + "b/".repeat(40) + "c")).toThrow();
    expect(() => normalizePath("")).toThrow();
  });
});

describe("isTransientError", () => {
  it("treats network, timeout, lock and busy errors as transient", () => {
    for (const m of ["network down", "Request timeout", "file is locked", "resource busy"]) {
      expect(isTransientError(m)).toBe(true);
    }
  });
  it("does not retry path or argument errors", () => {
    expect(isTransientError("File does not exist: a.md")).toBe(false);
    expect(isTransientError("String not found")).toBe(false);
    expect(isTransientError("")).toBe(false);
  });
});

describe("toolVaultCreate", () => {
  it("creates a file and refuses to overwrite an existing one", async () => {
    const { app } = makeApp();
    const ctx = makeCtx(app);
    await toolVaultCreate(ctx, { path: "a.md", content: "1" });
    await expect(toolVaultCreate(ctx, { path: "a.md", content: "2" })).rejects.toThrow(
      /already exists/i
    );
  });
});

describe("toolVaultEdit", () => {
  it("replaces a single occurrence", async () => {
    const { app, files } = makeApp();
    const ctx = makeCtx(app);
    await toolVaultCreate(ctx, { path: "a.md", content: "hello world" });
    await toolVaultEdit(ctx, { path: "a.md", oldStr: "world", newStr: "vault" });
    expect(files.get("a.md")).toBe("hello vault");
  });
  it("refuses when the string appears several times", async () => {
    const { app } = makeApp();
    const ctx = makeCtx(app);
    await toolVaultCreate(ctx, { path: "a.md", content: "x x x" });
    await expect(
      toolVaultEdit(ctx, { path: "a.md", oldStr: "x", newStr: "y" })
    ).rejects.toThrow(/appears 3x|ambig/i);
  });
  it("fails when the string is missing", async () => {
    const { app } = makeApp();
    const ctx = makeCtx(app);
    await toolVaultCreate(ctx, { path: "a.md", content: "abc" });
    await expect(
      toolVaultEdit(ctx, { path: "a.md", oldStr: "zzz", newStr: "y" })
    ).rejects.toThrow(/not found/i);
  });
});

describe("toolVaultMove and toolVaultDelete", () => {
  it("moves a file and refuses to overwrite the destination", async () => {
    const { app, files } = makeApp();
    const ctx = makeCtx(app);
    await toolVaultCreate(ctx, { path: "a.md", content: "1" });
    await toolVaultMove(ctx, { from: "a.md", to: "b.md" });
    expect(files.has("a.md")).toBe(false);
    expect(files.get("b.md")).toBe("1");

    await toolVaultCreate(ctx, { path: "c.md", content: "2" });
    await expect(toolVaultMove(ctx, { from: "c.md", to: "b.md" })).rejects.toThrow(
      /already exists/i
    );
  });

  it("moves through the file manager so links get rewritten", async () => {
    const { app, renamed } = makeApp();
    const ctx = makeCtx(app);
    await toolVaultCreate(ctx, { path: "a.md", content: "1" });
    await toolVaultMove(ctx, { from: "a.md", to: "sub/b.md" });
    expect(renamed).toEqual([["a.md", "sub/b.md"]]);
  });

  it("sends deleted files to the trash", async () => {
    const { app, files, trash } = makeApp();
    const ctx = makeCtx(app);
    await toolVaultCreate(ctx, { path: "a.md", content: "1" });
    const msg = await toolVaultDelete(ctx, { path: "a.md" });
    expect(files.has("a.md")).toBe(false);

    expect(trash).toEqual(["a.md"]);
    expect(msg).toMatch(/trash/i);
    await expect(toolVaultDelete(ctx, { path: "nope.md" })).rejects.toThrow(
      /does not exist/i
    );
  });

  it("never touches the vault adapter", async () => {
    const { app, adapterAccess } = makeApp();
    const ctx = makeCtx(app);
    await toolVaultCreateFolder(ctx, { path: "dir" });
    await toolVaultCreate(ctx, { path: "dir/a.md", content: "one" });
    await toolVaultRead(ctx, { path: "dir/a.md" });
    await toolVaultEdit(ctx, { path: "dir/a.md", oldStr: "one", newStr: "two" });
    await toolVaultMove(ctx, { from: "dir/a.md", to: "other/b.md" });
    await toolVaultDelete(ctx, { path: "other/b.md" });
    expect(adapterAccess).toEqual([]);
  });
});
