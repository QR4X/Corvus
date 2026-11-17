import { describe, it, expect } from "vitest";
import { parseNotes, parseProject } from "../src/assistant/parse";
import { promptNotes } from "../src/assistant/prompt";

const VAULT = [
  "Thesis/Kuhn - structure.md",
  "Thesis/Lakatos.md",
  "DAILY/26-09-13.md",
  "Recipes/Cake.md",
];

describe("parseNotes", () => {
  it("accepts paths that are in the vault list", () => {
    expect(
      parseNotes({ notes: ["Thesis/Lakatos.md", "Thesis/Kuhn - structure.md"] }, VAULT)
    ).toEqual(["Thesis/Lakatos.md", "Thesis/Kuhn - structure.md"]);
  });

  it("drops invented paths that small models make up", () => {
    expect(
      parseNotes({ notes: ["Thesis/Popper.md", "Thesis/Lakatos.md"] }, VAULT)
    ).toEqual(["Thesis/Lakatos.md"]);
  });

  it("skips notes that are already picked", () => {
    expect(
      parseNotes(
        { notes: ["Thesis/Lakatos.md", "Thesis/Kuhn - structure.md"] },
        VAULT,
        ["Thesis/Lakatos.md"]
      )
    ).toEqual(["Thesis/Kuhn - structure.md"]);
  });

  it("removes duplicates and returns at most ten notes", () => {
    const many = Array.from({ length: 15 }, (_, i) => `N/${i}.md`);
    expect(parseNotes({ notes: [...many, ...many] }, many)).toHaveLength(10);
    expect(
      parseNotes({ notes: ["Thesis/Lakatos.md", "Thesis/Lakatos.md"] }, VAULT)
    ).toEqual(["Thesis/Lakatos.md"]);
  });

  it("turns a malformed response into an empty list instead of throwing", () => {
    expect(parseNotes(null, VAULT)).toEqual([]);
    expect(parseNotes({ notes: "Thesis/Lakatos.md" }, VAULT)).toEqual([]);
    expect(parseNotes({ notes: [1, null, { p: 1 }] }, VAULT)).toEqual([]);
  });

  it("filters whole-project suggestions by the same rule", () => {
    const p = parseProject(
      { name: "Thesis", notes: ["Thesis/Popper.md", "Thesis/Lakatos.md", "Thesis/Lakatos.md"] },
      ["folder"],
      ["default"],
      VAULT
    );
    expect(p?.notes).toEqual(["Thesis/Lakatos.md"]);
  });
});

describe("promptNotes", () => {
  const base = {
    name: "Master's thesis",
    instructions: "",
    picked: [] as string[],
    paths: VAULT,
  };

  it("sends the paths and asks for exactly those back", () => {
    const p = promptNotes(base);
    for (const c of VAULT) expect(p).toContain(`- ${c}`);
    expect(p).toMatch(/exact paths/i);
    expect(p).toContain('{"notes"');
  });

  it("sends the project name, and the instructions when present", () => {
    expect(promptNotes(base)).toContain("Master's thesis");
    const withInstructions = promptNotes({ ...base, instructions: "Focus on Kuhn." });
    expect(withInstructions).toContain("Focus on Kuhn.");
    expect(promptNotes(base)).not.toMatch(/Its instructions/);
  });

  it("lists what is already attached so it is not suggested again", () => {
    const p = promptNotes({ ...base, picked: ["Thesis/Lakatos.md"] });
    expect(p).toMatch(/Already attached/);
    expect(p).toContain("- Thesis/Lakatos.md");
  });

  it("asks for answers in English", () => {
    expect(promptNotes(base)).toContain("Write EVERY field in English");
  });
});
