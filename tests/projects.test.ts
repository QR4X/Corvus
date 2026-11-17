import { describe, it, expect } from "vitest";
import {
  projectColor,
  makeProjectId,
  PROJECT_ICONS,
  PROJECT_COLORS,
} from "../src/projects";

describe("projectColor", () => {
  it("maps \"default\" to the normal text CSS variable", () => {
    expect(projectColor("default")).toBe("var(--text-normal)");
  });
  it("passes hex colors through unchanged", () => {
    expect(projectColor("#e5484d")).toBe("#e5484d");
    expect(projectColor("#46a758")).toBe("#46a758");
  });
});

describe("makeProjectId", () => {
  it("uses the proj-<8 alphanumerics> format", () => {
    expect(makeProjectId()).toMatch(/^proj-[a-z0-9]{8}$/);
  });
  it("generates distinct consecutive ids", () => {
    const ids = new Set(Array.from({ length: 200 }, () => makeProjectId()));
    expect(ids.size).toBe(200);
  });
});

describe("picker options", () => {
  it("offers icons without duplicates", () => {
    expect(PROJECT_ICONS.length).toBeGreaterThan(10);
    expect(new Set(PROJECT_ICONS).size).toBe(PROJECT_ICONS.length);
  });
  it("puts default first and lists only unique hex colors after it", () => {
    expect(PROJECT_COLORS[0]).toBe("default");
    expect(new Set(PROJECT_COLORS).size).toBe(PROJECT_COLORS.length);
    for (const c of PROJECT_COLORS.slice(1)) {
      expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
