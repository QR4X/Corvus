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
  it("uses Lucide-shaped names for every icon", () => {
    for (const cat of ICON_CATALOG)
      for (const ic of cat.icons) expect(ic, `${cat.id}/${ic}`).toMatch(KEBAB);
  });

  it("never lists an icon in two categories", () => {
    const seen = new Map<string, string>();
    for (const cat of ICON_CATALOG)
      for (const ic of cat.icons) {
        expect(seen.get(ic), `${ic} repeated`).toBeUndefined();
        seen.set(ic, cat.id);
      }
  });

  it("gives categories unique ids and labels and no empty category", () => {
    const ids = ICON_CATALOG.map((c) => c.id);
    const labels = ICON_CATALOG.map((c) => c.label);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
    for (const cat of ICON_CATALOG) expect(cat.icons.length).toBeGreaterThan(0);
  });

  it("gives every category an icon name as its badge", () => {
    for (const cat of ICON_CATALOG) {
      expect(cat.icon, cat.id).toMatch(KEBAB);
    }
  });

  it("counts the same icons as the categories hold", () => {
    const total = ICON_CATALOG.reduce((n, c) => n + c.icons.length, 0);
    expect(iconCatalogSize()).toBe(total);
    expect(total).toBeGreaterThan(100);
  });
});

describe("iconCategoryOf", () => {
  it("finds the category of a catalog icon", () => {
    expect(iconCategoryOf("plane")).toBe("travel");
    expect(iconCategoryOf("terminal")).toBe("code");
  });

  it("returns null for icons outside the catalog", () => {
    expect(iconCategoryOf("folder-open")).toBeNull();
    expect(iconCategoryOf("")).toBeNull();
  });
});

describe("short icon grids", () => {
  it("also use well-formed icon names", () => {
    for (const ic of [...PROJECT_ICONS, ...SKILL_ICONS])
      expect(ic, ic).toMatch(KEBAB);
  });
});
