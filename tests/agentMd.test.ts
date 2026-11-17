import { describe, it, expect, vi } from "vitest";
import {
  parseAgentMd,
  candidatePaths,
  loadAgentMd,
  openOrCreateAgentMd,
  DEFAULT_AGENT_MD_PATH,
} from "../src/core/agentMd";
import {
  agentMdSection,
  buildChatSystemPrompt,
  buildAgentSystemPrompt,
} from "../src/agent/conversation";
import type { App, TFile } from "obsidian";

describe("parseAgentMd", () => {
  it("returns empty for blank input", () => {
    expect(parseAgentMd("")).toBe("");
    expect(parseAgentMd("   \n\t  ")).toBe("");
  });

  it("keeps plain markdown without frontmatter", () => {
    const raw = "# My Rules\n\n- Always answer in German\n- Do not invent libraries";
    expect(parseAgentMd(raw)).toBe(raw);
  });

  it("strips YAML frontmatter and returns the body", () => {
    const raw = "---\ntitle: Rules\nversion: 1.0\n---\n\n# Instructions\n\nBe direct.";
    expect(parseAgentMd(raw)).toBe("# Instructions\n\nBe direct.");
  });

  it("supports CRLF line breaks in frontmatter", () => {
    const raw = "---\r\ntitle: Windows\r\n---\r\n\r\nWindows rule";
    expect(parseAgentMd(raw)).toBe("Windows rule");
  });

  it("returns empty when the file only has frontmatter", () => {
    const raw = "---\ntags: [config]\n---";
    expect(parseAgentMd(raw)).toBe("");
  });

  it("treats unterminated frontmatter as plain text", () => {
    const raw = "---\nno closing fence here";
    expect(parseAgentMd(raw)).toBe(raw);
  });
});

describe("candidatePaths", () => {
  it("includes the default candidates", () => {
    const paths = candidatePaths();
    expect(paths).toContain("AGENT.md");
    expect(paths).toContain("agent.md");
    expect(paths).toContain(".agent.md");
    expect(paths).toContain("CLAUDE.md");
    expect(paths).toContain(".corvus/AGENT.md");
  });

  it("puts the custom path first and avoids duplicates", () => {
    const paths = candidatePaths("custom/rules.md");
    expect(paths[0]).toBe("custom/rules.md");
    expect(paths).toContain("AGENT.md");

    const pathsDefault = candidatePaths("AGENT.md");
    expect(pathsDefault[0]).toBe("AGENT.md");
    expect(pathsDefault.filter((p) => p === "AGENT.md").length).toBe(1);
  });
});

describe("loadAgentMd", () => {
  it("returns empty when app or vault is missing", async () => {
    expect(await loadAgentMd(null as unknown as App)).toBe("");
    expect(await loadAgentMd({} as unknown as App)).toBe("");
  });

  it("reads the file through cachedRead when a TFile exists", async () => {
    const mockFile = { path: "AGENT.md" } as TFile;
    const app = {
      vault: {
        getAbstractFileByPath: vi.fn((path: string) => {
          if (path === "AGENT.md") return mockFile;
          return null;
        }),
        cachedRead: vi.fn(async () => "---\ntitle: X\n---\n\nRule 1: Be brief."),
      },
    } as unknown as App;

    const content = await loadAgentMd(app);
    expect(content).toBe("Rule 1: Be brief.");
    expect(app.vault.cachedRead).toHaveBeenCalledWith(mockFile);
  });

  it("reloads fresh content on every call", async () => {
    const mockFile = { path: "AGENT.md" } as TFile;
    let turn = 1;
    const app = {
      vault: {
        getAbstractFileByPath: vi.fn((path: string) => (path === "AGENT.md" ? mockFile : null)),
        cachedRead: vi.fn(async () => `Turn ${turn++}: dynamic instruction`),
      },
    } as unknown as App;

    const read1 = await loadAgentMd(app);
    expect(read1).toBe("Turn 1: dynamic instruction");

    const read2 = await loadAgentMd(app);
    expect(read2).toBe("Turn 2: dynamic instruction");
  });

  it("falls back to adapter.read for unindexed files like .agent.md", async () => {
    const app = {
      vault: {
        getAbstractFileByPath: vi.fn(() => null),
        adapter: {
          exists: vi.fn(async (path: string) => path === ".agent.md"),
          read: vi.fn(async () => "Rule in the dotfile"),
        },
      },
    } as unknown as App;

    const content = await loadAgentMd(app);
    expect(content).toBe("Rule in the dotfile");
  });

  it("falls back to CLAUDE.md when AGENT.md is missing", async () => {
    const mockClaude = { path: "CLAUDE.md" } as TFile;
    const app = {
      vault: {
        getAbstractFileByPath: vi.fn((path: string) => (path === "CLAUDE.md" ? mockClaude : null)),
        cachedRead: vi.fn(async () => "Rules inherited from Claude"),
      },
    } as unknown as App;

    const content = await loadAgentMd(app);
    expect(content).toBe("Rules inherited from Claude");
  });

  it("honors a configured custom path", async () => {
    const mockCustom = { path: "configs/rules.md" } as TFile;
    const app = {
      vault: {
        getAbstractFileByPath: vi.fn((path: string) => (path === "configs/rules.md" ? mockCustom : null)),
        cachedRead: vi.fn(async () => "Custom rules"),
      },
    } as unknown as App;

    const content = await loadAgentMd(app, "configs/rules.md");
    expect(content).toBe("Custom rules");
  });

  it("returns empty when no candidate exists", async () => {
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
  it("opens an existing file in the workspace", async () => {
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

  it("creates the file from the template when missing and opens it", async () => {
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

describe("system prompt injection", () => {
  it("agentMdSection wraps the text under an [AGENT.md] header", () => {
    expect(agentMdSection("Project rules")).toBe("\n\n[AGENT.md]\nProject rules");
    expect(agentMdSection("")).toBe("");
    expect(agentMdSection(undefined)).toBe("");
  });

  it("buildChatSystemPrompt injects [AGENT.md] right after the base persona", () => {
    const prompt = buildChatSystemPrompt({
      base: "BASE",
      agentMd: "My global rule",
      instructions: "Project instruction",
      styleInstruction: "Concise style",
    });

    expect(prompt).toContain("BASE\n\n[AGENT.md]\nMy global rule\n\nProject instruction\n\nConcise style");
  });

  it("buildAgentSystemPrompt injects [AGENT.md] after the agent prompt", () => {
    const prompt = buildAgentSystemPrompt(
      "PERSONA",
      "AGENT_PROMPT",
      undefined,
      "PROJ_INSTR",
      "AGENT_MD_RULE"
    );

    expect(prompt).toBe("PERSONA\n\nAGENT_PROMPT\n\n[AGENT.md]\nAGENT_MD_RULE\n\nPROJ_INSTR");
  });
});
