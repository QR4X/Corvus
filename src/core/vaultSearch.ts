import type { App } from "obsidian";

export interface VaultMatch {
  path: string;
  title: string;
  excerpt: string;
  score: number;
}

const STOPWORDS_EN = new Set([
  "the", "an", "is", "are", "was", "were", "be", "been", "have", "has", "had",
  "to", "of", "in", "on", "at", "by", "for", "with", "from", "as", "and", "or",
  "but", "if", "this", "that", "these", "those", "it", "its", "they", "them",
]);

export function foldText(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function extractKeywords(query: string): string[] {
  return foldText(query)
    .split(/\s+/)
    .map((w) => w.replace(/[^\w]/g, ""))
    .filter((w) => w.length >= 3 && !STOPWORDS_EN.has(w))
    .filter((w, i, arr) => arr.indexOf(w) === i);
}

function extractExcerpt(content: string, keywords: string[], maxLen: number): string {

  const lc = foldText(content);
  let bestStart = 0;
  for (const kw of keywords) {
    const idx = lc.indexOf(kw);
    if (idx !== -1) {
      bestStart = Math.max(0, idx - 120);
      break;
    }
  }
  const end = Math.min(content.length, bestStart + maxLen);
  let excerpt = content.slice(bestStart, end).trim();
  if (bestStart > 0) excerpt = "…" + excerpt;
  if (end < content.length) excerpt = excerpt + "…";
  return excerpt;
}

export async function searchVault(
  app: App,
  query: string,
  limit: number = 5,
  excerptLen: number = 500
): Promise<VaultMatch[]> {
  const keywords = extractKeywords(query);
  if (keywords.length === 0) return [];

  const files = app.vault.getMarkdownFiles();
  const matches: VaultMatch[] = [];

  for (const file of files) {
    try {
      const content = await app.vault.cachedRead(file);

      const lcContent = foldText(content);
      const lcTitle = foldText(file.basename);
      let score = 0;

      for (const kw of keywords) {

        if (lcTitle.includes(kw)) score += 5;

        try {
          const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
          const occurrences = (lcContent.match(re) || []).length;
          score += occurrences;
        } catch {

          if (lcContent.includes(kw)) score += 1;
        }
      }

      if (score > 0) {
        matches.push({
          path: file.path,
          title: file.basename,
          excerpt: extractExcerpt(content, keywords, excerptLen),
          score,
        });
      }
    } catch { void 0; }
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, limit);
}
