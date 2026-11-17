import { describe, it, expect } from "vitest";
import {
  PROJECT_COLORS,
  EMPTY_PROJECT_DRAFT,
  PROJECT_ICONS,
  projectColor,
  projectProblem,
  copyName,
  type Project,
} from "../src/projects";

const proj = (over: Partial<Project> = {}): Project => ({
  id: "p1",
  name: "Thesis",
  icon: PROJECT_ICONS[0],
  color: PROJECT_COLORS[0],
  sources: [],
  chatIds: [],
  createdAt: new Date().toISOString(),
  ...over,
});

describe("projectProblem", () => {
  it("a draft with a name is ready", () => {
    expect(projectProblem({ ...EMPTY_PROJECT_DRAFT, name: "Thesis" }, [])).toBeNull();
  });

  it("a draft without a name is rejected", () => {
    expect(projectProblem({ ...EMPTY_PROJECT_DRAFT, name: "   " }, [])).toMatch(
      /name/i
    );
  });

  it("a duplicate name is rejected", () => {
    const d = { ...EMPTY_PROJECT_DRAFT, name: " thesis " };
    expect(projectProblem(d, [proj()])).toMatch(/already/i);
  });

  it("an edited project does not collide with itself", () => {
    const d = { ...EMPTY_PROJECT_DRAFT, name: "Thesis" };
    expect(projectProblem(d, [proj()], "p1")).toBeNull();
  });
});

describe("projectColor", () => {
  it('"default" follows the theme and anything else is the chosen color', () => {
    expect(projectColor("default")).toBe("var(--text-normal)");
    expect(projectColor("#46a758")).toBe("#46a758");
  });
});

describe("the empty draft", () => {
  it("starts with an icon and a color that exist in the grid", () => {
    expect(PROJECT_ICONS).toContain(EMPTY_PROJECT_DRAFT.icon);
    expect(PROJECT_COLORS).toContain(EMPTY_PROJECT_DRAFT.color);
  });
});

describe("copyName", () => {
  it("the first copy has no number", () => {
    expect(copyName("Thesis", [proj()])).toBe("Thesis copy");
  });

  it("the second copy is numbered and skips existing names", () => {
    const existing = [proj(), proj({ id: "p2", name: "Thesis copy" })];
    expect(copyName("Thesis", existing)).toBe("Thesis copy 2");
  });

  it("does not collide because of letter case", () => {
    const existing = [proj({ name: "THESIS COPY" })];
    expect(copyName("Thesis", existing)).toBe("Thesis copy 2");
  });

  it("the resulting name never collides with existing ones", () => {
    const existing = [
      proj({ id: "a", name: "Home" }),
      proj({ id: "b", name: "Home copy" }),
      proj({ id: "c", name: "Home copy 2" }),
      proj({ id: "d", name: "Home copy 3" }),
    ];
    const fresh = copyName("Home", existing);
    expect(existing.some((p) => p.name.toLowerCase() === fresh.toLowerCase())).toBe(
      false
    );
  });

  it("a project without a name still gets one", () => {
    expect(copyName("   ", [])).toBe("Project copy");
  });
});
