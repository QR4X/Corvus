const MAX_PREVIEW_CHARS = 240;

export function previewFromMarkdown(content: string): string {
  const sections = content.split(/^## (?:You|Assistant)\s*$/m);

  if (sections.length < 2) return "";
  for (let i = sections.length - 1; i >= 1; i--) {
    const text = previewFromText(sections[i]);
    if (text) return text;
  }
  return "";
}

export function previewFromText(raw: string): string {
  return stripMarkdown(raw).slice(0, MAX_PREVIEW_CHARS);
}

const MARKER = String.fromCharCode(0xe000);
const STASHED = new RegExp(`${MARKER}(\\d+)${MARKER}`, "g");

function stripMarkdown(raw: string): string {

  const stash: string[] = [];
  const keep = (_: string, c: string) => `${MARKER}${stash.push(c) - 1}${MARKER}`;
  const text = raw

    .replace(/<!--[\s\S]*?-->/g, " ")

    .replace(/^```.*$/gm, " ")

    .replace(/^\s{0,3}(?:[#>]+|[-*+]|\d+\.)\s+/gm, " ")
    .replace(/`([^`\n]+)`/g, keep)

    .replace(/\\([\\`*_{}[\]()#+\-.!~=|>])/g, keep)

    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/!\[\[[^\]]*\]\]/g, " ")

    .replace(/\[\[[^\]|]*\|([^\]]+)\]\]/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, (_, target: string) => target.replace(/#\^?/g, " > "))

    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")

    .replace(/\*\*(?=\S)([^*\n]*?\S)\*\*/g, "$1")
    .replace(/(^|[^\w])__(?=\S)([^_\n]*?\S)__(?!\w)/g, "$1$2")
    .replace(/(^|[^\w*])\*(?=\S)([^*\n]*?[^\s*])\*(?![\w*])/g, "$1$2")
    .replace(/(^|[^\w])_(?=\S)([^_\n]*?[^\s_])_(?!\w)/g, "$1$2")
    .replace(/~~(?=\S)([^~\n]*?\S)~~/g, "$1")
    .replace(/==(?=\S)([^=\n]*?\S)==/g, "$1")

    .replace(/<\/?[a-zA-Z][^<>]*>/g, " ")
    .replace(STASHED, (_, i: string) => stash[Number(i)] ?? "");
  return text.replace(/\s+/g, " ").trim();
}
