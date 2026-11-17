import { describe, it, expect } from "vitest";
import {
  exportProjectMarkdown,
  noteLink,
} from "../src/core/projectExport";
import type { Project } from "../src/projects";
import type { ChatSummary } from "../src/core/chatPersistence";

const proj = (over: Partial<Project> = {}): Project => ({
  id: "p1",
  name: "Thesis",
  icon: "graduation-cap",
  color: "#4361ee",
  sources: ["Refs/Kuhn.md", "Journal/2026-09.md"],
  instructions: "Always cite the source.",
  chatIds: ["c1", "c2"],
  createdAt: "2026-09-01T10:00:00.000Z",
  ...over,
});

const chat = (over: Partial<ChatSummary> = {}): ChatSummary => ({
  id: "c1",
  title: "Chapter 2",
  date: "2026-09-20T10:00:00.000Z",
  mode: "chat",
  provider: "openai",
  model: "gpt-5",
  effort: "med",
  tokensIn: 1,
  tokensOut: 2,
  messageCount: 2,
  toolCount: 0,
  filePath: ".corvus/chats/c1.md",
  ...over,
});

const when = new Date("2026-09-27T12:00:00.000Z");

describe("noteLink", () => {
  it("becomes a wikilink without .md", () => {
    expect(noteLink("Refs/Kuhn.md")).toBe("[[Refs/Kuhn]]");
  });

  it("keeps the full path, not just the name", () => {
    expect(noteLink("a/b/Index.md")).toBe("[[a/b/Index]]");
  });
});

describe("exportProjectMarkdown", () => {
  it("starts with frontmatter describing kind and source", () => {
    const md = exportProjectMarkdown(proj(), [chat()], when);
    expect(md.startsWith("---\n")).toBe(true);
    expect(md).toContain("kind: project");
    expect(md).toContain("source: Corvus");
    expect(md).toContain('created: "2026-09-01T10:00:00.000Z"');
    expect(md).toContain("notes: 2");
  });

  it("includes the instructions in full", () => {
    expect(exportProjectMarkdown(proj(), [], when)).toContain(
      "## Custom instructions\n\nAlways cite the source."
    );
  });

  it("links the sources so the project shows in the graph", () => {
    const md = exportProjectMarkdown(proj(), [], when);
    expect(md).toContain("- [[Refs/Kuhn]]");
    expect(md).toContain("- [[Journal/2026-09]]");
  });

  it("lists project chats from newest to oldest", () => {
    const md = exportProjectMarkdown(
      proj(),
      [
        chat({ id: "c1", title: "Older", date: "2026-09-10T10:00:00.000Z" }),
        chat({ id: "c2", title: "Newer", date: "2026-09-25T10:00:00.000Z" }),
      ],
      when
    );
    expect(md.indexOf("Newer")).toBeLessThan(md.indexOf("Older"));
    expect(md).toContain("- Newer — 2026-09-25 · gpt-5");
  });

  it("leaves out chats from other projects", () => {
    const md = exportProjectMarkdown(
      proj({ chatIds: ["c1"] }),
      [chat({ id: "c1", title: "Mine" }), chat({ id: "zz", title: "Foreign" })],
      when
    );
    expect(md).toContain("Mine");
    expect(md).not.toContain("Foreign");
  });

  it("omits empty sections", () => {
    const md = exportProjectMarkdown(
      proj({ sources: [], instructions: "", chatIds: [] }),
      [],
      when
    );
    expect(md).not.toContain("## Notes");
    expect(md).not.toContain("## Custom instructions");
    expect(md).not.toContain("## Chats");
    expect(md).toContain("# Thesis");
  });
});
