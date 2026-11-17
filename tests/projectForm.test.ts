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

describe("projectProblema", () => {
  it("com nome, está pronto", () => {
    expect(projectProblem({ ...EMPTY_PROJECT_DRAFT, name: "Thesis" }, [])).toBeNull();
  });

  it("sem nome, não dá", () => {
    expect(projectProblem({ ...EMPTY_PROJECT_DRAFT, name: "   " }, [])).toMatch(
      /name/i
    );
  });

  it("nome repetido é erro de gente, e por isso é erro", () => {

    const d = { ...EMPTY_PROJECT_DRAFT, name: " thesis " };
    expect(projectProblem(d, [proj()])).toMatch(/already/i);
  });

  it("editando, o projeto não colide consigo mesmo", () => {
    const d = { ...EMPTY_PROJECT_DRAFT, name: "Thesis" };
    expect(projectProblem(d, [proj()], "p1")).toBeNull();
  });
});

describe("projectColor", () => {
  it('"default" segue o tema; o resto é a cor escolhida', () => {
    expect(projectColor("default")).toBe("var(--text-normal)");
    expect(projectColor("#46a758")).toBe("#46a758");
  });
});

describe("o rascunho vazio", () => {
  it("nasce com um ícone e uma cor que existem na grade", () => {

    expect(PROJECT_ICONS).toContain(EMPTY_PROJECT_DRAFT.icon);
    expect(PROJECT_COLORS).toContain(EMPTY_PROJECT_DRAFT.color);
  });
});

describe("nomeDaCopia", () => {

  it("a primeira cópia não leva número", () => {
    expect(copyName("Thesis", [proj()])).toBe("Thesis copy");
  });

  it("a segunda leva, e pula o que já existe", () => {
    const tem = [proj(), proj({ id: "p2", name: "Thesis copy" })];
    expect(copyName("Thesis", tem)).toBe("Thesis copy 2");
  });

  it("não colide por causa de maiúscula", () => {
    const tem = [proj({ name: "THESIS COPY" })];
    expect(copyName("Thesis", tem)).toBe("Thesis copy 2");
  });

  it("o nome que sai nunca colide com os que estão lá", () => {
    const tem = [
      proj({ id: "a", name: "Casa" }),
      proj({ id: "b", name: "Casa copy" }),
      proj({ id: "c", name: "Casa copy 2" }),
      proj({ id: "d", name: "Casa copy 3" }),
    ];
    const novo = copyName("Casa", tem);
    expect(tem.some((p) => p.name.toLowerCase() === novo.toLowerCase())).toBe(
      false
    );
  });

  it("projeto sem nome ainda gera um", () => {
    expect(copyName("   ", [])).toBe("Project copy");
  });
});
