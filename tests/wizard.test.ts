import { describe, it, expect } from "vitest";
import { wizardFoot } from "../src/ui/wizard";
import { SKILL_STEPS } from "../src/ui/SkillSheet";
import { PROJECT_STEPS } from "../src/ui/ProjectSheet";
import { EMPTY_SKILL_DRAFT } from "../src/skills/skillFile";

const TOTAL = SKILL_STEPS.length;
const LAST = TOTAL - 1;

const foot = (current: number, problem: string | null = null, total = TOTAL) =>
  wizardFoot({ current, total, problem });

describe("the wizard buttons", () => {
  it("the top arrow goes back one step and only exits when there is no previous step", () => {
    expect(foot(0).back).toBe("exit");
    expect(foot(1).back).toBe("step");
    expect(foot(LAST).back).toBe("step");
  });

  it("middle steps advance and the last one submits", () => {
    expect(foot(0).primary).toBe("next");
    expect(foot(LAST - 1).primary).toBe("next");
    expect(foot(LAST).primary).toBe("submit");
    expect(foot(LAST).isLast).toBe(true);
  });

  it("a single-step wizard is a plain form that submits and exits", () => {
    const p = foot(0, null, 1);
    expect(p.primary).toBe("submit");
    expect(p.back).toBe("exit");
  });

  it("an index past the end does not invent a missing step", () => {
    expect(foot(TOTAL + 4).primary).toBe("submit");
  });
});

describe("the status line", () => {
  it("a missing field only shows where saving is possible", () => {
    expect(foot(0, "Give it a name.").status).toBe(null);
    expect(foot(LAST, "Give it a name.").status).toBe("problem");
  });

  it("a ready draft midway offers a shortcut to finish", () => {
    expect(foot(0).status).toBe("shortcut");
    expect(foot(LAST - 1).status).toBe("shortcut");
  });

  it("on the last step with a ready draft the line is hidden", () => {
    expect(foot(LAST).status).toBe(null);
  });

  it("problem and shortcut never show together", () => {
    for (let i = 0; i <= TOTAL; i++)
      for (const prob of [null, "something is missing"]) {
        const s = wizardFoot({ current: i, total: TOTAL, problem: prob }).status;
        expect(s === "problem" && prob === null).toBe(false);
        expect(s === "shortcut" && prob !== null).toBe(false);
      }
  });

  it("the submit button is only ready when the draft is valid", () => {
    expect(foot(LAST, "missing").ready).toBe(false);
    expect(foot(LAST).ready).toBe(true);
  });
});

describe("the skill steps", () => {
  it("have exactly one step per draft field", () => {
    const ids = SKILL_STEPS.map((p) => p.id as string).sort();
    expect(ids).toEqual([...Object.keys(EMPTY_SKILL_DRAFT)].sort());
  });

  it("have no repeated step and start with the prompt", () => {
    const ids = SKILL_STEPS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("body");
  });

  it("every step has a short label because it becomes the sheet title", () => {
    for (const p of SKILL_STEPS) {
      expect(p.label.trim()).not.toBe("");
      expect(p.label.length).toBeLessThanOrEqual(14);
    }
  });
});

describe("the project wizard", () => {
  it("asks for name, notes, instructions, color and icon in that order", () => {
    expect(PROJECT_STEPS.map((p) => p.id)).toEqual([
      "name",
      "notes",
      "instructions",
      "color",
      "icon",
    ]);
  });

  it("every step has a short label because it becomes the sheet title", () => {
    for (const p of PROJECT_STEPS) {
      expect(p.label.trim()).not.toBe("");
      expect(p.label.length).toBeLessThanOrEqual(14);
    }
  });
});
