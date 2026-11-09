import { describe, it, expect } from "vitest";
import {
  ICON_CATALOG,
  iconCatalogSize,
  iconCategoryOf,
} from "../src/iconCatalog";
import { PROJECT_ICONS } from "../src/projects";
import { SKILL_ICONS } from "../src/skills/skillFile";

const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

describe("ICON_CATALOG", () => {
  it("todo nome tem a forma de um nome Lucide", () => {
    for (const cat of ICON_CATALOG)
      for (const ic of cat.icons) expect(ic, `${cat.id}/${ic}`).toMatch(KEBAB);
  });

  it("nenhum ícone aparece em duas categorias", () => {

    const vistos = new Map<string, string>();
    for (const cat of ICON_CATALOG)
      for (const ic of cat.icons) {
        expect(vistos.get(ic), `${ic} repetido`).toBeUndefined();
        vistos.set(ic, cat.id);
      }
  });

  it("as categorias têm id e nome próprios, e nenhuma é vazia", () => {
    const ids = ICON_CATALOG.map((c) => c.id);
    const labels = ICON_CATALOG.map((c) => c.label);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
    for (const cat of ICON_CATALOG) expect(cat.icons.length).toBeGreaterThan(0);
  });

  it("toda categoria tem emblema, e emblema é um nome de ícone", () => {

    for (const cat of ICON_CATALOG) {
      expect(cat.icon, cat.id).toMatch(KEBAB);
      expect(cat.icon.length, cat.id).toBeGreaterThan(0);
    }
  });

  it("a contagem bate com o que está nas categorias", () => {

    const soma = ICON_CATALOG.reduce((n, c) => n + c.icons.length, 0);
    expect(iconCatalogSize()).toBe(soma);
    expect(soma).toBeGreaterThan(100);
  });
});

describe("iconCategoryOf", () => {
  it("acha a categoria de um ícone do catálogo", () => {
    expect(iconCategoryOf("plane")).toBe("travel");
    expect(iconCategoryOf("terminal")).toBe("code");
  });

  it("devolve null pro que não está lá", () => {

    expect(iconCategoryOf("folder-open")).toBeNull();
    expect(iconCategoryOf("")).toBeNull();
  });
});

describe("as grades curtas", () => {
  it("também são nomes de ícone bem formados", () => {
    for (const ic of [...PROJECT_ICONS, ...SKILL_ICONS])
      expect(ic, ic).toMatch(KEBAB);
  });
});
