import { describe, it, expect } from "vitest";
import {
  previewFor,
  fence,
  closeOpenFence,
} from "../src/agent/ConfirmationModal";

describe("previewFor", () => {
  it("previews a vault note as markdown", () => {
    expect(previewFor("PROJECTS/CREATIVE SYSTEMS.md")).toEqual({
      kind: "markdown",
    });
    expect(previewFor("Inbox/idea.markdown")).toEqual({ kind: "markdown" });
  });

  it("treats a path without extension as a note", () => {
    expect(previewFor("Inbox/no extension")).toEqual({ kind: "markdown" });
    expect(previewFor("")).toEqual({ kind: "markdown" });
  });

  it("previews a code file as a block with its Prism language", () => {
    expect(previewFor("corvus-ai/review.ts")).toEqual({
      kind: "code",
      lang: "typescript",
    });
    expect(previewFor("a/b/config.YAML")).toEqual({ kind: "code", lang: "yaml" });
    expect(previewFor("scripts/build.mjs")).toEqual({
      kind: "code",
      lang: "javascript",
    });
  });

  it("keeps an unknown extension as plain text", () => {
    expect(previewFor("Inbox/dump.txt")).toEqual({ kind: "plain" });
    expect(previewFor("assets/photo.heic")).toEqual({ kind: "plain" });
  });

  it("ignores a dot in the folder name", () => {
    expect(previewFor("NUTRITION 1.0/plan")).toEqual({ kind: "markdown" });
    expect(previewFor("NUTRITION 1.0/plan.ts")).toEqual({
      kind: "code",
      lang: "typescript",
    });
  });

  it("does not treat a dotfile like .gitignore as an extension", () => {
    expect(previewFor(".gitignore")).toEqual({ kind: "markdown" });
  });
});

describe("fence", () => {
  it("opens and closes with the language", () => {
    expect(fence("const a = 1;", "typescript")).toBe(
      "```typescript\nconst a = 1;\n```"
    );
  });

  it("grows longer than a fence inside the content", () => {
    const out = fence("before\n```\ninner\n```\nafter", "markdown");
    expect(out.startsWith("````markdown\n")).toBe(true);
    expect(out.endsWith("\n````")).toBe(true);

    expect(out).toContain("inner");
    expect(out).toContain("after");
  });

  it("counts the longest backtick run, not the first", () => {
    const out = fence("a ````` b", "text");
    expect(out.startsWith("``````text\n")).toBe(true);
  });
});

describe("closeOpenFence", () => {
  it("leaves balanced markdown alone", () => {
    const md = "# t\n\n```ts\nconst a = 1;\n```\n";
    expect(closeOpenFence(md)).toBe(md);
  });

  it("closes a fence left open by truncation", () => {
    const md = "# t\n\n```ts\nconst a = 1;";
    expect(closeOpenFence(md)).toBe(md + "\n```");
  });

  it("closes with the same marker (tilde stays tilde)", () => {
    const md = "~~~python\nprint(1)";
    expect(closeOpenFence(md)).toBe(md + "\n~~~");
  });

  it("ignores a fence indented by four spaces", () => {
    const md = "text\n\n    ```not-a-fence\n\ntext";
    expect(closeOpenFence(md)).toBe(md);
  });
});
