import { describe, it, expect } from "vitest";
import { previewFromMarkdown } from "../src/core/chatPreview";

const file = (body: string) =>
  `---\nid: x\ntitle: T\n---\n\n# T\n\n${body}`;

describe("previewFromMarkdown", () => {
  it("shows the last turn, not the first", () => {
    const md = file(
      "## You\n\nfirst\n\n## Assistant\n\nsecond\n\n## You\n\nthird\n"
    );
    expect(previewFromMarkdown(md)).toBe("third");
  });

  it("format comments do not leak into the card", () => {
    const md = file(
      "## Assistant\n\n<!-- corvus: ts=1 -->\nmoved 3 notes\n\n<!-- corvus-steps: eyJhIjoxfQ== -->\n"
    );
    expect(previewFromMarkdown(md)).toBe("moved 3 notes");
  });

  it("becomes a single line; the card's two-line clamp is CSS", () => {
    const md = file("## Assistant\n\nline one\nline two\n\nline three\n");
    expect(previewFromMarkdown(md)).toBe("line one line two line three");
  });

  it("markdown syntax goes away and the text stays", () => {
    const md = file(
      "## Assistant\n\n## Plan\n\n- first\n- second\n\n```ts\nconst a = 1;\n```\n"
    );
    expect(previewFromMarkdown(md)).toBe("Plan first second const a = 1;");
  });

  it("bold, italic and friends go away and the text stays", () => {
    const md = file(
      "## Assistant\n\nYour Lisbon trip note has been moved and is now at **Travel/Lisbon trip.md**. " +
        "It was *old*, _really_ ~~gone~~ ==here==, __done__.\n"
    );
    expect(previewFromMarkdown(md)).toBe(
      "Your Lisbon trip note has been moved and is now at Travel/Lisbon trip.md. " +
        "It was old, really gone here, done."
    );
  });

  it("things that look like emphasis but are not stay as they are", () => {
    const md = file(
      "## Assistant\n\nsnake_case_name, 2 * 3 * 4, a_b and `a*b*c` and \\*literal\\*\n"
    );
    expect(previewFromMarkdown(md)).toBe("snake_case_name, 2 * 3 * 4, a_b and a*b*c and *literal*");
  });

  it("a wikilink shows its name or alias, and an embed disappears", () => {
    const md = file(
      "## Assistant\n\nsee [[Lisbon]], [[Trips/Lisbon|the trip]] and [[Lisbon#Hotel]] ![[map.png]]\n"
    );
    expect(previewFromMarkdown(md)).toBe("see Lisbon, the trip and Lisbon > Hotel");
  });

  it("HTML tags go away, but comparisons with < and > stay", () => {
    const md = file("## Assistant\n\nline<br>other, and 1 < 2 > 0\n");
    expect(previewFromMarkdown(md)).toBe("line other, and 1 < 2 > 0");
  });

  it("a link shows its text and an image shows nothing", () => {
    const md = file("## Assistant\n\nsee [the plan](x.md) ![](y.png)\n");
    expect(previewFromMarkdown(md)).toBe("see the plan");
  });

  it("falls back to the previous turn with text when the last one is empty", () => {
    const md = file("## You\n\nquestion\n\n## Assistant\n\n<!-- corvus: ts=2 -->\n");
    expect(previewFromMarkdown(md)).toBe("question");
  });

  it("a chat with no turns yields an empty preview", () => {
    expect(previewFromMarkdown(file(""))).toBe("");
    expect(previewFromMarkdown("")).toBe("");
  });
});
