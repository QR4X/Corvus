import { describe, it, expect } from "vitest";
import {
  EMPTY_SKILL_DRAFT,
  skillFileName,
  skillMarkdown,
  skillProblem,
  type SkillDraft,
} from "../src/skills/skillFile";

const draft = (over: Partial<SkillDraft> = {}): SkillDraft => ({
  ...EMPTY_SKILL_DRAFT,
  name: "Weekly review",
  body: "Go through this week's notes.",
  ...over,
});

describe("skillFileName", () => {
  it("uses the name as the file name", () => {
    expect(skillFileName("Weekly review")).toBe("Weekly review.md");
  });

  it("replaces characters Obsidian rejects instead of refusing", () => {
    expect(skillFileName("Summary: TL;DR")).toBe("Summary- TL;DR.md");
    expect(skillFileName("a/b*c?d")).toBe("a-b-c-d.md");
  });

  it("does not let the file name end in a dot or space", () => {
    expect(skillFileName("Draft...")).toBe("Draft.md");
    expect(skillFileName("  space  ")).toBe("space.md");
  });

  it("falls back to a file name when nothing is left", () => {
    expect(skillFileName("///")).toBe("Skill.md");
    expect(skillFileName("")).toBe("Skill.md");
  });
});

describe("skillMarkdown", () => {
  it("writes frontmatter and body", () => {
    const md = skillMarkdown(draft({ description: "d", icon: "list" }));
    expect(md.startsWith("---\n")).toBe(true);
    expect(md).toContain('name: "Weekly review"');
    expect(md).toContain('description: "d"');
    expect(md).toContain('icon: "list"');
    expect(md.trimEnd().endsWith("Go through this week's notes.")).toBe(true);
  });

  it("always quotes the name so a colon cannot break YAML", () => {
    const md = skillMarkdown(draft({ name: "Summary: TL;DR" }));
    expect(md).toContain('name: "Summary: TL;DR"');
  });

  it("escapes quotes and backslashes in the name", () => {
    const md = skillMarkdown(draft({ name: 'The "good" \\ bad' }));
    expect(md).toContain('name: "The \\"good\\" \\\\ bad"');
  });

  it("omits the mode line when there is no mode", () => {
    expect(skillMarkdown(draft({ mode: "" }))).not.toContain("mode:");
    expect(skillMarkdown(draft({ mode: "agent" }))).toContain('mode: "agent"');
  });
});

describe("skillProblem", () => {
  it("returns null for a complete draft", () => {
    expect(skillProblem(draft(), [])).toBeNull();
  });

  it("requires a name and a prompt", () => {
    expect(skillProblem(draft({ name: "  " }), [])).toMatch(/name/i);
    expect(skillProblem(draft({ body: "" }), [])).toMatch(/prompt/i);
  });

  it("does not overwrite an existing skill", () => {
    const existing = ["corvus-ai/skills/Weekly review.md"];
    expect(skillProblem(draft(), existing)).toMatch(/already/i);

    expect(skillProblem(draft(), existing, existing[0])).toBeNull();
  });

  it("detects collisions case-insensitively like the disk does", () => {
    expect(
      skillProblem(draft({ name: "WEEKLY REVIEW" }), [
        "corvus-ai/skills/Weekly review.md",
      ])
    ).toMatch(/already/i);
  });
});
