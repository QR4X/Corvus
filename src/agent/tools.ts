import { TFile, TFolder, type App, type TAbstractFile } from "obsidian";
import type { ToolContext } from "./types";
import { hybridSearch } from "../rag/hybrid";
import { toolWebFetch, toolWebSearch } from "./web";
import { transcribeInstagramReel } from "../core/instagramResolver";

const VAULT_ROOT_MAX_DEPTH = 32; 

export function isTransientError(message: string): boolean {
  const m = (message || "").toLowerCase();
  return (
    m.includes("network") ||
    m.includes("timeout") ||
    m.includes("locked") ||
    m.includes("busy")
  );
}

export function normalizePath(
  path: string,
  appDataPaths: readonly string[] = []
): string {
  if (!path || typeof path !== "string") {
    throw new Error("Empty or invalid path.");
  }
  const normalized = path
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\//, "");

  const segs = normalized.split("/");
  if (segs.some((s) => s === ".." || s === ".")) {
    throw new Error("Paths containing '..' are not allowed.");
  }
  if (normalized.includes(":")) {
    throw new Error("Paths containing ':' are not allowed (no drive letters).");
  }

  const oculto = segs.find((s) => s.startsWith("."));
  if (oculto) {
    throw new Error(
      `Hidden folders are off limits to the agent: "${oculto}". ` +
        `They hold app config and plugin data, not your notes.`
    );
  }

  for (const pasta of appDataPaths) {
    const alvo = pasta.replace(/\/+$/, "");
    if (!alvo || alvo === ".") continue;
    if (normalized === alvo || normalized.startsWith(alvo + "/")) {
      throw new Error(
        `App data folders are off limits to the agent: "${alvo}". ` +
          `They hold your chats and the RAG index, not your notes.`
      );
    }
  }
  if (normalized.split("/").length > VAULT_ROOT_MAX_DEPTH) {
    throw new Error(`Paths deeper than ${VAULT_ROOT_MAX_DEPTH} levels are blocked.`);
  }
  return normalized;
}

function achar(app: App, path: string): TAbstractFile | null {
  return app.vault.getAbstractFileByPath(path);
}

function acharArquivo(app: App, path: string): TFile {
  const alvo = achar(app, path);
  if (!alvo) throw new Error(`File does not exist: ${path}`);
  if (!(alvo instanceof TFile)) throw new Error(`${path} is not a file.`);
  return alvo;
}

async function garantirPasta(app: App, dir: string): Promise<void> {
  if (!dir) return;
  const partes = dir.split("/");
  let caminho = "";
  for (const parte of partes) {
    caminho = caminho ? `${caminho}/${parte}` : parte;
    if (!achar(app, caminho)) await app.vault.createFolder(caminho);
  }
}

function dirOf(path: string): string {
  const parts = path.split("/");
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/");
}

interface ListArgs {
  folder?: string;
}

export async function toolVaultList(ctx: ToolContext, args: ListArgs): Promise<string> {
  const folder = args.folder ? normalizePath(args.folder, ctx.appDataPaths) : "";

  const alvo = folder ? achar(ctx.app, folder) : ctx.app.vault.getRoot();
  if (!alvo) {
    return `Folder does not exist: ${folder}`;
  }
  if (!(alvo instanceof TFolder)) {
    return `${folder} is not a folder.`;
  }

  const folders = alvo.children
    .filter((c): c is TFolder => c instanceof TFolder)
    .map((f) => `📁 ${f.path}`);
  const files = alvo.children
    .filter((c): c is TFile => c instanceof TFile)
    .map((f) => `📄 ${f.path}`);
  const all = [...folders, ...files];
  if (all.length === 0) {
    return `Empty folder: ${folder || "/"}`;
  }
  return `Contents of ${folder || "/"} (${all.length} items):\n` + all.join("\n");
}

interface ReadArgs {
  path: string;
}

const MAX_READ_CHARS = 200_000; 

export async function toolVaultRead(ctx: ToolContext, args: ReadArgs): Promise<string> {
  const path = normalizePath(args.path, ctx.appDataPaths);
  const file = acharArquivo(ctx.app, path);

  const content = await ctx.app.vault.read(file);
  if (content.length > MAX_READ_CHARS) {

    let cut = MAX_READ_CHARS;
    const code = content.charCodeAt(cut - 1);
    if (code >= 0xd800 && code <= 0xdbff) cut -= 1;
    return `(file truncated at ${cut} chars — original had ${content.length})\n\n${content.slice(0, cut)}`;
  }
  return content;
}

interface CreateArgs {
  path: string;
  content: string;
}

export async function toolVaultCreate(
  ctx: ToolContext,
  args: CreateArgs
): Promise<string> {
  const path = normalizePath(args.path, ctx.appDataPaths);
  if (achar(ctx.app, path)) {
    throw new Error(
      `File already exists: ${path}. Use vault_edit to modify or vault_move to rename.`
    );
  }
  await garantirPasta(ctx.app, dirOf(path));
  await ctx.app.vault.create(path, args.content ?? "");
  return `File created: ${path} (${(args.content ?? "").length} chars)`;
}

interface EditArgs {
  path: string;

  oldStr: string;

  newStr: string;
}

export async function toolVaultEdit(ctx: ToolContext, args: EditArgs): Promise<string> {
  const path = normalizePath(args.path, ctx.appDataPaths);
  const file = acharArquivo(ctx.app, path);
  const content = await ctx.app.vault.read(file);
  const occurrences = content.split(args.oldStr).length - 1;
  if (occurrences === 0) {
    throw new Error(
      `String not found in ${path}: "${args.oldStr.slice(0, 100)}"`
    );
  }
  if (occurrences > 1) {
    throw new Error(
      `String "${args.oldStr.slice(0, 60)}..." appears ${occurrences}x in ${path}. ` +
        `Use a more specific string to avoid ambiguity.`
    );
  }

  await ctx.app.vault.process(file, (atual) =>
    atual.split(args.oldStr).join(args.newStr)
  );
  const delta = args.newStr.length - args.oldStr.length;
  const sign = delta >= 0 ? "+" : "";
  return `Edited ${path} (${sign}${delta} chars)`;
}

interface MoveArgs {
  from: string;
  to: string;
}

export async function toolVaultMove(ctx: ToolContext, args: MoveArgs): Promise<string> {
  const from = normalizePath(args.from, ctx.appDataPaths);
  const to = normalizePath(args.to, ctx.appDataPaths);
  const alvo = achar(ctx.app, from);
  if (!alvo) {
    throw new Error(`Source does not exist: ${from}`);
  }
  if (achar(ctx.app, to)) {
    throw new Error(`Destination already exists: ${to}. Refusing to overwrite.`);
  }
  if (alvo instanceof TFolder && (to === from || to.startsWith(from + "/"))) {
    throw new Error("Cannot move a folder into itself.");
  }
  await garantirPasta(ctx.app, dirOf(to));

  await ctx.app.fileManager.renameFile(alvo, to);
  return `Moved: ${from} → ${to} (links updated)`;
}

interface DeleteArgs {
  path: string;
}

export async function toolVaultDelete(
  ctx: ToolContext,
  args: DeleteArgs
): Promise<string> {
  const path = normalizePath(args.path, ctx.appDataPaths);
  const alvo = achar(ctx.app, path);
  if (!alvo) {
    throw new Error(`File does not exist: ${path}`);
  }
  if (alvo instanceof TFolder && alvo.children.length > 0) {
    throw new Error(
      `Folder ${path} is not empty. Delete the files first (safety).`
    );
  }

  await ctx.app.fileManager.trashFile(alvo);
  const oQue = alvo instanceof TFolder ? "Empty folder" : "File";
  return `${oQue} moved to trash: ${path}`;
}

interface CreateFolderArgs {
  path: string;
}

export async function toolVaultCreateFolder(
  ctx: ToolContext,
  args: CreateFolderArgs
): Promise<string> {
  const path = normalizePath(args.path, ctx.appDataPaths);
  if (achar(ctx.app, path)) {
    return `Folder already exists: ${path}`;
  }
  await garantirPasta(ctx.app, path);
  return `Folder created: ${path}`;
}

interface SearchArgs {
  query: string;
  topK?: number;
}

export async function toolVaultSearch(
  ctx: ToolContext,
  args: SearchArgs
): Promise<string> {
  const query = String(args.query ?? "").trim();
  if (!query) throw new Error("Empty 'query' parameter.");
  const topK = Math.min(Math.max(Number(args.topK) || 5, 1), 20);

  const hits = await hybridSearch({
    app: ctx.app,
    index: ctx.vectorIndex,
    creds: {
      openaiApiKey: ctx.embed.openaiApiKey,
      openrouterApiKey: ctx.embed.openrouterApiKey,
      geminiApiKey: ctx.embed.geminiApiKey,
      nimApiKey: ctx.embed.nimApiKey,
      ollamaEndpoint: ctx.embed.ollamaEndpoint,
    },
    query,
    topK,
  });
  if (hits.length === 0) {
    return `No relevant notes for "${query}". Try other terms or use vault_list to browse.`;
  }
  const lines = hits.map((h) => `### ${h.path} (${h.via})\n${h.text}`);
  return (
    `Hybrid search — ${hits.length} result(s) for "${query}":\n\n` +
    lines.join("\n\n---\n\n")
  );
}

export type ToolExecutor = (
  ctx: ToolContext,
  args: Record<string, unknown>
) => Promise<string>;

export const TOOL_REGISTRY: Record<string, ToolExecutor> = {
  vault_search: (ctx, args) =>
    toolVaultSearch(ctx, args as unknown as SearchArgs),
  vault_list: (ctx, args) => toolVaultList(ctx, args),
  vault_read: (ctx, args) => toolVaultRead(ctx, args as unknown as ReadArgs),
  vault_create: (ctx, args) =>
    toolVaultCreate(ctx, args as unknown as CreateArgs),
  vault_edit: (ctx, args) => toolVaultEdit(ctx, args as unknown as EditArgs),
  vault_move: (ctx, args) => toolVaultMove(ctx, args as unknown as MoveArgs),
  vault_delete: (ctx, args) =>
    toolVaultDelete(ctx, args as unknown as DeleteArgs),
  vault_create_folder: (ctx, args) =>
    toolVaultCreateFolder(ctx, args as unknown as CreateFolderArgs),
  web_search: (ctx, args) =>
    toolWebSearch(ctx, args as unknown as { query: string; maxResults?: number }),
  web_fetch: (ctx, args) => toolWebFetch(ctx, args as unknown as { url: string }),
  fetch_reel_transcript: (ctx, args) =>
    toolFetchReelTranscript(ctx, args as unknown as { url: string }),
};

export async function toolFetchReelTranscript(
  ctx: ToolContext,
  args: { url: string }
): Promise<string> {
  const url = String(args?.url ?? "").trim();
  const openAi = ctx.embed?.openaiApiKey?.trim();
  const openRouter = ctx.embed?.openrouterApiKey?.trim();
  const cred = openAi
    ? { apiKey: openAi, provider: "openai" as const }
    : openRouter
    ? { apiKey: openRouter, provider: "openrouter" as const }
    : null;
  if (!cred) {
    throw new Error(
      "Transcribing Instagram Reels requires an OpenAI or OpenRouter API key (Settings › Providers)."
    );
  }
  const result = await transcribeInstagramReel(url, {
    apiKey: cred.apiKey,
    provider: cred.provider,
  });
  const parts: string[] = [`Source: ${result.url}`];
  if (result.caption) parts.push(`Caption:\n${result.caption}`);
  parts.push(`Spoken Transcript:\n${result.transcript}`);
  return parts.join("\n\n");
}
