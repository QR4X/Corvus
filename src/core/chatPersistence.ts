import type { App, DataAdapter } from "obsidian";
import type { AIToolStep } from "../agent/types";
import type { MessageAttachment } from "../providers/base";
import { previewFromMarkdown } from "./chatPreview";
import { texto } from "./text";
import { tr } from "../i18n/tr";

export interface MessageAttachmentStored {
  type: "image" | "note" | "pdf" | "audio";

  path?: string;
  name?: string;
  mimeType?: string;
  durationMs?: number;
}

export interface ChatMessageStored {
  type: "user" | "ai-response";
  content: string;
  timestamp: number;

  reaction?: "like" | "dislike" | null;

  agentSteps?: AIToolStep[];

  attachments?: MessageAttachmentStored[];
  isError?: boolean;
}

function stepLabel(step: AIToolStep): string {
  const a = step.arguments ?? {};
  const key = (a.path ?? a.from ?? a.folder ?? a.query) as string | undefined;
  return key ? `${step.name} ${key}` : step.name;
}

export interface ChatData {
  id: string;
  title: string;
  date: string; 
  mode: string;
  provider: string;
  model: string;
  effort: string;
  tokensIn: number;
  tokensOut: number;

  persona?: string;

  instructions?: string;

  starred?: boolean;

  vault?: boolean;
  messages: ChatMessageStored[];
}

function yamlBool(v: unknown): boolean {
  return v === true || v === "true";
}

export function toStoredAttachments(
  atts: MessageAttachment[]
): MessageAttachmentStored[] {
  return atts.map((a) => {
    if (a.type === "image") {
      return {
        type: "image",
        path: a.path ?? (a.dataUrl.startsWith("http") ? a.dataUrl : undefined),
        name: a.name,
        mimeType: a.mimeType,
      };
    }
    if (a.type === "note") return { type: "note", path: a.path };
    if (a.type === "pdf") return { type: "pdf", name: a.name, path: a.path };
    return { type: "audio", path: a.path, durationMs: a.durationMs };
  });
}

function base64FromBytes(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export async function fromStoredAttachments(
  app: App,
  stored: MessageAttachmentStored[]
): Promise<MessageAttachment[]> {
  const out: MessageAttachment[] = [];
  for (const s of stored) {
    if (s.type === "image") {
      const p = s.path ?? "";
      if (/^https?:/i.test(p)) {
        out.push({ type: "image", dataUrl: p, name: s.name, mimeType: s.mimeType });
        continue;
      }
      try {
        const bin = await app.vault.adapter.readBinary(p);
        const mime = s.mimeType ?? "image/png";
        out.push({
          type: "image",
          dataUrl: `data:${mime};base64,${base64FromBytes(bin)}`,
          mimeType: mime,
          name: s.name,
          path: p,
        });
      } catch {
        out.push({ type: "image", dataUrl: "", name: s.name, mimeType: s.mimeType, path: p });
      }
      continue;
    }
    if (s.type === "note") {
      out.push({ type: "note", path: s.path ?? "", content: "" });
      continue;
    }
    if (s.type === "pdf") {
      out.push({ type: "pdf", name: s.name ?? "", path: s.path });
      continue;
    }
    out.push({ type: "audio", path: s.path ?? "", durationMs: s.durationMs });
  }
  return out;
}

export interface ChatSummary {
  id: string;
  title: string;
  date: string;

  mode: string;
  provider: string;
  model: string;
  effort: string;
  tokensIn: number;
  tokensOut: number;
  messageCount: number;

  toolCount: number;
  filePath: string;

  starred: boolean;

  preview: string;
}

const TAG_LIST = ["corvus-chat"];

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

function modeFolder(chatsPath: string, mode: string): string {
  return `${chatsPath}/${mode}`;
}

function chatFilePath(chatsPath: string, mode: string, chatId: string): string {
  return `${modeFolder(chatsPath, mode)}/${chatId}.md`;
}

export function generateTitle(firstUserMessage: string): string {
  const cleaned = firstUserMessage.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 60) return cleaned;
  return cleaned.slice(0, 60).trim() + "…";
}

function yamlString(s: string): string {

  return JSON.stringify(s);
}

function b64encode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function b64decode(s: string): string {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function renderFrontmatter(chat: ChatData): string {
  const tags = TAG_LIST.concat([`corvus-mode-${chat.mode}`])
    .map((t) => `  - ${t}`)
    .join("\n");

  const allSteps = chat.messages.flatMap((m) => m.agentSteps ?? []);
  const toolsBlock =
    allSteps.length > 0
      ? `tools_used:\n${allSteps
          .map((s) => `  - ${yamlString(stepLabel(s))}`)
          .join("\n")}\n`
      : "";
  return `---
id: ${yamlString(chat.id)}
title: ${yamlString(chat.title)}
date: ${yamlString(chat.date)}
mode: ${yamlString(chat.mode)}
provider: ${yamlString(chat.provider)}
model: ${yamlString(chat.model)}
effort: ${yamlString(chat.effort)}
${chat.persona ? `persona: ${yamlString(chat.persona)}\n` : ""}${chat.instructions ? `instructions: ${yamlString(chat.instructions)}\n` : ""}${chat.starred ? "starred: true\n" : ""}${chat.vault === undefined ? "" : `vault: ${chat.vault}\n`}tokens_in: ${chat.tokensIn}
tokens_out: ${chat.tokensOut}
message_count: ${chat.messages.length}
${toolsBlock}tags:
${tags}
---`;
}

function renderBody(chat: ChatData): string {
  const heading = `# ${chat.title}\n`;
  const sections = chat.messages
    .map((m) => {
      const label = m.type === "user" ? "You" : "Assistant";

      const meta: string[] = [];
      if (m.timestamp) meta.push(`ts=${m.timestamp}`);
      if (m.reaction) meta.push(`reaction=${m.reaction}`);
      if (m.isError) meta.push("error=true");
      const metaLine = meta.length > 0 ? `<!-- corvus: ${meta.join(" ")} -->\n` : "";

      const stepsLine =
        m.agentSteps && m.agentSteps.length > 0
          ? `\n\n<!-- corvus-steps: ${b64encode(JSON.stringify(m.agentSteps))} -->`
          : "";

      const attsLine =
        m.attachments && m.attachments.length > 0
          ? `\n\n<!-- corvus-att: ${b64encode(JSON.stringify(m.attachments))} -->`
          : "";
      return `## ${label}\n\n${metaLine}${m.content.trim()}${stepsLine}${attsLine}\n`;
    })
    .join("\n");
  return `${heading}\n${sections}`;
}

function parseMessageMeta(content: string): {
  cleanContent: string;
  timestamp?: number;
  reaction?: "like" | "dislike" | null;
  isError?: boolean;
} {
  const match = content.match(/^\s*<!--\s*(?:corvus|axxa):\s*([^>]+?)\s*-->\s*\n?/);
  if (!match) return { cleanContent: content };
  const meta = match[1];
  const cleanContent = content.slice(match[0].length);
  let timestamp: number | undefined;
  let reaction: "like" | "dislike" | null | undefined;
  let isError: boolean | undefined;
  for (const part of meta.split(/\s+/)) {
    const [k, v] = part.split("=");
    if (k === "ts" && v) timestamp = parseInt(v, 10);
    else if (k === "error" && v === "true") isError = true;
    else if (k === "reaction" && (v === "like" || v === "dislike")) {
      reaction = v;
    }
  }
  return { cleanContent, timestamp, reaction, isError };
}

export function renderChatMarkdown(chat: ChatData): string {
  return `${renderFrontmatter(chat)}\n\n${renderBody(chat)}`;
}

const NUMERIC_KEYS = new Set(["tokens_in", "tokens_out", "message_count"]);

function parseSimpleYaml(text: string): Record<string, string | number | string[]> {
  const result: Record<string, string | number | string[]> = {};
  const lines = text.split("\n");
  let currentArrayKey: string | null = null;
  let currentArray: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine;

    const arrayItemMatch = line.match(/^\s*-\s+(.+)$/);
    if (currentArrayKey && arrayItemMatch) {
      let value = arrayItemMatch[1].trim();
      if (value.startsWith('"') && value.endsWith('"')) {
        try {
          value = JSON.parse(value) as string;
        } catch { void 0; }
      }
      currentArray.push(value);
      continue;
    }

    if (currentArrayKey && !arrayItemMatch) {
      result[currentArrayKey] = currentArray;
      currentArrayKey = null;
      currentArray = [];
    }

    const kvMatch = line.match(/^([\w_-]+):\s*(.*)$/);
    if (!kvMatch) continue;
    const key = kvMatch[1];
    const rawValue = kvMatch[2].trim();
    if (!rawValue) {

      currentArrayKey = key;
      currentArray = [];
      continue;
    }
    let value: string | number = rawValue;
    if (value.startsWith('"') && value.endsWith('"')) {
      try {
        value = JSON.parse(value) as string;
      } catch { void 0; }
    } else if (NUMERIC_KEYS.has(key) && /^-?\d+(\.\d+)?$/.test(value)) {

      value = Number(value);
    }
    result[key] = value;
  }

  if (currentArrayKey) {
    result[currentArrayKey] = currentArray;
  }
  return result;
}

function extractAgentSteps(content: string): {
  content: string;
  agentSteps?: AIToolStep[];
} {

  const re = /\n*<!--\s*(?:corvus|axxa)-steps:\s*([A-Za-z0-9+/=]+)\s*-->/;
  const m = content.match(re);
  if (!m || m.index === undefined) return { content };
  try {
    const steps = JSON.parse(b64decode(m[1])) as AIToolStep[];
    const cleaned = (content.slice(0, m.index) + content.slice(m.index + m[0].length)).trim();
    return { content: cleaned, agentSteps: steps };
  } catch {
    return { content };
  }
}

function extractAttachments(content: string): {
  content: string;
  attachments?: MessageAttachmentStored[];
} {
  const re = /\n*<!--\s*(?:corvus|axxa)-att:\s*([A-Za-z0-9+/=]+)\s*-->/;
  const m = content.match(re);
  if (!m || m.index === undefined) return { content };
  try {
    const atts = JSON.parse(b64decode(m[1])) as MessageAttachmentStored[];
    const cleaned = (content.slice(0, m.index) + content.slice(m.index + m[0].length)).trim();
    return { content: cleaned, attachments: atts };
  } catch {
    return { content };
  }
}

function parseBody(body: string): ChatMessageStored[] {

  const messages: ChatMessageStored[] = [];
  const sectionRegex = /^## (You|Assistant)\s*$/gm;
  let match: RegExpExecArray | null;

  const starts: {
    type: "user" | "ai-response";
    headingStart: number;
    contentStart: number;
  }[] = [];
  while ((match = sectionRegex.exec(body)) !== null) {
    const type = match[1] === "You" ? "user" : "ai-response";
    starts.push({
      type,
      headingStart: match.index,
      contentStart: match.index + match[0].length,
    });
  }
  for (let i = 0; i < starts.length; i++) {
    const cur = starts[i];
    const next = starts[i + 1];
    const rawContent = body.slice(
      cur.contentStart,
      next ? next.headingStart : body.length
    );

    const { cleanContent, timestamp, reaction, isError } = parseMessageMeta(rawContent.trim());

    const { content: finalContent, agentSteps } = extractAgentSteps(
      cleanContent.trim()
    );

    const { content: finalContent2, attachments } = extractAttachments(
      finalContent.trim()
    );
    messages.push({
      type: cur.type,
      content: finalContent2,

      timestamp: timestamp ?? Date.now(),
      ...(reaction != null ? { reaction } : {}),
      ...(agentSteps ? { agentSteps } : {}),
      ...(attachments && attachments.length > 0 ? { attachments } : {}),
      ...(isError ? { isError } : {}),
    });
  }
  return messages;
}

export function parseChatMarkdown(content: string): ChatData {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    throw new Error(tr("Invalid frontmatter — no `---` delimiters found."));
  }
  const fm = parseSimpleYaml(match[1]);
  const messages = parseBody(match[2]);
  return {
    id: texto(fm.id),
    title: texto(fm.title, "Untitled"),
    date: String(fm.date ?? new Date().toISOString()),
    mode: String(fm.mode ?? "chat"),
    provider: String(fm.provider ?? "openai"),
    model: texto(fm.model),
    effort: String(fm.effort ?? "med"),
    persona: fm.persona ? String(fm.persona) : undefined,
    instructions: fm.instructions ? String(fm.instructions) : undefined,

    starred: yamlBool(fm.starred) ? true : undefined,

    vault: fm.vault === undefined ? undefined : yamlBool(fm.vault),
    tokensIn: Number(fm.tokens_in ?? 0),
    tokensOut: Number(fm.tokens_out ?? 0),
    messages,
  };
}

export async function saveChat(
  app: App,
  chatsPath: string,
  chat: ChatData
): Promise<string> {
  const folder = modeFolder(chatsPath, chat.mode);
  await ensureFolder(app.vault.adapter, folder);
  const path = chatFilePath(chatsPath, chat.mode, chat.id);
  await app.vault.adapter.write(path, renderChatMarkdown(chat));
  return path;
}

export async function loadChat(
  app: App,
  chatsPath: string,
  mode: string,
  chatId: string
): Promise<ChatData> {
  const path = chatFilePath(chatsPath, mode, chatId);
  const content = await app.vault.adapter.read(path);
  return parseChatMarkdown(content);
}

export function summaryFromFrontmatter(
  fm: Record<string, unknown>,
  fallbackMode: string,
  filePath: string,
  preview: string = ""
): ChatSummary {
  return {
    id: texto(fm.id),
    title: texto(fm.title, "Untitled"),
    date: texto(fm.date),
    mode: texto(fm.mode, fallbackMode),
    provider: texto(fm.provider),
    model: texto(fm.model),
    effort: texto(fm.effort),
    tokensIn: Number(fm.tokens_in ?? 0),
    tokensOut: Number(fm.tokens_out ?? 0),
    messageCount: Number(fm.message_count ?? 0),
    toolCount: Array.isArray(fm.tools_used) ? fm.tools_used.length : 0,
    filePath,
    starred: yamlBool(fm.starred),
    preview,
  };
}

export async function listChats(
  app: App,
  chatsPath: string,
  mode: string,
  limit: number = 10
): Promise<ChatSummary[]> {
  const folder = modeFolder(chatsPath, mode);
  if (!(await app.vault.adapter.exists(folder))) return [];
  const listing = await app.vault.adapter.list(folder);
  const summaries: ChatSummary[] = [];
  for (const file of listing.files) {
    if (!file.endsWith(".md")) continue;

    const cached = app.metadataCache.getCache(file)?.frontmatter;
    if (cached && cached.id) {
      summaries.push(summaryFromFrontmatter(cached, mode, file));
      continue;
    }
    try {
      const content = await app.vault.adapter.read(file);
      const match = content.match(/^---\n([\s\S]*?)\n---/);
      if (!match) continue;

      summaries.push(
        summaryFromFrontmatter(
          parseSimpleYaml(match[1]),
          mode,
          file,
          previewFromMarkdown(content)
        )
      );
    } catch { void 0; }
  }
  return summaries
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}

export async function listAllChats(
  app: App,
  chatsPath: string,
  limit: number = 1000
): Promise<ChatSummary[]> {
  if (!(await app.vault.adapter.exists(chatsPath))) return [];

  const root = await app.vault.adapter.list(chatsPath);

  const perMode = await Promise.all(
    root.folders.map((subfolder) => {

      const mode = subfolder.split("/").pop() ?? "chat";
      return listChats(app, chatsPath, mode, 10_000);
    })
  );
  const all: ChatSummary[] = perMode.flat();
  return all
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}

export async function deleteChat(
  app: App,
  chatsPath: string,
  mode: string,
  chatId: string
): Promise<void> {
  const path = chatFilePath(chatsPath, mode, chatId);
  const file = app.vault.getAbstractFileByPath(path);
  if (file) {

    await app.fileManager.trashFile(file);
    return;
  }
  if (!(await app.vault.adapter.exists(path))) return;

  const ad = app.vault.adapter;
  try {
    if (await ad.trashSystem(path)) return;
  } catch { void 0; }
  try {
    await ad.trashLocal(path);
    return;
  } catch { void 0; }
  await ad.remove(path);
}

export async function renameChat(
  app: App,
  chatsPath: string,
  mode: string,
  chatId: string,
  newTitle: string
): Promise<void> {
  const clean = newTitle.trim();
  if (!clean) throw new Error(tr("Title is empty."));
  const path = chatFilePath(chatsPath, mode, chatId);
  const content = await app.vault.adapter.read(path);
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(tr("Invalid frontmatter in this chat file."));

  const updatedFm = match[1].replace(
    /^title:\s*.*$/m,
    `title: ${yamlString(clean)}`
  );

  let body = match[2];
  body = body.replace(/^# .+(?=\n|$)/, () => `# ${clean}`);
  const updated = `---\n${updatedFm}\n---\n${body}`;
  await app.vault.adapter.write(path, updated);
}

export async function setChatInstructions(
  app: App,
  chatsPath: string,
  mode: string,
  chatId: string,
  instructions: string
): Promise<void> {
  const path = chatFilePath(chatsPath, mode, chatId);
  const content = await app.vault.adapter.read(path);
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(tr("Invalid frontmatter in this chat file."));
  let fm = match[1].replace(/^instructions:\s*.*$\n?/m, "");
  const texto = instructions.trim();
  if (texto) {
    const linha = `instructions: ${yamlString(texto)}`;

    fm = /^tokens_in:/m.test(fm)
      ? fm.replace(/^tokens_in:/m, () => `${linha}\ntokens_in:`)
      : `${fm.replace(/\n+$/, "")}\n${linha}`;
  }
  await app.vault.adapter.write(path, `---\n${fm}\n---\n${match[2]}`);
}

export async function setChatStarred(
  app: App,
  chatsPath: string,
  mode: string,
  chatId: string,
  starred: boolean
): Promise<void> {
  const path = chatFilePath(chatsPath, mode, chatId);
  const content = await app.vault.adapter.read(path);
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(tr("Invalid frontmatter in this chat file."));
  let fm = match[1].replace(/^starred:\s*.*$\n?/m, "");
  if (starred) {

    fm = /^tokens_in:/m.test(fm)
      ? fm.replace(/^tokens_in:/m, "starred: true\ntokens_in:")
      : `${fm.replace(/\n+$/, "")}\nstarred: true`;
  }
  await app.vault.adapter.write(path, `---\n${fm}\n---\n${match[2]}`);
}
