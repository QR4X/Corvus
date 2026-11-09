import type { App } from "obsidian";
import type { ChatData } from "./chatPersistence";
import { ensureFolder } from "./chatPersistence";

export const EXPORTS_FOLDER = "corvus-ai/exports";

export function limparMarcas(texto: string): string {
  return texto
    .replace(/<!--\s*corvus-steps:[\s\S]*?-->/g, "")
    .replace(/<!--\s*corvus:[^>]*-->\n?/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function exportFileName(titulo: string, quando: Date): string {
  const base =
    titulo
      .replace(/[\\/:*?"<>|#^[\]]/g, "-")
      .replace(/\s+/g, " ")
      .replace(/^[.\s]+|[.\s]+$/g, "")
      .trim()
      .slice(0, 60) || "chat";
  const dia = quando.toISOString().slice(0, 10);
  return `${base} (${dia}).md`;
}

export function exportChatMarkdown(chat: ChatData, quando: Date): string {
  const fm = [
    "---",
    `title: ${JSON.stringify(chat.title || "Untitled")}`,
    `date: ${JSON.stringify(chat.date)}`,
    `exported: ${JSON.stringify(quando.toISOString())}`,
    `model: ${JSON.stringify(chat.model)}`,
    `provider: ${JSON.stringify(chat.provider)}`,
    `mode: ${JSON.stringify(chat.mode)}`,
    "source: Corvus",
    "---",
  ].join("\n");

  const corpo = chat.messages
    .map((m) => {
      const quem = m.type === "user" ? "You" : "Assistant";
      return `## ${quem}\n\n${limparMarcas(m.content)}`;
    })
    .join("\n\n");

  return `${fm}\n\n# ${chat.title || "Untitled"}\n\n${corpo}\n`;
}

export async function exportChatToVault(
  app: App,
  chat: ChatData,
  quando: Date = new Date()
): Promise<string> {
  await ensureFolder(app.vault.adapter, EXPORTS_FOLDER);
  let caminho = `${EXPORTS_FOLDER}/${exportFileName(chat.title, quando)}`;

  for (let n = 2; n <= 50 && (await app.vault.adapter.exists(caminho)); n++) {
    caminho = `${EXPORTS_FOLDER}/${exportFileName(
      `${chat.title} ${n}`,
      quando
    )}`;
  }
  await app.vault.adapter.write(caminho, exportChatMarkdown(chat, quando));
  return caminho;
}
