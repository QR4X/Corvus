import type { App } from "obsidian";
import type { ChatData } from "./chatPersistence";
import { ensureFolder } from "./vaultFs";
import { EXPORTS_FOLDER } from "./vaultPaths";


export function stripMarkers(text: string): string {
  return text
    .replace(/<!--\s*corvus-steps:[\s\S]*?-->/g, "")
    .replace(/<!--\s*corvus:[^>]*-->\n?/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function exportFileName(title: string, when: Date): string {
  const base =
    title
      .replace(/[\\/:*?"<>|#^[\]]/g, "-")
      .replace(/\s+/g, " ")
      .replace(/^[.\s]+|[.\s]+$/g, "")
      .trim()
      .slice(0, 60) || "chat";
  const day = when.toISOString().slice(0, 10);
  return `${base} (${day}).md`;
}

export function exportChatMarkdown(chat: ChatData, when: Date): string {
  const fm = [
    "---",
    `title: ${JSON.stringify(chat.title || "Untitled")}`,
    `date: ${JSON.stringify(chat.date)}`,
    `exported: ${JSON.stringify(when.toISOString())}`,
    `model: ${JSON.stringify(chat.model)}`,
    `provider: ${JSON.stringify(chat.provider)}`,
    `mode: ${JSON.stringify(chat.mode)}`,
    "source: Corvus",
    "---",
  ].join("\n");

  const body = chat.messages
    .map((m) => {
      const speaker = m.type === "user" ? "You" : "Assistant";
      return `## ${speaker}\n\n${stripMarkers(m.content)}`;
    })
    .join("\n\n");

  return `${fm}\n\n# ${chat.title || "Untitled"}\n\n${body}\n`;
}

export async function exportChatToVault(
  app: App,
  chat: ChatData,
  when: Date = new Date()
): Promise<string> {
  await ensureFolder(app.vault.adapter, EXPORTS_FOLDER);
  let path = `${EXPORTS_FOLDER}/${exportFileName(chat.title, when)}`;

  for (let n = 2; n <= 50 && (await app.vault.adapter.exists(path)); n++) {
    path = `${EXPORTS_FOLDER}/${exportFileName(
      `${chat.title} ${n}`,
      when
    )}`;
  }
  await app.vault.adapter.write(path, exportChatMarkdown(chat, when));
  return path;
}
