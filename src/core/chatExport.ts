// src/core/chatExport.ts
// EXPORTAR uma conversa: tirar uma cópia legível dela pra dentro do vault.
//
// Isto existe por causa de onde as conversas moram. Elas ficam em `.corvus/chats`
// — pasta com ponto, que o Obsidian ignora de propósito (ver core/vaultPaths):
// não entra no índice, na busca, no grafo, nem abre com um clique. É o certo
// pro dado do app, e é exatamente por isso que "abrir a nota da conversa" não
// existe neste menu: não haveria nota pra abrir.
//
// Então exportar não é duplicar por duplicar: é a ÚNICA porta entre o que você
// conversou e o seu vault. A cópia é uma nota comum, numa pasta visível, que
// se linka, se busca e se edita como qualquer outra.
//
// O que sai no caminho: os comentários HTML que o app usa pra remontar a
// conversa (timestamps, reações e os passos do agente em base64). Eles são
// invisíveis no preview, mas não no editor — e uma nota que abre com um
// paredão de base64 não é uma nota, é um despejo.

import type { App } from "obsidian";
import type { ChatData } from "./chatPersistence";
import { ensureFolder } from "./chatPersistence";

/** Pasta das cópias. Visível, ao lado dos relatórios. */
export const EXPORTS_FOLDER = "corvus-ai/exports";

/** Tira do markdown o que era recado do app pro app. */
export function limparMarcas(texto: string): string {
  return texto
    .replace(/<!--\s*corvus-steps:[\s\S]*?-->/g, "")
    .replace(/<!--\s*corvus:[^>]*-->\n?/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Nome de arquivo a partir do título — o que o Obsidian não aceita, sai. */
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

/**
 * A nota exportada: frontmatter curto + a conversa em seções.
 *
 * O frontmatter é o mínimo que faz a cópia ser útil DEPOIS — de onde ela veio,
 * quando, com qual modelo. Sem ele, daqui a três meses é um texto órfão.
 */
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

/** Grava a cópia e devolve o caminho. Não toca no arquivo original. */
export async function exportChatToVault(
  app: App,
  chat: ChatData,
  quando: Date = new Date()
): Promise<string> {
  await ensureFolder(app.vault.adapter, EXPORTS_FOLDER);
  let caminho = `${EXPORTS_FOLDER}/${exportFileName(chat.title, quando)}`;
  // Dois exports da mesma conversa no mesmo dia não se sobrescrevem: a
  // segunda cópia pode ter mais conversa que a primeira.
  // Teto de tentativas: `exists` é uma resposta de fora, e um laço que só sai
  // quando ela disser "não" fica à mercê dela. Um adapter que responde `true`
  // sempre (o do preview respondia) travava o app inteiro — e num aparelho
  // isso é o app morto sem mensagem nenhuma.
  for (let n = 2; n <= 50 && (await app.vault.adapter.exists(caminho)); n++) {
    caminho = `${EXPORTS_FOLDER}/${exportFileName(
      `${chat.title} ${n}`,
      quando
    )}`;
  }
  await app.vault.adapter.write(caminho, exportChatMarkdown(chat, quando));
  return caminho;
}
