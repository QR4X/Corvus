import { describe, it, expect, vi } from "vitest";
import {
  parseAgentMd,
  candidatePaths,
  loadAgentMd,
  openOrCreateAgentMd,
  DEFAULT_AGENT_MD_PATH,
} from "../src/core/agentMd";
import {
  blocoAgentMd,
  buildChatSystemPrompt,
  buildAgentSystemPrompt,
} from "../src/agent/conversation";
import type { App, TFile } from "obsidian";

describe("parseAgentMd", () => {
  it("devolve vazio quando recebe nulo, indefinido ou em branco", () => {
    expect(parseAgentMd("")).toBe("");
    expect(parseAgentMd("   \n\t  ")).toBe("");
  });

  it("mantém markdown puro sem frontmatter", () => {
    const raw = "# Minhas Regras\n\n- Sempre responda em alemão\n- Não invente bibliotecas";
    expect(parseAgentMd(raw)).toBe(raw);
  });

  it("remove frontmatter YAML e retorna o corpo", () => {
    const raw = "---\ntitle: Regras\nversion: 1.0\n---\n\n# Instruções\n\nSeja direto.";
    expect(parseAgentMd(raw)).toBe("# Instruções\n\nSeja direto.");
  });

  it("suporta quebras de linha CRLF no frontmatter", () => {
    const raw = "---\r\ntitle: Windows\r\n---\r\n\r\nRegra Windows";
    expect(parseAgentMd(raw)).toBe("Regra Windows");
  });

  it("devolve vazio se o arquivo só contiver frontmatter", () => {
    const raw = "---\ntags: [config]\n---";
    expect(parseAgentMd(raw)).toBe("");
  });

  it("trata frontmatter não finalizado como texto normal", () => {
    const raw = "---\nsem fechamento aqui";
    expect(parseAgentMd(raw)).toBe(raw);
  });
});

describe("candidatePaths", () => {
  it("inclui os candidatos padrão por padrão", () => {
    const paths = candidatePaths();
    expect(paths).toContain("AGENT.md");
    expect(paths).toContain("agent.md");
    expect(paths).toContain(".agent.md");
    expect(paths).toContain("CLAUDE.md");
    expect(paths).toContain(".corvus/AGENT.md");
  });

  it("coloca o caminho customizado em primeiro lugar e evita duplicatas", () => {
    const paths = candidatePaths("custom/regras.md");
    expect(paths[0]).toBe("custom/regras.md");
    expect(paths).toContain("AGENT.md");

    const pathsDefault = candidatePaths("AGENT.md");
    expect(pathsDefault[0]).toBe("AGENT.md");
    expect(pathsDefault.filter((p) => p === "AGENT.md").length).toBe(1);
  });
});

describe("loadAgentMd", () => {
  it("devolve vazio se app ou vault não existirem", async () => {
    expect(await loadAgentMd(null as unknown as App)).toBe("");
    expect(await loadAgentMd({} as unknown as App)).toBe("");
  });

  it("lê arquivo via cachedRead quando TFile existe no vault", async () => {
    const mockFile = { path: "AGENT.md" } as TFile;
    const app = {
      vault: {
        getAbstractFileByPath: vi.fn((path: string) => {
          if (path === "AGENT.md") return mockFile;
          return null;
        }),
        cachedRead: vi.fn(async () => "---\ntitle: X\n---\n\nRegra 1: Seja breve."),
      },
    } as unknown as App;

    const content = await loadAgentMd(app);
    expect(content).toBe("Regra 1: Seja breve.");
    expect(app.vault.cachedRead).toHaveBeenCalledWith(mockFile);
  });

  it("recarrega dinamicamente a cada chamada com conteúdo atualizado", async () => {
    const mockFile = { path: "AGENT.md" } as TFile;
    let turn = 1;
    const app = {
      vault: {
        getAbstractFileByPath: vi.fn((path: string) => (path === "AGENT.md" ? mockFile : null)),
        cachedRead: vi.fn(async () => `Turno ${turn++}: Instrução dinâmica`),
      },
    } as unknown as App;

    const read1 = await loadAgentMd(app);
    expect(read1).toBe("Turno 1: Instrução dinâmica");

    const read2 = await loadAgentMd(app);
    expect(read2).toBe("Turno 2: Instrução dinâmica");
  });

  it("cai pro adapter.read para arquivos não indexados (como .agent.md)", async () => {
    const app = {
      vault: {
        getAbstractFileByPath: vi.fn(() => null),
        adapter: {
          exists: vi.fn(async (path: string) => path === ".agent.md"),
          read: vi.fn(async () => "Regra no dotfile"),
        },
      },
    } as unknown as App;

    const content = await loadAgentMd(app);
    expect(content).toBe("Regra no dotfile");
  });

  it("encontra CLAUDE.md como fallback se AGENT.md não existir", async () => {
    const mockClaude = { path: "CLAUDE.md" } as TFile;
    const app = {
      vault: {
        getAbstractFileByPath: vi.fn((path: string) => (path === "CLAUDE.md" ? mockClaude : null)),
        cachedRead: vi.fn(async () => "Regras herdadas do Claude"),
      },
    } as unknown as App;

    const content = await loadAgentMd(app);
    expect(content).toBe("Regras herdadas do Claude");
  });

  it("respeita caminho customizado configurado", async () => {
    const mockCustom = { path: "configs/rules.md" } as TFile;
    const app = {
      vault: {
        getAbstractFileByPath: vi.fn((path: string) => (path === "configs/rules.md" ? mockCustom : null)),
        cachedRead: vi.fn(async () => "Regras personalizadas"),
      },
    } as unknown as App;

    const content = await loadAgentMd(app, "configs/rules.md");
    expect(content).toBe("Regras personalizadas");
  });

  it("retorna vazio se nenhum candidato existir", async () => {
    const app = {
      vault: {
        getAbstractFileByPath: vi.fn(() => null),
        getFiles: vi.fn(() => []),
        adapter: {
          exists: vi.fn(async () => false),
        },
      },
    } as unknown as App;

    const content = await loadAgentMd(app);
    expect(content).toBe("");
  });
});

describe("openOrCreateAgentMd", () => {
  it("abre arquivo existente na workspace", async () => {
    const mockFile = { path: "AGENT.md" } as TFile;
    const leaf = { openFile: vi.fn(async () => {}) };
    const app = {
      vault: {
        getAbstractFileByPath: vi.fn((p: string) => (p === "AGENT.md" ? mockFile : null)),
      },
      workspace: {
        getLeaf: vi.fn(() => leaf),
      },
    } as unknown as App;

    await openOrCreateAgentMd(app);
    expect(leaf.openFile).toHaveBeenCalledWith(mockFile);
  });

  it("cria arquivo com template quando não existe e o abre", async () => {
    const newFile = { path: "AGENT.md" } as TFile;
    const leaf = { openFile: vi.fn(async () => {}) };
    const app = {
      vault: {
        getAbstractFileByPath: vi.fn(() => null),
        getFiles: vi.fn(() => []),
        adapter: { exists: vi.fn(async () => false) },
        create: vi.fn(async () => newFile),
      },
      workspace: {
        getLeaf: vi.fn(() => leaf),
      },
    } as unknown as App;

    await openOrCreateAgentMd(app);
    expect(app.vault.create).toHaveBeenCalledWith(
      DEFAULT_AGENT_MD_PATH,
      expect.stringContaining("# Agent Instructions")
    );
    expect(leaf.openFile).toHaveBeenCalledWith(newFile);
  });
});

describe("Injeção nos System Prompts", () => {
  it("blocoAgentMd formata o bloco com cabeçalho [AGENT.md]", () => {
    expect(blocoAgentMd("Regras do projeto")).toBe("\n\n[AGENT.md]\nRegras do projeto");
    expect(blocoAgentMd("")).toBe("");
    expect(blocoAgentMd(undefined)).toBe("");
  });

  it("buildChatSystemPrompt injeta [AGENT.md] logo após head/persona", () => {
    const prompt = buildChatSystemPrompt({
      base: "BASE",
      agentMd: "Minha regra global",
      instructions: "Instrução do projeto",
      styleInstruction: "Estilo conciso",
    });

    expect(prompt).toContain("BASE\n\n[AGENT.md]\nMinha regra global\n\nInstrução do projeto\n\nEstilo conciso");
  });

  it("buildAgentSystemPrompt injeta [AGENT.md] após o agentPrompt", () => {
    const prompt = buildAgentSystemPrompt(
      "PERSONA",
      "AGENT_PROMPT",
      undefined,
      "PROJ_INSTR",
      "REGRA_AGENT_MD"
    );

    expect(prompt).toBe("PERSONA\n\nAGENT_PROMPT\n\n[AGENT.md]\nREGRA_AGENT_MD\n\nPROJ_INSTR");
  });
});
