import { describe, it, expect } from "vitest";
import {
  exportChatMarkdown,
  exportFileName,
  stripMarkers,
} from "../src/core/chatExport";
import type { ChatData } from "../src/core/chatPersistence";

const chat = (over: Partial<ChatData> = {}): ChatData => ({
  id: "abc",
  title: "Weekly review",
  date: "2026-09-20T10:00:00.000Z",
  mode: "chat",
  provider: "openai",
  model: "gpt-5",
  effort: "med",
  tokensIn: 10,
  tokensOut: 20,
  messages: [
    { type: "user", content: "hi" },
    { type: "ai-response", content: "hello" },
  ],
  ...over,
});

describe("stripMarkers", () => {
  it("removes the metadata comment and keeps the text", () => {
    const r = stripMarkers("<!-- corvus: ts=123 reaction=like -->\ngood morning");
    expect(r).toBe("good morning");
  });

  it("removes the base64 blob of agent steps", () => {
    const r = stripMarkers("did this\n\n<!-- corvus-steps: QUJDREVGRw== -->");
    expect(r).toBe("did this");
    expect(r).not.toMatch(/corvus-steps/);
  });

  it("leaves real markdown untouched", () => {
    const md = "# Title\n\n- one\n- two\n\n`code`";
    expect(stripMarkers(md)).toBe(md);
  });
});

describe("exportFileName", () => {
  const day = new Date("2026-09-20T10:00:00.000Z");

  it("includes the title and the date", () => {
    expect(exportFileName("Weekly review", day)).toBe(
      "Weekly review (2026-09-20).md"
    );
  });

  it("replaces characters Obsidian rejects in file names", () => {
    expect(exportFileName("Summary: a/b", day)).toBe("Summary- a-b (2026-09-20).md");
  });

  it("an empty title still yields a file name", () => {
    expect(exportFileName("   ", day)).toBe("chat (2026-09-20).md");
  });
});

describe("exportChatMarkdown", () => {
  const when = new Date("2026-09-27T12:00:00.000Z");

  it("starts with frontmatter stating where it came from", () => {
    const md = exportChatMarkdown(chat(), when);
    expect(md.startsWith("---\n")).toBe(true);
    expect(md).toContain('model: "gpt-5"');
    expect(md).toContain("source: Corvus");
    expect(md).toContain('exported: "2026-09-27T12:00:00.000Z"');
  });

  it("the body is the chat in readable sections", () => {
    const md = exportChatMarkdown(chat(), when);
    expect(md).toContain("# Weekly review");
    expect(md).toContain("## You\n\nhi");
    expect(md).toContain("## Assistant\n\nhello");
  });

  it("internal markers are left out", () => {
    const md = exportChatMarkdown(
      chat({
        messages: [
          {
            type: "ai-response",
            content: "<!-- corvus: ts=1 -->\ndone\n\n<!-- corvus-steps: eyJ4IjoxfQ== -->",
          },
        ],
      }),
      when
    );
    expect(md).toContain("done");
    expect(md).not.toMatch(/corvus-steps|corvus: ts=/);
  });
});
