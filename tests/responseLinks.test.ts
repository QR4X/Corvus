import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Platform, __notices } from "obsidian";
import type { App } from "obsidian";
import { openResponseLink } from "../src/ui/responseLinks";
import { VIEW_TYPE_CORVUS } from "../src/ui/CorvusView";

interface Drawer {
  collapsed: boolean;
  collapse(): void;
}
const drawer = (): Drawer => ({
  collapsed: false,
  collapse() {
    this.collapsed = true;
  },
});

function setup(notes: string[], where: "right" | "left" | "center") {
  const rightSplit = drawer();
  const leftSplit = drawer();
  const center = {};
  const opened: Array<[string, string, unknown]> = [];
  const inside = { id: "response" };
  const leaf = {
    view: { containerEl: { contains: (n: unknown) => n === inside } },
    getRoot: () => (where === "right" ? rightSplit : where === "left" ? leftSplit : center),
  };
  const app = {
    metadataCache: {
      getFirstLinkpathDest: (path: string, source: string) =>
        source === "" && notes.includes(path) ? { path: path + ".md" } : null,
    },
    workspace: {
      rightSplit,
      leftSplit,
      openLinkText: async (text: string, source: string, newLeaf: unknown) => {
        opened.push([text, source, newLeaf]);
      },
      getLeavesOfType: (type: string) => (type === VIEW_TYPE_CORVUS ? [leaf] : []),
    },
  } as unknown as App;
  return { app, opened, rightSplit, leftSplit, inside: inside as unknown as Element };
}

describe("openResponseLink", () => {
  beforeEach(() => {
    __notices.length = 0;
  });
  afterEach(() => {
    Platform.isMobile = false;
  });

  it("opens the cited note with its heading and passes the new tab request", () => {
    const m = setup(["2026-09-24 Northwind kickoff"], "right");
    expect(openResponseLink(m.app, "2026-09-24 Northwind kickoff", false, m.inside)).toBe(true);
    expect(openResponseLink(m.app, "2026-09-24 Northwind kickoff#Decisions", "tab", m.inside)).toBe(true);
    expect(m.opened).toEqual([
      ["2026-09-24 Northwind kickoff", "", false],
      ["2026-09-24 Northwind kickoff#Decisions", "", "tab"],
    ]);
    expect(__notices).toEqual([]);
  });

  it("shows a notice and creates nothing when the citation leads nowhere", () => {
    const m = setup([], "right");
    expect(openResponseLink(m.app, "Made up note#Section", false, m.inside)).toBe(false);
    expect(m.opened).toEqual([]);
    expect(__notices).toEqual(["Not found: Made up note"]);
  });

  it("keeps the sidebar open on desktop", () => {
    const m = setup(["Note"], "right");
    openResponseLink(m.app, "Note", false, m.inside);
    expect(m.rightSplit.collapsed).toBe(false);
  });

  it("closes the drawer holding the chat on mobile", () => {
    Platform.isMobile = true;
    const r = setup(["Note"], "right");
    openResponseLink(r.app, "Note", false, r.inside);
    expect([r.rightSplit.collapsed, r.leftSplit.collapsed]).toEqual([true, false]);

    const l = setup(["Note"], "left");
    openResponseLink(l.app, "Note", false, l.inside);
    expect([l.rightSplit.collapsed, l.leftSplit.collapsed]).toEqual([false, true]);
  });

  it("leaves both drawers alone on mobile when the chat is in the main area", () => {
    Platform.isMobile = true;
    const m = setup(["Note"], "center");
    openResponseLink(m.app, "Note", false, m.inside);
    expect([m.rightSplit.collapsed, m.leftSplit.collapsed]).toEqual([false, false]);
  });

  it("keeps the drawer open on mobile when the link has no target", () => {
    Platform.isMobile = true;
    const m = setup([], "right");
    openResponseLink(m.app, "Gone", false, m.inside);
    expect(m.rightSplit.collapsed).toBe(false);
  });
});
