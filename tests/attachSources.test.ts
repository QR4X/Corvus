import { describe, it, expect } from "vitest";
import {
  rankArtifacts,
  normalizeUrl,
  linkNote,
  attachmentLabel,
  attachmentThumb,
  noteKind,
  artifactIcon,
  type ArtifactLike,
} from "../src/ui/attachSources";
import { htmlTitle, htmlToText } from "../src/core/html";
import { isImageExt } from "../src/core/imageStore";
import { GENERATION_FOLDER } from "../src/core/vaultPaths";

const f = (path: string, mtime: number): ArtifactLike => {
  const name = path.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  return {
    path,
    basename: name.slice(0, dot),
    extension: name.slice(dot + 1),
    mtime,
  };
};

const vault: ArtifactLike[] = [
  f(`${GENERATION_FOLDER}/images/1700-cat.png`, 10),
  f(`${GENERATION_FOLDER}/images/1700-cat.md`, 11),
  f(`${GENERATION_FOLDER}/audio/1800-speech.mp3`, 50),
  f(`${GENERATION_FOLDER}/video/1900-clip.mp4`, 30),
  f("PROJECTS/FRAMEWORKS.md", 99),
  f("assets/photo-i-took.png", 98),
];

describe("rankArtifacts", () => {
  it("only lists what the plugin generated, not loose vault images", () => {
    expect(rankArtifacts(vault).map((x) => x.basename)).toEqual([
      "1800-speech",
      "1900-clip",
      "1700-cat",
    ]);
  });

  it("hides the .md sidecar because it is metadata, not an artifact", () => {
    expect(rankArtifacts(vault).some((x) => x.extension === "md")).toBe(false);
  });

  it("puts the most recent first", () => {
    expect(rankArtifacts(vault)[0].mtime).toBe(50);
  });

  it("honors the limit", () => {
    expect(rankArtifacts(vault, 2)).toHaveLength(2);
  });
});

describe("isImageExt", () => {
  it("recognizes images and does not confuse them with audio", () => {
    expect(isImageExt("PNG")).toBe(true);
    expect(isImageExt("webp")).toBe(true);
    expect(isImageExt("mp3")).toBe(false);
  });
});

describe("htmlToText", () => {
  it("drops script and style", () => {
    const t = htmlToText(
      "<style>p{color:red}</style><p>hi</p><script>alert(1)</script>"
    );
    expect(t).toBe("hi");
    expect(t).not.toContain("alert");
  });

  it("breaks lines where blocks close", () => {
    expect(htmlToText("<h1>Title</h1><p>one</p><p>two</p>")).toBe(
      "Title\none\ntwo"
    );
  });

  it("decodes the common entities", () => {
    expect(htmlToText("<p>a &amp; b &lt;c&gt; &quot;d&quot;</p>")).toBe(
      'a & b <c> "d"'
    );
  });

  it("truncates oversized content and marks the cut", () => {
    const t = htmlToText("<p>" + "x".repeat(30000) + "</p>", 100);
    expect(t.endsWith("[…]")).toBe(true);
    expect(t.length).toBeLessThan(200);
  });
});

describe("htmlTitle", () => {
  it("extracts the title", () => {
    expect(htmlTitle("<html><title> My  page </title>")).toBe(
      "My page"
    );
  });
  it("returns null without a title", () => {
    expect(htmlTitle("<html><body>nothing</body>")).toBeNull();
  });
});

describe("normalizeUrl", () => {
  it("adds the https nobody types", () => {
    expect(normalizeUrl("obsidian.md")).toBe("https://obsidian.md/");
  });
  it("keeps an already complete URL", () => {
    expect(normalizeUrl("http://x.com/a?b=1")).toBe("http://x.com/a?b=1");
  });
  it("does not turn plain text into a link", () => {
    expect(normalizeUrl("summarize this note")).toBeNull();
    expect(normalizeUrl("")).toBeNull();
  });
});

describe("linkNote", () => {
  it("puts the source URL on the first line so the answer can cite it", () => {
    const att = linkNote("https://x.com", "Title", "body");
    expect(att.type).toBe("note");
    expect(att.path).toBe("Title — https://x.com");
    expect(att.content.split("\n")[0]).toBe("Source: https://x.com");
    expect(att.content).toContain("body");
  });

  it("uses the URL as the label when there is no title", () => {
    expect(linkNote("https://x.com", null, "c").path).toBe("https://x.com");
  });
});

describe("attachmentLabel", () => {
  it("shows the title for a titled link", () => {
    expect(attachmentLabel(linkNote("https://x.com/a/b", "Spaced repetition", "c"))).toBe(
      "Spaced repetition"
    );
  });

  it("shows the host for an untitled link", () => {
    expect(attachmentLabel(linkNote("https://wikipedia.org/spaced", null, "c"))).toBe(
      "wikipedia.org"
    );
  });

  it("shows the file name for a vault note", () => {
    expect(
      attachmentLabel({ type: "note", path: "PROJECTS/FRAMEWORKS.md", content: "" })
    ).toBe("FRAMEWORKS.md");
  });

  it("shows the file name for an image", () => {
    expect(
      attachmentLabel({ type: "image", dataUrl: "data:,", name: "print.png" })
    ).toBe("print.png");
  });
});

describe("artifactIcon", () => {
  it("picks an icon per media type", () => {
    expect(artifactIcon("png")).toBe("image");
    expect(artifactIcon("mp4")).toBe("file-video");
    expect(artifactIcon("mp3")).toBe("file-audio");
  });
});

describe("attachmentThumb", () => {
  it("shows the real thumbnail for an image", () => {
    expect(
      attachmentThumb({ type: "image", dataUrl: "data:image/png;base64,AA" })
    ).toEqual({ kind: "image", url: "data:image/png;base64,AA" });
  });

  it("gives links, pasted text and vault notes different emojis", () => {
    const link = attachmentThumb(linkNote("https://x.com", "T", "c"));
    const pasted = attachmentThumb({
      type: "note",
      path: "Pasted text (5.2k)",
      content: "x",
    });
    const note = attachmentThumb({
      type: "note",
      path: "PROJECTS/FRAMEWORKS.md",
      content: "x",
    });
    expect([link, pasted, note].map((t) => t.kind)).toEqual([
      "emoji",
      "emoji",
      "emoji",
    ]);
    const chars = [link, pasted, note].map((t) =>
      t.kind === "emoji" ? t.char : ""
    );
    expect(new Set(chars).size).toBe(3);
  });

  it("gives PDF and audio their own emoji", () => {
    expect(attachmentThumb({ type: "pdf", name: "a.pdf" })).toEqual({
      kind: "emoji",
      char: "📕",
    });
    expect(attachmentThumb({ type: "audio", path: "a.webm" })).toEqual({
      kind: "emoji",
      char: "🎙️",
    });
  });
});

describe("noteKind", () => {
  it("tells link, pasted and vault notes apart", () => {
    expect(noteKind("Title — https://x.com")).toBe("link");
    expect(noteKind("https://x.com")).toBe("link");
    expect(noteKind("Pasted text (5.2k)")).toBe("pasted");
    expect(noteKind("PROJECTS/FRAMEWORKS.md")).toBe("vault");
  });
});
