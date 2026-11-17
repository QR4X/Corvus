import type { App } from "obsidian";
import type { ChatSummary } from "./chatPersistence";
import { ensureFolder } from "./vaultFs";
import type { Project } from "../projects";
import { exportFileName } from "./chatExport";
import { EXPORTS_FOLDER } from "./vaultPaths";

export function noteLink(path: string): string {
  return `[[${path.replace(/\.md$/i, "")}]]`;
}

function chatLine(c: ChatSummary): string {
  const day = (c.date || "").slice(0, 10);
  const meta = [day, c.model].filter(Boolean).join(" · ");
  const title = c.title.trim() || "Untitled";
  return meta ? `- ${title} — ${meta}` : `- ${title}`;
}

export function exportProjectMarkdown(
  project: Project,
  chats: ChatSummary[],
  when: Date
): string {
  const fm = [
    "---",
    `title: ${JSON.stringify(project.name || "Untitled")}`,
    `created: ${JSON.stringify(project.createdAt)}`,
    `exported: ${JSON.stringify(when.toISOString())}`,
    `notes: ${project.sources.length}`,
    `chats: ${project.chatIds.length}`,
    "source: Corvus",
    "kind: project",
    "---",
  ].join("\n");

  const sections: string[] = [`# ${project.name || "Untitled"}`];

  const instructions = (project.instructions ?? "").trim();
  if (instructions) sections.push(`## Custom instructions\n\n${instructions}`);

  if (project.sources.length)
    sections.push(
      `## Notes\n\n${project.sources.map((p) => `- ${noteLink(p)}`).join("\n")}`
    );

  const projectChats = chats
    .filter((c) => project.chatIds.includes(c.id))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  if (projectChats.length)
    sections.push(`## Chats\n\n${projectChats.map(chatLine).join("\n")}`);

  return `${fm}\n\n${sections.join("\n\n")}\n`;
}

export async function exportProjectToVault(
  app: App,
  project: Project,
  chats: ChatSummary[],
  when: Date = new Date()
): Promise<string> {
  await ensureFolder(app.vault.adapter, EXPORTS_FOLDER);
  let path = `${EXPORTS_FOLDER}/${exportFileName(project.name, when)}`;

  for (let n = 2; n <= 50 && (await app.vault.adapter.exists(path)); n++) {
    path = `${EXPORTS_FOLDER}/${exportFileName(
      `${project.name} ${n}`,
      when
    )}`;
  }
  await app.vault.adapter.write(
    path,
    exportProjectMarkdown(project, chats, when)
  );
  return path;
}
