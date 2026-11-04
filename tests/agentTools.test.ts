import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TFile, TFolder } from "obsidian";
import {
  toolVaultRead,
  toolVaultCreate,
  toolVaultEdit,
  toolVaultMove,
  toolVaultDelete,
  normalizePath,
  isTransientError,
} from "../src/agent/tools";

// As tools do agent MODIFICAM/APAGAM arquivos do vault — o sandboxing de path
// (anti traversal) é segurança crítica. Aqui um vault em memória exercita o
// boundary real + os comportamentos das tools.
//
// O falso é a API DE VAULT, não o adapter: é por ela que as tools passam
// agora, e é ela que carrega as duas garantias que o adapter não dá — apagar
// vai pra lixeira, mover reescreve os links.

function makeApp() {
  const files = new Map<string, string>();
  const nos = new Map<string, TFile | TFolder>();
  /** O que foi pra lixeira, e o que foi renomeado — é o que os testes conferem. */
  const lixeira: string[] = [];
  const renomeados: Array<[string, string]> = [];

  const raiz = Object.assign(new TFolder(), { path: "", name: "", children: [] as unknown[] });
  nos.set("", raiz);

  const paiDe = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
  const nomeDe = (p: string) => p.slice(p.lastIndexOf("/") + 1);

  function registrar(no: TFile | TFolder, p: string) {
    nos.set(p, no);
    const pai = nos.get(paiDe(p)) as TFolder | undefined;
    if (pai) (pai.children as unknown[]).push(no);
  }
  function esquecer(p: string) {
    const no = nos.get(p);
    const pai = nos.get(paiDe(p)) as TFolder | undefined;
    if (pai && no) {
      const c = pai.children as unknown[];
      const i = c.indexOf(no);
      if (i >= 0) c.splice(i, 1);
    }
    nos.delete(p);
  }

  const vault = {
    getRoot: () => raiz,
    getAbstractFileByPath: (p: string) => nos.get(p) ?? null,
    async read(f: TFile) {
      return files.get((f as unknown as { path: string }).path) ?? "";
    },
    async create(p: string, c: string) {
      const f = Object.assign(new TFile(), { path: p, name: nomeDe(p), extension: "md" });
      files.set(p, c);
      registrar(f, p);
      return f;
    },
    async createFolder(p: string) {
      const d = Object.assign(new TFolder(), { path: p, name: nomeDe(p), children: [] as unknown[] });
      registrar(d, p);
      return d;
    },
    async process(f: TFile, fn: (s: string) => string) {
      const p = (f as unknown as { path: string }).path;
      const novo = fn(files.get(p) ?? "");
      files.set(p, novo);
      return novo;
    },
  };

  const fileManager = {
    async renameFile(no: TFile | TFolder, destino: string) {
      const de = (no as unknown as { path: string }).path;
      renomeados.push([de, destino]);
      esquecer(de);
      if (files.has(de)) {
        files.set(destino, files.get(de)!);
        files.delete(de);
      }
      (no as unknown as { path: string; name: string }).path = destino;
      (no as unknown as { path: string; name: string }).name = nomeDe(destino);
      registrar(no, destino);
    },
    async trashFile(no: TFile | TFolder) {
      const p = (no as unknown as { path: string }).path;
      lixeira.push(p);
      esquecer(p);
      files.delete(p);
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { app: { vault, fileManager } as any, files, lixeira, renomeados } as {
    app: unknown;
    files: Map<string, string>;
    lixeira: string[];
    renomeados: Array<[string, string]>;
  };
}

/** Contexto padrão das tools nos testes: storage do app vazio de propósito. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeCtx(app: unknown, appDataPaths: string[] = []): any {
  return { app, vectorIndex: null, appDataPaths, embed: {} };
}

describe("path sandboxing (segurança — anti traversal)", () => {
  const malicious = [
    "../secret.md",
    "../../etc/passwd",
    "notes/../../escape.md",
    "C:\\Windows\\System32", // backslash → vira ":" depois do normalize
    "drive:/x",
    "a/" + "b/".repeat(40) + "deep.md", // > 32 níveis
    "",
  ];
  for (const p of malicious) {
    it(`recusa "${p.slice(0, 24)}"`, async () => {
      const { app, files } = makeApp();
      const ctx = makeCtx(app);
      await expect(toolVaultRead(ctx, { path: p })).rejects.toThrow();
      // nunca deve ter escrito/criado nada
      expect(files.size).toBe(0);
    });
  }

  it("path normal é aceito (read de arquivo existente)", async () => {
    const { app } = makeApp();
    const ctx = makeCtx(app);
    await toolVaultCreate(ctx, { path: "notes/ok.md", content: "hi" });
    expect(await toolVaultRead(ctx, { path: "notes/ok.md" })).toBe("hi");
  });
});

describe("pasta oculta é proibida PRO AGENTE", () => {
  // O caminho que chega no sandbox foi escolhido por um modelo que acabou de
  // ler notas — e nota é dado de fora. O storage do plugin (.axxa) escreve por
  // outro caminho, direto no adapter, e não passa por aqui.
  const proibidos = [
    ".obsidian/plugins/x/main.js", // vira código rodando no próximo restart
    ".obsidian/app.json",
    ".axxa/chats/algum.md", // nosso storage: injeção não reescreve histórico
    ".git/config",
    ".trash/nota.md",
    "notes/.obsidian/x.json", // oculta no MEIO do caminho conta igual
    "a/.git/config",
  ];
  for (const p of proibidos) {
    it(`recusa "${p}"`, () => {
      expect(() => normalizePath(p)).toThrow(/hidden folders/i);
    });
  }

  it("nota comum com ponto no NOME continua passando", () => {
    // A trava é de PASTA oculta, não de ponto em qualquer lugar.
    expect(normalizePath("notas/v1.2.md")).toBe("notas/v1.2.md");
    expect(normalizePath("Dr. Silva/consulta.md")).toBe("Dr. Silva/consulta.md");
  });

  it("nenhuma tool escapa: todas passam pelo sandbox", async () => {
    const { app, files } = makeApp();
    const ctx = makeCtx(app);
    const alvo = ".obsidian/plugins/evil/main.js";
    await expect(toolVaultCreate(ctx, { path: alvo, content: "x" })).rejects.toThrow(
      /hidden folders/i
    );
    await expect(toolVaultRead(ctx, { path: alvo })).rejects.toThrow(/hidden folders/i);
    await expect(
      toolVaultEdit(ctx, { path: alvo, oldStr: "a", newStr: "b" })
    ).rejects.toThrow(/hidden folders/i);
    await expect(toolVaultDelete(ctx, { path: alvo })).rejects.toThrow(/hidden folders/i);
    await expect(
      toolVaultMove(ctx, { from: "a.md", to: alvo })
    ).rejects.toThrow(/hidden folders/i);
    expect(files.size).toBe(0);
  });
});

describe("storage VISÍVEL do app (chat folder) é proibido PRO AGENTE", () => {
  // Desde que o default das conversas virou `axxa/chats` (pasta SEM ponto, pro
  // sync de arquivos copiar), a trava de pasta oculta não cobre mais o nosso
  // storage. Quem fecha a porta agora é o `appDataPaths` configurado.
  it("normalizePath barra o prefixo exato e tudo abaixo dele", () => {
    const pastas = ["axxa/chats", ".axxa/index"];
    for (const p of ["axxa/chats", "axxa/chats/chat/c1.md", "axxa/chats/agent/x.md", ".axxa/index/embeddings.json"]) {
      expect(() => normalizePath(p, pastas)).toThrow(/off limits/i);
    }
    // Fora das pastas do app o mesmo caminho passa; fora do prefixo, também.
    expect(normalizePath("axxa/notas/plano.md", pastas)).toBe("axxa/notas/plano.md");
    expect(normalizePath("axxa-chats/qualquer.md", pastas)).toBe("axxa-chats/qualquer.md");
  });

  it("nenhuma tool escreve no storage visível do app", async () => {
    const { app, files } = makeApp();
    const ctx = makeCtx(app, ["axxa/chats"]);
    await expect(
      toolVaultCreate(ctx, { path: "axxa/chats/chat/e.md", content: "x" })
    ).rejects.toThrow(/off limits/i);
    await expect(toolVaultRead(ctx, { path: "axxa/chats/chat/e.md" })).rejects.toThrow(
      /off limits/i
    );
    expect(files.size).toBe(0);
  });
});

describe("normalizePath (direto)", () => {
  it("normaliza barras e tira leading slash", () => {
    expect(normalizePath("/notes//a.md")).toBe("notes/a.md");
    expect(normalizePath("notes\\sub\\a.md")).toBe("notes/sub/a.md");
  });
  it("recusa .., : e profundidade", () => {
    expect(() => normalizePath("../x")).toThrow();
    expect(() => normalizePath("c:/x")).toThrow();
    expect(() => normalizePath("a/" + "b/".repeat(40) + "c")).toThrow();
    expect(() => normalizePath("")).toThrow();
  });
});

describe("isTransientError (retry só em erro transitório)", () => {
  it("rede/timeout/lock/busy → true", () => {
    for (const m of ["network down", "Request timeout", "file is locked", "resource busy"]) {
      expect(isTransientError(m)).toBe(true);
    }
  });
  it("erro de path/arg → false (não retenta)", () => {
    expect(isTransientError("Arquivo não existe: a.md")).toBe(false);
    expect(isTransientError("String não encontrada")).toBe(false);
    expect(isTransientError("")).toBe(false);
  });
});

describe("toolVaultCreate", () => {
  it("cria + recusa sobrescrever existente", async () => {
    const { app } = makeApp();
    const ctx = makeCtx(app);
    await toolVaultCreate(ctx, { path: "a.md", content: "1" });
    await expect(toolVaultCreate(ctx, { path: "a.md", content: "2" })).rejects.toThrow(
      /already exists/i
    );
  });
});

describe("toolVaultEdit", () => {
  it("substitui ocorrência única", async () => {
    const { app, files } = makeApp();
    const ctx = makeCtx(app);
    await toolVaultCreate(ctx, { path: "a.md", content: "olá mundo" });
    await toolVaultEdit(ctx, { path: "a.md", oldStr: "mundo", newStr: "vault" });
    expect(files.get("a.md")).toBe("olá vault");
  });
  it("RECUSA quando a string aparece N vezes (ambíguo)", async () => {
    const { app } = makeApp();
    const ctx = makeCtx(app);
    await toolVaultCreate(ctx, { path: "a.md", content: "x x x" });
    await expect(
      toolVaultEdit(ctx, { path: "a.md", oldStr: "x", newStr: "y" })
    ).rejects.toThrow(/aparece 3x|ambig/i);
  });
  it("erro quando a string não existe", async () => {
    const { app } = makeApp();
    const ctx = makeCtx(app);
    await toolVaultCreate(ctx, { path: "a.md", content: "abc" });
    await expect(
      toolVaultEdit(ctx, { path: "a.md", oldStr: "zzz", newStr: "y" })
    ).rejects.toThrow(/not found/i);
  });
});

describe("toolVaultMove / Delete", () => {
  it("move e recusa sobrescrever destino", async () => {
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
  it("mover passa pelo fileManager — é ele que reescreve os [[links]]", () => {
    // Com `adapter.rename`, o arquivo chegava no destino e todo link que
    // apontava pro caminho antigo apodrecia em silêncio.
    const fonte = readFileSync(resolve(__dirname, "../src/agent/tools.ts"), "utf8");
    expect(fonte).toContain("app.fileManager.renameFile(");
    expect(fonte).not.toMatch(/await adapter\.rename\(/);
  });

  it("apagar vai pra LIXEIRA, nunca direto pro nada", async () => {
    const { app, files, lixeira } = makeApp();
    const ctx = makeCtx(app);
    await toolVaultCreate(ctx, { path: "a.md", content: "1" });
    const msg = await toolVaultDelete(ctx, { path: "a.md" });
    expect(files.has("a.md")).toBe(false);
    // A garantia: passou por trashFile, então obedece a preferência
    // "Deleted files" de quem usa — e dá pra desfazer.
    expect(lixeira).toEqual(["a.md"]);
    expect(msg).toMatch(/trash/i);
    await expect(toolVaultDelete(ctx, { path: "nope.md" })).rejects.toThrow(
      /does not exist/i
    );
  });

  it("nenhuma tool do agente chama o adapter", async () => {
    // O adapter é legítimo só na pasta OCULTA do app (chatPersistence), onde a
    // API de Vault não enxerga. Aqui ele significaria apagar sem lixeira e
    // escrever sem avisar o metadataCache.
    const fonte = readFileSync(resolve(__dirname, "../src/agent/tools.ts"), "utf8");
    const semComentario = fonte
      .replace(/\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    expect(semComentario).not.toContain("vault.adapter");
    expect(semComentario).not.toMatch(/adapter\./);
  });
});
