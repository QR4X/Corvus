import { describe, it, expect } from "vitest";
import {
  formatTokens,
  summarizeProject,
  projectInputTokens,
} from "../src/ui/projectSummary";
import {
  instructionsSection,
  attachedNotesSection,
} from "../src/agent/conversation";
import { estimateTokens } from "../src/core/tokens";
import type { Project } from "../src/projects";

const NOW = new Date("2026-09-29T12:00:00Z").getTime();
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

const project = (p: Partial<Project> = {}): Project => ({
  id: "p1",
  name: "Thesis",
  icon: "book",
  color: "default",
  sources: [],
  chatIds: [],
  createdAt: daysAgo(5),
  ...p,
});

describe("project activity", () => {
  it("with chats, shows when the latest one happened", () => {
    const r = summarizeProject(
      project({ chatIds: ["a", "b"] }),
      [
        { id: "a", title: "Old", date: daysAgo(9) },
        { id: "b", title: "Recent", date: daysAgo(2) },
      ],
      NOW
    );
    expect(r.when).toBe("2d ago");
  });

  it("without chats, shows when the project was created", () => {
    expect(summarizeProject(project(), [], NOW).when).toBe("5d ago");
  });

  it("shows 'just now' instead of '0m ago'", () => {
    const r = summarizeProject(
      project({ chatIds: ["a"] }),
      [{ id: "a", title: "x", date: new Date(NOW - 5_000).toISOString() }],
      NOW
    );
    expect(r.when).toBe("just now");
  });

  it("past a month, shows the date without a trailing 'ago'", () => {
    const r = summarizeProject(project({ createdAt: daysAgo(60) }), [], NOW);
    expect(r.when).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("project topic", () => {
  it("uses the first line of the instructions the user wrote", () => {
    const r = summarizeProject(
      project({ instructions: "\n  Answer in English.\nCite the note." }),
      [],
      NOW
    );
    expect(r.about).toBe("Answer in English.");
  });

  it("without instructions, uses the latest chat title", () => {
    const r = summarizeProject(
      project({ chatIds: ["a", "b"] }),
      [
        { id: "a", title: "Old", date: daysAgo(9) },
        { id: "b", title: "Kuhn and paradigms", date: daysAgo(1) },
      ],
      NOW
    );
    expect(r.about).toBe("Latest: Kuhn and paradigms");
  });

  it("without either, returns null so the card shows the hint", () => {
    expect(summarizeProject(project(), [], NOW).about).toBeNull();
  });
});

describe("project chat count", () => {
  it("counts only chats that exist", () => {
    const r = summarizeProject(
      project({ chatIds: ["a", "deleted", "b"] }),
      [
        { id: "a", title: "A", date: daysAgo(1) },
        { id: "b", title: "B", date: daysAgo(2) },
        { id: "other-project", title: "C", date: daysAgo(0) },
      ],
      NOW
    );
    expect(r.chatCount).toBe(2);
  });
});

describe("project input tokens", () => {
  const note = (path: string, content: string) => ({ path, content });

  it("counts the text the project adds to the prompt: instructions and full notes", () => {
    const notes = [note("Thesis/Kuhn.md", "Paradigm.".repeat(35))];
    const instr = "Answer in English.";
    const text =
      instructionsSection(instr) + attachedNotesSection(notes);
    expect(projectInputTokens(instr, notes)).toBe(estimateTokens(text));
  });

  it("costs nothing without notes or instructions", () => {
    expect(projectInputTokens(undefined, [])).toBe(0);
    expect(projectInputTokens("   ", [])).toBe(0);
  });

  it("grows with note size because the whole content is sent", () => {
    const small = projectInputTokens("", [note("a.md", "x".repeat(350))]);
    const large = projectInputTokens("", [note("a.md", "x".repeat(3500))]);
    expect(large).toBeGreaterThan(small * 5);
  });

  it("formats the attached notes and instructions sections exactly", () => {
    expect(
      attachedNotesSection([note("A.md", "one"), note("B.md", "two")])
    ).toBe(
      "\n\n[Notes attached by user]\n\n### A.md\n\none\n\n---\n\n### B.md\n\ntwo"
    );
    expect(attachedNotesSection([])).toBe("");
    expect(instructionsSection("  Be brief.  ")).toBe("\n\nBe brief.");
  });
});

describe("formatTokens", () => {
  it("shows zero without a tilde", () => expect(formatTokens(0)).toBe("0 tokens"));
  it("shows hundreds as an estimate", () => expect(formatTokens(340)).toBe("~340 tokens"));
  it("shows thousands with one decimal", () => {
    expect(formatTokens(1234)).toBe("~1.2k tokens");
    expect(formatTokens(2000)).toBe("~2k tokens");
  });
  it("rounds tens of thousands", () =>
    expect(formatTokens(12_400)).toBe("~12k tokens"));
});
