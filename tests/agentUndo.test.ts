import { beforeEach, describe, expect, it } from "vitest";
import { TFile, TFolder, type App } from "obsidian";
import {
  ConflitoAoDesfazer,
  antesDe,
  apagarVaiPraLixeira,
  depoisDe,
  desfazer,
  esquecerDesfazeres,
  podeDesfazer,
  registrarDesfazer,
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

function vaultFalso(trashOption: string | null = "local") {
  const bytes = new Map<string, Uint8Array>();
  const nos = new Map<string, TFile | TFolder>();
  const lixeira: string[] = [];
  const raiz = Object.assign(new TFolder(), { path: "", name: "", children: [] as unknown[] });
  nos.set("", raiz);
  const paiDe = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
  const nomeDe = (p: string) => p.slice(p.lastIndexOf("/") + 1);
  const registrar = (no: TFile | TFolder, p: string) => {
    nos.set(p, no);
    const pai = nos.get(paiDe(p)) as TFolder | undefined;
    if (pai) (pai.children as unknown[]).push(no);
  };
  const esquecer = (p: string) => {
    const no = nos.get(p);
    const pai = nos.get(paiDe(p)) as TFolder | undefined;
    if (pai && no) {
      const c = pai.children as unknown[];
      c.splice(c.indexOf(no), 1);
    }
    nos.delete(p);
  };
  const novoArquivo = (p: string) =>
    Object.assign(new TFile(), {
      path: p,
      name: nomeDe(p),
      extension: p.split(".").pop(),
      stat: { size: 0 },
    });
  const caminho = (f: TFile | TFolder) => (f as unknown as { path: string }).path;

  const vault = {
    getConfig: (k: string) => (k === "trashOption" ? trashOption : undefined),
    getRoot: () => raiz,
    getAbstractFileByPath: (p: string) => nos.get(p) ?? null,
    async read(f: TFile) {
      return dec.decode(bytes.get(caminho(f)) ?? new Uint8Array());
    },
    async readBinary(f: TFile) {
      const b = bytes.get(caminho(f)) ?? new Uint8Array();
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    },
    async create(p: string, c: string) {
      const f = novoArquivo(p);
      bytes.set(p, enc.encode(c));
      registrar(f, p);
      return f;
    },
    async createBinary(p: string, b: ArrayBuffer) {
      const f = novoArquivo(p);
      bytes.set(p, new Uint8Array(b));
      registrar(f, p);
      return f;
    },
    async createFolder(p: string) {
      const d = Object.assign(new TFolder(), { path: p, name: nomeDe(p), children: [] as unknown[] });
      registrar(d, p);
      return d;
    },
    async process(f: TFile, fn: (s: string) => string) {
      const p = caminho(f);
      const novo = fn(dec.decode(bytes.get(p) ?? new Uint8Array()));
      bytes.set(p, enc.encode(novo));
      return novo;
    },
  };
  const fileManager = {
    async renameFile(no: TFile | TFolder, destino: string) {
      const de = caminho(no);
      const b = bytes.get(de);
      esquecer(de);
      (no as unknown as { path: string }).path = destino;
      if (b) {
        bytes.delete(de);
        bytes.set(destino, b);
      }
      registrar(no, destino);
    },
    async trashFile(no: TFile | TFolder) {
      const p = caminho(no);
      lixeira.push(p);
      bytes.delete(p);
      esquecer(p);
    },
  };
  const app = { vault, fileManager } as unknown as App;
  const texto = async (p: string) => {
    const f = nos.get(p);
    return f instanceof TFile ? vault.read(f) : null;
  };
  return { app, vault, lixeira, texto, existe: (p: string) => nos.has(p) };
}
const ctxDe = (app: App) => ({ app, vectorIndex: null, appDataPaths: [] }) as any;

async function comoOAgente(
  app: App,
  id: string,
  name: string,
  args: Record<string, unknown>,
  tool: () => Promise<string>
) {
  const antes = await antesDe(app, name, args);
  await tool();
  const volta = antes ? await depoisDe(app, antes) : null;
  if (volta) registrarDesfazer(id, volta);
}

beforeEach(() => esquecerDesfazeres());

describe("a lixeira do Obsidian decide se o YOLO apaga sozinho", () => {
  it("system e local são lixeira; none (apagar de vez) e desconhecido não", () => {
    expect(apagarVaiPraLixeira(vaultFalso("system").app)).toBe(true);
    expect(apagarVaiPraLixeira(vaultFalso("local").app)).toBe(true);
    expect(apagarVaiPraLixeira(vaultFalso("none").app)).toBe(false);
    expect(apagarVaiPraLixeira(vaultFalso(null).app)).toBe(false);
  });
});

describe("desfazer cada mudança do agente", () => {
  it("editar: a nota volta ao que era", async () => {
    const v = vaultFalso();
    await v.vault.create("a.md", "um dois três");
    const args = { path: "a.md", oldStr: "dois", newStr: "DOIS" };
    await comoOAgente(v.app, "e1", "vault_edit", args, () => toolVaultEdit(ctxDe(v.app), args));
    expect(await v.texto("a.md")).toBe("um DOIS três");
    expect(podeDesfazer("e1")).toBe(true);
    expect(await desfazer("e1")).toBe("Restored a.md");
    expect(await v.texto("a.md")).toBe("um dois três");

    expect(podeDesfazer("e1")).toBe(false);
  });

  it("editar e a pessoa mexer depois: para e pergunta — e forçar passa por cima", async () => {
    const v = vaultFalso();
    await v.vault.create("a.md", "x");
    const args = { path: "a.md", oldStr: "x", newStr: "y" };
    await comoOAgente(v.app, "e2", "vault_edit", args, () => toolVaultEdit(ctxDe(v.app), args));
    await v.vault.process(v.vault.getAbstractFileByPath("a.md") as TFile, () => "y + mão da pessoa");
    await expect(desfazer("e2")).rejects.toBeInstanceOf(ConflitoAoDesfazer);
    expect(await v.texto("a.md")).toBe("y + mão da pessoa");
    expect(podeDesfazer("e2")).toBe(true); 
    expect(await desfazer("e2", true)).toBe("Restored a.md");
    expect(await v.texto("a.md")).toBe("x");
  });

  it("criar: o arquivo vai pra lixeira", async () => {
    const v = vaultFalso();
    const args = { path: "novas/b.md", content: "oi" };
    await comoOAgente(v.app, "c1", "vault_create", args, () => toolVaultCreate(ctxDe(v.app), args as never));
    expect(v.existe("novas/b.md")).toBe(true);
    expect(await desfazer("c1")).toBe("Removed novas/b.md");
    expect(v.existe("novas/b.md")).toBe(false);
    expect(v.lixeira).toEqual(["novas/b.md"]);
  });

  it("mover: volta pro lugar (pelo renameFile, que reescreve os links)", async () => {
    const v = vaultFalso();
    await v.vault.create("c.md", "conteúdo");
    const args = { from: "c.md", to: "arquivo/c.md" };
    await comoOAgente(v.app, "m1", "vault_move", args, () => toolVaultMove(ctxDe(v.app), args));
    expect(v.existe("arquivo/c.md")).toBe(true);
    expect(await desfazer("m1")).toBe("Moved back to c.md");
    expect(v.existe("c.md")).toBe(true);
    expect(await v.texto("c.md")).toBe("conteúdo");
  });

  it("apagar: a nota volta com os mesmos bytes, mesmo com apagar de vez", async () => {
    const v = vaultFalso("none");
    await v.vault.create("d.md", "não me perca ✓");
    const args = { path: "d.md" };
    await comoOAgente(v.app, "d1", "vault_delete", args, () => toolVaultDelete(ctxDe(v.app), args));
    expect(v.existe("d.md")).toBe(false);
    expect(await desfazer("d1")).toBe("Restored d.md");
    expect(await v.texto("d.md")).toBe("não me perca ✓");
  });

  it("apagar e o caminho ser ocupado de novo: não restaura por cima", async () => {
    const v = vaultFalso();
    await v.vault.create("e.md", "velho");
    const args = { path: "e.md" };
    await comoOAgente(v.app, "d2", "vault_delete", args, () => toolVaultDelete(ctxDe(v.app), args));
    await v.vault.create("e.md", "novo");
    await expect(desfazer("d2")).rejects.toThrow(/exists again/);
    expect(await v.texto("e.md")).toBe("novo");
  });

  it("criar pasta: sai se ainda estiver vazia; com coisa dentro, fica", async () => {
    const v = vaultFalso();
    const args = { path: "projetos" };
    await comoOAgente(v.app, "f1", "vault_create_folder", args, () => toolVaultCreateFolder(ctxDe(v.app), args));
    expect(await desfazer("f1")).toBe("Removed folder projetos");
    expect(v.existe("projetos")).toBe(false);

    await comoOAgente(v.app, "f2", "vault_create_folder", args, () => toolVaultCreateFolder(ctxDe(v.app), args));
    await v.vault.create("projetos/x.md", "");
    await expect(desfazer("f2", true)).rejects.toThrow(/has files/);
    expect(v.existe("projetos")).toBe(true);
  });

  it("pasta que já existia: a tool não fez nada, e não há Undo", async () => {
    const v = vaultFalso();
    await v.vault.createFolder("ja");
    const args = { path: "ja" };
    await comoOAgente(v.app, "f3", "vault_create_folder", args, () => toolVaultCreateFolder(ctxDe(v.app), args));
    expect(podeDesfazer("f3")).toBe(false);
  });

  it("ler, listar e buscar não guardam nada", async () => {
    const v = vaultFalso();
    expect(await antesDe(v.app, "vault_read", { path: "x.md" })).toBeNull();
    expect(await antesDe(v.app, "vault_search", { query: "x" })).toBeNull();
  });
});
