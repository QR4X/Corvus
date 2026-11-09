import type { App } from "obsidian";
import type { ChatSummary } from "./chatPersistence";
import { ensureFolder } from "./chatPersistence";
import type { Project } from "../projects";
import { EXPORTS_FOLDER, exportFileName } from "./chatExport";

export function noteLink(path: string): string {
  return `[[${path.replace(/\.md$/i, "")}]]`;
}

function linhaChat(c: ChatSummary): string {
  const dia = (c.date || "").slice(0, 10);
  const partes = [dia, c.model].filter(Boolean).join(" · ");
  const titulo = c.title.trim() || "Untitled";
  return partes ? `- ${titulo} — ${partes}` : `- ${titulo}`;
}

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

  const daqui = chats
    .filter((c) => project.chatIds.includes(c.id))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  if (daqui.length)
    partes.push(`## Chats\n\n${daqui.map(linhaChat).join("\n")}`);

  return `${fm}\n\n${partes.join("\n\n")}\n`;
}

export async function exportProjectToVault(
  app: App,
  project: Project,
  chats: ChatSummary[],
  quando: Date = new Date()
): Promise<string> {
  await ensureFolder(app.vault.adapter, EXPORTS_FOLDER);
  let caminho = `${EXPORTS_FOLDER}/${exportFileName(project.name, quando)}`;

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
