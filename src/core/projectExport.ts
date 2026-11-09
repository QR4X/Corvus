// src/core/projectExport.ts
// EXPORTAR um projeto: a cópia legível dele dentro do vault.
//
// O que um projeto é, neste app: um nome com identidade, um punhado de notas
// do vault como fonte, um texto de instruções, e as conversas que nasceram
// dentro dele. Só a primeira dessas coisas mora no vault — as outras três
// vivem nas settings do plugin, que é um JSON que ninguém abre, não entra na
// busca e não aparece no grafo.
//
// Então exportar aqui é o mesmo verbo que em chatExport: a única porta entre o
// que se organizou no app e o vault. A diferença é o que atravessa. Uma
// conversa vira o texto dela; um projeto vira um ÍNDICE — as instruções por
// extenso, as fontes como links de verdade (o grafo passa a mostrar o projeto
// ligado às notas dele) e a lista das conversas.
//
// As conversas NÃO vão junto no mesmo arquivo. Uma delas já é uma nota
// inteira; dez viram um despejo onde o índice se perde. Cada uma se exporta
// pelo ⋯ dela, e aqui ficam listadas com data e modelo — que é o que faz
// saber qual procurar.

import type { App } from "obsidian";
import type { ChatSummary } from "./chatPersistence";
import { ensureFolder } from "./chatPersistence";
import type { Project } from "../projects";
import { EXPORTS_FOLDER, exportFileName } from "./chatExport";

/**
 * Caminho do vault → wikilink.
 *
 * Sem o `.md`: `[[pasta/nota.md]]` é um link que o Obsidian resolve, mas que
 * aparece escrito com a extensão em todo lugar que o mostra. E o link tem que
 * ser o caminho INTEIRO, não o nome: duas notas chamadas "Index" em pastas
 * diferentes são o caso normal num vault, e o nome sozinho manda pra errada.
 */
export function noteLink(path: string): string {
  return `[[${path.replace(/\.md$/i, "")}]]`;
}

/** Uma conversa na lista do índice: o que basta pra achar qual é. */
function linhaChat(c: ChatSummary): string {
  const dia = (c.date || "").slice(0, 10);
  const partes = [dia, c.model].filter(Boolean).join(" · ");
  const titulo = c.title.trim() || "Untitled";
  return partes ? `- ${titulo} — ${partes}` : `- ${titulo}`;
}

/**
 * O índice do projeto: frontmatter + instruções + fontes + conversas.
 *
 * As seções vazias não entram. Um projeto sem instruções não ganha um título
 * "Custom instructions" seguido de nada — isso não informa que não há, informa
 * que o exportador não olhou.
 */
export function exportProjectMarkdown(
  project: Project,
  chats: ChatSummary[],
  quando: Date
): string {
  const fm = [
    "---",
    `title: ${JSON.stringify(project.name || "Untitled")}`,
    `created: ${JSON.stringify(project.createdAt)}`,
    `exported: ${JSON.stringify(quando.toISOString())}`,
    `notes: ${project.sources.length}`,
    `chats: ${project.chatIds.length}`,
    "source: Corvus",
    "kind: project",
    "---",
  ].join("\n");

  const partes: string[] = [`# ${project.name || "Untitled"}`];

  const instrucoes = (project.instructions ?? "").trim();
  if (instrucoes) partes.push(`## Custom instructions\n\n${instrucoes}`);

  if (project.sources.length)
    partes.push(
      `## Notes\n\n${project.sources.map((p) => `- ${noteLink(p)}`).join("\n")}`
    );

  // As conversas do projeto, da mais nova pra mais velha — a ordem em que a
  // lista do app as mostra, e a ordem em que se procura por elas.
  const daqui = chats
    .filter((c) => project.chatIds.includes(c.id))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  if (daqui.length)
    partes.push(`## Chats\n\n${daqui.map(linhaChat).join("\n")}`);

  return `${fm}\n\n${partes.join("\n\n")}\n`;
}

/** Grava o índice e devolve o caminho. Não toca em nota nenhuma do projeto. */
export async function exportProjectToVault(
  app: App,
  project: Project,
  chats: ChatSummary[],
  quando: Date = new Date()
): Promise<string> {
  await ensureFolder(app.vault.adapter, EXPORTS_FOLDER);
  let caminho = `${EXPORTS_FOLDER}/${exportFileName(project.name, quando)}`;
  // Mesmo teto de tentativas do export de conversa, e pelo mesmo motivo:
  // `exists` é resposta de fora, e um laço que só sai quando ela disser "não"
  // fica à mercê dela (ver chatExport).
  for (let n = 2; n <= 50 && (await app.vault.adapter.exists(caminho)); n++) {
    caminho = `${EXPORTS_FOLDER}/${exportFileName(
      `${project.name} ${n}`,
      quando
    )}`;
  }
  await app.vault.adapter.write(
    caminho,
    exportProjectMarkdown(project, chats, quando)
  );
  return caminho;
}
