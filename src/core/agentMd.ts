// src/core/agentMd.ts
// Suporte a AGENT.md (equivalente ao CLAUDE.md do Claude Code):
// Uma nota no vault com instruções globais que é lida a cada turno
// do chat e do agente.

import { TFile, normalizePath, type App } from "obsidian";

export const DEFAULT_AGENT_MD_PATH = "AGENT.md";

/**
 * Nomes de arquivos candidatos caso o usuário não configure um caminho
 * ou use o padrão. Ordem de prioridade.
 */
export const AGENT_MD_CANDIDATES: readonly string[] = [
  "AGENT.md",
  "agent.md",
  "Agent.md",
  ".agent.md",
  "CLAUDE.md",
  "claude.md",
  ".corvus/AGENT.md",
];

/**
 * Template inicial sugerido ao criar um AGENT.md vazio pelo comando.
 */
export const TEMPLATE_AGENT_MD = `# Agent Instructions

<!-- Instructions in this note are loaded on every reply by Corvus / Corvus (like CLAUDE.md). -->

## Rules & Tone
- Answer clearly and concisely.
- Use [[wikilinks]] to link relevant notes in this vault.
`;

/**
 * Verifica se um objeto representa um TFile (suporta mocks em testes).
 */
export function isTFile(file: unknown): file is TFile {
  return (
    file instanceof TFile ||
    (typeof file === "object" &&
      file !== null &&
      "path" in file &&
      !("children" in file))
  );
}

/**
 * Extrai o corpo do AGENT.md, removendo frontmatter se presente.
 */
export function parseAgentMd(raw: string): string {
  if (!raw || !raw.trim()) return "";
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (m) {
    return m[2].trim();
  }
  return raw.trim();
}

/**
 * Determina a lista de caminhos a inspecionar para achar o AGENT.md.
 */
export function candidatePaths(customPath?: string): string[] {
  const custom = customPath?.trim();
  const list: string[] = [];
  if (custom) {
    list.push(normalizePath(custom));
  }
  for (const c of AGENT_MD_CANDIDATES) {
    const norm = normalizePath(c);
    if (!list.includes(norm)) {
      list.push(norm);
    }
  }
  return list;
}

/**
 * Localiza o caminho existente do AGENT.md no vault.
 */
export async function resolveAgentMdPath(
  app: App,
  customPath?: string
): Promise<string | null> {
  if (!app?.vault) return null;
  const candidates = candidatePaths(customPath);
  for (const p of candidates) {
    try {
      if (typeof app.vault.getAbstractFileByPath === "function") {
        const file = app.vault.getAbstractFileByPath(p);
        if (isTFile(file)) return p;
      }
      if (typeof app.vault.adapter?.exists === "function") {
        if (await app.vault.adapter.exists(p)) return p;
      }
    } catch {
      // continua para o próximo candidato
    }
  }
  return null;
}

/**
 * Lê o conteúdo do AGENT.md no vault, fresco a cada turno ("lido a cada vez").
 * Devolve string vazia se o arquivo não existir ou estiver em branco.
 */
export async function loadAgentMd(
  app: App,
  customPath?: string
): Promise<string> {
  if (!app?.vault) return "";
  const path = await resolveAgentMdPath(app, customPath);
  if (!path) return "";
  try {
    if (typeof app.vault.getAbstractFileByPath === "function") {
      const file = app.vault.getAbstractFileByPath(path);
      if (isTFile(file) && typeof app.vault.cachedRead === "function") {
        const raw = await app.vault.cachedRead(file);
        return parseAgentMd(raw);
      }
    }
    if (typeof app.vault.adapter?.read === "function") {
      const raw = await app.vault.adapter.read(path);
      return parseAgentMd(raw);
    }
  } catch (err) {
    console.error("[corvus] falha ao ler AGENT.md:", err);
  }
  return "";
}

/**
 * Abre ou cria o AGENT.md no vault (para o comando da paleta).
 */
export async function openOrCreateAgentMd(
  app: App,
  customPath?: string
): Promise<TFile | null> {
  if (!app?.vault) return null;
  let file: TFile | null = null;
  const existingPath = await resolveAgentMdPath(app, customPath);
  if (existingPath && typeof app.vault.getAbstractFileByPath === "function") {
    const f = app.vault.getAbstractFileByPath(existingPath);
    if (isTFile(f)) file = f;
  }
  if (!file) {
    const target = normalizePath(customPath?.trim() || DEFAULT_AGENT_MD_PATH);
    if (typeof app.vault.getAbstractFileByPath === "function") {
      const existing = app.vault.getAbstractFileByPath(target);
      if (isTFile(existing)) file = existing;
    }
    if (!file && typeof app.vault.create === "function") {
      const parts = target.split("/");
      if (
        parts.length > 1 &&
        typeof app.vault.adapter?.exists === "function" &&
        typeof app.vault.adapter?.mkdir === "function"
      ) {
        const dir = parts.slice(0, -1).join("/");
        if (!(await app.vault.adapter.exists(dir))) {
          await app.vault.adapter.mkdir(dir);
        }
      }
      file = await app.vault.create(target, TEMPLATE_AGENT_MD);
    }
  }
  if (file && app.workspace && typeof app.workspace.getLeaf === "function") {
    try {
      const leaf = app.workspace.getLeaf(false);
      if (leaf && typeof leaf.openFile === "function") {
        await leaf.openFile(file);
      }
    } catch (err) {
      console.error("[corvus] erro ao abrir AGENT.md no editor:", err);
    }
  }
  return file;
}
