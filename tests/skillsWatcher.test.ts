import { describe, it, expect, vi } from "vitest";

vi.mock("obsidian", () => import("./obsidian-stub"));

const { isSkillFilePath, skillsFolderPrefix } = await import(
  "../src/skills/skills"
);

describe("isSkillFilePath", () => {
  const FOLDER = "corvus-ai/skills";

  it("accepts .md files inside the folder, including subfolders", () => {
    expect(isSkillFilePath("corvus-ai/skills/Summary.md", FOLDER)).toBe(true);
    expect(isSkillFilePath("corvus-ai/skills/en/Summary.md", FOLDER)).toBe(true);
  });

  it("rejects notes outside the folder", () => {
    expect(isSkillFilePath("Notes/Summary.md", FOLDER)).toBe(false);
    expect(isSkillFilePath("corvus-ai/chats/2026-08-03.md", FOLDER)).toBe(false);
  });

  it("rejects files that are not .md", () => {
    expect(isSkillFilePath("corvus-ai/skills/logo.png", FOLDER)).toBe(false);
    expect(isSkillFilePath("corvus-ai/skills/index.json", FOLDER)).toBe(false);
  });

  it("rejects a sibling folder sharing the name prefix", () => {
    expect(isSkillFilePath("corvus-ai/skills-old/Summary.md", FOLDER)).toBe(false);
  });

  it("accepts an uppercase extension", () => {
    expect(isSkillFilePath("corvus-ai/skills/Summary.MD", FOLDER)).toBe(true);
  });

  it("never matches an empty path", () => {
    expect(isSkillFilePath("", FOLDER)).toBe(false);
  });

  it("normalizes a custom folder with a trailing slash", () => {
    expect(isSkillFilePath("My Skills/a.md", "My Skills/")).toBe(true);
    expect(skillsFolderPrefix("My Skills/")).toBe("My Skills/");
  });

  it("falls back to the default folder when empty", () => {
    expect(skillsFolderPrefix("")).toBe("corvus-ai/skills/");
    expect(isSkillFilePath("corvus-ai/skills/a.md", "")).toBe(true);
  });
});
