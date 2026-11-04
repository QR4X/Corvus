// src/agent/tools.ts
// Implementações das ferramentas — o que o agente pode fazer no vault.
//
// Convenção: cada tool é (ctx, args) → Promise<string>. String volta como
// content do ToolResult. Em caso de erro, joga Error — o caller marca isError.
//
// Paths são SEMPRE relativos à raiz do vault. Tools normalizam (/, \, ..)
// e bloqueiam paths que tentam sair do vault (anti path-traversal).
//
// TUDO AQUI PASSA PELA API DE VAULT, nunca pelo `adapter`. A diferença não é
// de estilo:
//   · apagar pelo adapter é apagar PRA SEMPRE — passa por cima da preferência
//     "Deleted files" de quem usa (lixeira do Obsidian, do sistema, ou nada) e
//     não tem desfazer. Uma IA apagando nota sem volta é o pior defeito que
//     este plugin poderia ter. `fileManager.trashFile` respeita a escolha;
//   · mover pelo adapter move o ARQUIVO e mais nada: todo [[link]] que
//     apontava pra ele apodrece em silêncio. `fileManager.renameFile` reescreve
//     os links — é ele que faz "organize minhas notas" não destruir o vault;
//   · escrever pelo adapter não avisa ninguém: o metadataCache não atualiza na
//     hora e nenhum outro plugin fica sabendo.
//
// O adapter continua certo pro storage do app (pasta oculta OU a configurada
// em chatsPath) — é lá que a API de Vault não enxerga —, mas isso é em
// chatPersistence, não aqui.

import { TFile, TFolder, type App, type TAbstractFile } from "obsidian";
import type { ToolContext } from "./types";
import { hybridSearch } from "../rag/hybrid";
import { toolWebFetch, toolWebSearch } from "./web";
import { transcribeInstagramReel } from "../core/instagramResolver";

const VAULT_ROOT_MAX_DEPTH = 32; // sanity check: ninguém precisa de 100 níveis

// ============================================================
// Helpers — path safety
// ============================================================

/** Erro transitório (vale retry): rede/timeout/lock. Path/arg errado NÃO é. */
export function isTransientError(message: string): boolean {
  const m = (message || "").toLowerCase();
  return (
    m.includes("network") ||
    m.includes("timeout") ||
    m.includes("locked") ||
    m.includes("busy")
  );
}

/**
 * Normaliza separadores e recusa o que o agente não pode tocar.
 *
 * Esta função é a fronteira de quem decidiu o caminho. Do lado de cá está a
 * IA: o caminho que chega aqui foi escolhido por um modelo que acabou de LER
 * notas — e nota é dado de fora, que pode conter instrução plantada. Do lado
 * de lá está o plugin escrevendo o próprio storage (chatPersistence, índice
 * RAG), que passa direto pelo adapter e não vê esta função. São dois
 * caminhos diferentes de propósito.
 *
 * Por isso PASTA QUE COMEÇA COM PONTO é recusada aqui, e só aqui:
 *
 *   · `.obsidian/` é o pior caso e não era barrado. O sandbox só olhava
 *     `..`, `.` e `:`, então `.obsidian/plugins/x/main.js` passava limpo. Pior:
 *     `vault_create` exige que o alvo NÃO exista, e como o Obsidian não indexa
 *     a pasta de configuração, `getAbstractFileByPath` devolve null ali — a
 *     guarda era satisfeita em vez de acionada. Nos níveis `vault` e `yolo`
 *     essa tool auto-aprova, sem modal. Fim da linha: instrução plantada numa
 *     nota vira arquivo de plugin, e arquivo de plugin vira código rodando no
 *     próximo restart;
 *   · `.axxa/` é NOSSO storage — o agente também não escreve nele. Deixar
 *     seria abrir pra injeção reescrever o histórico de conversa ou corromper
 *     o índice. Quem escreve lá é o plugin, por outro caminho;
 *   · `.git/`, `.trash/` e o que mais comece com ponto entram junto pela
 *     mesma razão: nada disso é nota de quem usa.
 *
 * E o `appDataPaths` cobre o complemento da regra do ponto: desde que o
 * default das conversas virou uma pasta VISÍVEL (`axxa/chats`, pra sync de
 * arquivos copiar entre aparelhos), o storage do app não é mais sempre oculto.
 * Quem não quer que o agente reescreva o histórico de conversa passa aqui as
 * pastas configuradas (chatsPath, ragIndexPath) — mesmo sem ponto na frente.
 */
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
  // v0.1.228: checa SEGMENTO === ".." (não substring) — assim um nome de
  // arquivo legítimo com ".." embutido (ex: "relatorio..final.md") passa, mas
  // o traversal real (segmento ".." ou ".") continua bloqueado.
  const segs = normalized.split("/");
  if (segs.some((s) => s === ".." || s === ".")) {
    throw new Error("Paths containing '..' are not allowed.");
  }
  if (normalized.includes(":")) {
    throw new Error("Paths containing ':' are not allowed (no drive letters).");
  }
  // Qualquer SEGMENTO oculto, não só o primeiro: `notes/.obsidian/x` e
  // `a/.git/config` são a mesma tentativa, uma pasta mais fundo.
  const oculto = segs.find((s) => s.startsWith("."));
  if (oculto) {
    throw new Error(
      `Hidden folders are off limits to the agent: "${oculto}". ` +
        `They hold app config and plugin data, not your notes.`
    );
  }
  // Storage VISÍVEL do app (ex: axxa/chats — o default atual) e qualquer
  // outra pasta configurada: conferida por PREFIXO realmente configurado, não
  // por literal. `alvo` vazio ou "." nunca cai aqui (o ".."/"." já morreu
  // acima), então `pasta.replace(/\/+$/, "")` bastaria; o guarda-raio abaixo
  // impede que um appDataPath vazio vire "bloqueia tudo".
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

/**
 * O que existe nesse caminho, do ponto de vista do Obsidian.
 *
 * `null` quer dizer "não existe PRA ELE" — e é isso que interessa: uma nota
 * que o Obsidian não indexou (dentro de pasta oculta, por exemplo) não é
 * assunto do agente, que trabalha nas notas de quem o chamou.
 */
function achar(app: App, path: string): TAbstractFile | null {
  return app.vault.getAbstractFileByPath(path);
}

/** O arquivo nesse caminho, ou um erro que diz o que deu errado. */
function acharArquivo(app: App, path: string): TFile {
  const alvo = achar(app, path);
  if (!alvo) throw new Error(`File does not exist: ${path}`);
  if (!(alvo instanceof TFile)) throw new Error(`${path} is not a file.`);
  return alvo;
}

/** Garante a pasta do caminho, criando os níveis que faltam. */
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

// ============================================================
// Tool: vault_list
// ============================================================

interface ListArgs {
  folder?: string;
}

export async function toolVaultList(ctx: ToolContext, args: ListArgs): Promise<string> {
  const folder = args.folder ? normalizePath(args.folder, ctx.appDataPaths) : "";
  // A raiz do vault é uma TFolder como qualquer outra.
  const alvo = folder ? achar(ctx.app, folder) : ctx.app.vault.getRoot();
  if (!alvo) {
    return `Folder does not exist: ${folder}`;
  }
  if (!(alvo instanceof TFolder)) {
    return `${folder} is not a folder.`;
  }
  // Pelos FILHOS da pasta, e não pelo adapter: assim o agente vê o vault como
  // quem usa vê. O adapter devolveria `.obsidian`, `.trash` e a pasta oculta
  // do próprio app junto — lixo que ele não tem o que fazer com.
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

// ============================================================
// Tool: vault_read
// ============================================================

interface ReadArgs {
  path: string;
}

// v0.1.228: medida em CHARS (UTF-16 .length), não bytes — nome honesto.
const MAX_READ_CHARS = 200_000; // ~200K chars cap pra não estourar context

export async function toolVaultRead(ctx: ToolContext, args: ReadArgs): Promise<string> {
  const path = normalizePath(args.path, ctx.appDataPaths);
  const file = acharArquivo(ctx.app, path);
  // `read`, não `cachedRead`: o agente costuma ler PRA EDITAR logo em
  // seguida, e o cache pode estar um passo atrás do disco.
  const content = await ctx.app.vault.read(file);
  if (content.length > MAX_READ_CHARS) {
    // v0.1.228: evita cortar no meio de um surrogate pair (emoji etc.) —
    // se o char no limite é high-surrogate, recua 1 pra não quebrar o grafema.
    let cut = MAX_READ_CHARS;
    const code = content.charCodeAt(cut - 1);
    if (code >= 0xd800 && code <= 0xdbff) cut -= 1;
    return `(file truncated at ${cut} chars — original had ${content.length})\n\n${content.slice(0, cut)}`;
  }
  return content;
}

// ============================================================
// Tool: vault_create
// ============================================================

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

// ============================================================
// Tool: vault_edit (find/replace)
// ============================================================

interface EditArgs {
  path: string;
  /** String LITERAL a ser encontrada (case-sensitive, sem regex). */
  oldStr: string;
  /** String que substitui. */
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
  // split/join (NÃO .replace): replace interpreta $&, $1, $$ no newStr e
  // corromperia trechos com '$' (regex, TeX, preços) silenciosamente. Como já
  // garantimos occurrences===1, split/join troca exatamente a única ocorrência.
  // `process` lê e escreve num passo só, então uma alteração feita entre a
  // leitura de cima e a escrita não é atropelada em silêncio.
  await ctx.app.vault.process(file, (atual) =>
    atual.split(args.oldStr).join(args.newStr)
  );
  const delta = args.newStr.length - args.oldStr.length;
  const sign = delta >= 0 ? "+" : "";
  return `Edited ${path} (${sign}${delta} chars)`;
}

// ============================================================
// Tool: vault_move (rename ou mover)
// ============================================================

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
  // `fileManager.renameFile`, e NÃO `adapter.rename`: é ele que reescreve
  // todo [[link]] que apontava pro caminho antigo. Com o adapter, o arquivo
  // chegava no lugar novo e o vault inteiro ficava cheio de link quebrado —
  // sem aviso, e justamente na ferramenta que existe pra organizar notas.
  await ctx.app.fileManager.renameFile(alvo, to);
  return `Moved: ${from} → ${to} (links updated)`;
}

// ============================================================
// Tool: vault_delete
// ============================================================

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
  // `fileManager.trashFile`, e NÃO `adapter.remove`: ele obedece a preferência
  // "Deleted files" de quem usa — lixeira do Obsidian, lixeira do sistema, ou
  // apagar de vez, como a pessoa escolheu. Com o adapter era sempre a terceira,
  // sem desfazer e sem ela ter pedido isso.
  await ctx.app.fileManager.trashFile(alvo);
  const oQue = alvo instanceof TFolder ? "Empty folder" : "File";
  return `${oQue} moved to trash: ${path}`;
}

// ============================================================
// Tool: vault_create_folder
// ============================================================

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

// ============================================================
// Tool: vault_search (busca semântica RAG + fallback keyword)
// ============================================================

interface SearchArgs {
  query: string;
  topK?: number;
}

/**
 * Busca HÍBRIDA por relevância nas notas: funde semântico (embeddings/cosine)
 * com keyword via RRF e re-rankeia pelo grafo de links. Funciona com ou sem
 * índice (sem índice = só keyword). Dá ao agent "memória" do vault — encontrar
 * notas relevantes em 1 call, sem listar pastas e ler arquivo por arquivo.
 */
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

// ============================================================
// Registry — executor central
// ============================================================

/** Mapa nome → função executor. AxxaApp/agent loop usa pra despachar.
 *  Recebe ToolContext (app + RAG + creds) — tools simples usam só ctx.app. */
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
