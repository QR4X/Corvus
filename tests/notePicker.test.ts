import { describe, it, expect } from "vitest";
import { rankNotes, wikilinkQuery, type NoteLike } from "../src/ui/notePicker";

const n = (path: string, mtime = 0): NoteLike => ({
  path,
  basename: (path.split("/").pop() ?? "").replace(/\.md$/, ""),
  mtime,
});

const vault: NoteLike[] = [
  n("Notes/2024/product-framing/draft.md", 10),
  n("PROJECTS/FRAMEWORKS.md", 5),
  n("DAILY/2026-09-14.md", 99),
  n("PROJECTS/Frameworks archive.md", 7),
  n("Inbox/framework.md", 1),
];

describe("rankNotes", () => {
  it("lists the most recent notes first for an empty query", () => {
    expect(rankNotes(vault, "").map((x) => x.basename)).toEqual([
      "2026-09-14",
      "draft",
      "Frameworks archive",
      "FRAMEWORKS",
      "framework",
    ]);
  });

  it("ranks an exact name match first", () => {
    expect(rankNotes(vault, "framework")[0].path).toBe("Inbox/framework.md");
  });

  it("ranks a name prefix above a path match", () => {
    const order = rankNotes(vault, "fram").map((x) => x.path);
    expect(order.indexOf("PROJECTS/FRAMEWORKS.md")).toBeLessThan(
      order.indexOf("Notes/2024/product-framing/draft.md")
    );
  });

  it("matches by path when the name does not match", () => {
    expect(rankNotes(vault, "daily").map((x) => x.basename)).toEqual([
      "2026-09-14",
    ]);
  });

  it("returns nothing when no note matches", () => {
    expect(rankNotes(vault, "zzz")).toEqual([]);
  });

  it("respects the limit", () => {
    expect(rankNotes(vault, "", 2)).toHaveLength(2);
  });

  it("is case-insensitive", () => {
    expect(rankNotes(vault, "FRAMEWORKS")[0].basename).toBe("FRAMEWORKS");
  });
});

describe("wikilinkQuery", () => {
  it("opens when [[ precedes the cursor", () => {
    expect(wikilinkQuery("see it [[fram", 13)).toEqual({
      start: 7,
      query: "fram",
    });
  });

  it("returns an empty query right after [[ to list everything", () => {
    expect(wikilinkQuery("see it [[", 9)).toEqual({ start: 7, query: "" });
  });

  it("closes after ]]", () => {
    expect(wikilinkQuery("see it [[note]] and so", 22)).toBeNull();
  });

  it("cancels on a line break", () => {
    expect(wikilinkQuery("see it [[\nnext line.", 20)).toBeNull();
  });

  it("does not open without [[", () => {
    expect(wikilinkQuery("regular text", 12)).toBeNull();
  });

  it("uses the most recent [[ before the cursor", () => {
    expect(wikilinkQuery("[[a]] and so [[b", 16)).toEqual({
      start: 13,
      query: "b",
    });
  });

  it("ignores text after the cursor", () => {
    expect(wikilinkQuery("[[fra]] rest", 5)).toEqual({
      start: 0,
      query: "fra",
    });
  });
});

describe("wikilinkQuery length limit", () => {
  it("does not keep the list open forever for a stale [[", () => {
    const text = "[[" + "x".repeat(81);
    expect(wikilinkQuery(text, text.length)).toBeNull();
  });

  it("still opens for a long but plausible query", () => {
    const text = "[[" + "x".repeat(40);
    expect(wikilinkQuery(text, text.length)?.query).toHaveLength(40);
  });
});
