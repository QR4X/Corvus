import type { App, TFile } from "obsidian";
import type { VectorIndex } from "./vectorIndex";
import { embedQuery, type EmbedCredentials } from "./embeddings";
import { searchVault } from "../core/vaultSearch";

export interface HybridHit {
  path: string;

  text: string;

  score: number;

  via: string;
}

const RRF_K = 60;

const GRAPH_BOOST = 1 / (RRF_K * 4);

export interface HybridOptions {
  app: App;
  index: VectorIndex | null;
  creds: EmbedCredentials;
  query: string;
  topK: number;

  excerptChars?: number;

  useGraph?: boolean;
}

export async function hybridSearch(opts: HybridOptions): Promise<HybridHit[]> {
  const {
    app,
    index,
    creds,
    query,
    topK,
    excerptChars = 500,
    useGraph = true,
  } = opts;

  const acc = new Map<
    string,
    { rrf: number; text: string; via: Set<string> }
  >();
  const bump = (path: string, rank: number, text: string, via: string) => {
    const cur = acc.get(path) ?? { rrf: 0, text: "", via: new Set<string>() };
    cur.rrf += 1 / (RRF_K + rank);
    cur.via.add(via);
    if (!cur.text && text) cur.text = text;
    acc.set(path, cur);
  };

  if (index && index.size > 0) {
    try {
      const vec = await embedQuery(query, creds, index.model, index.dim);

      const sem = index.streamed
        ? await index.searchStreamed(vec, topK * 3, 0.3)
        : index.search(vec, topK * 3, 0.3);

      const seen = new Set<string>();
      let rank = 0;
      for (const r of sem) {
        if (seen.has(r.entry.path)) continue;
        seen.add(r.entry.path);
        bump(r.entry.path, rank++, r.entry.text.slice(0, excerptChars), "semantic");
      }
    } catch (err) {

      console.warn("[corvus/rag] semantic search failed, falling back to keyword:", err);
    }
  }

  const kw = await searchVault(app, query, topK * 3, excerptChars);
  kw.forEach((m, rank) => bump(m.path, rank, m.excerpt, "keyword"));

  let hits: HybridHit[] = Array.from(acc.entries()).map(([path, v]) => ({
    path,
    text: v.text,
    score: v.rrf,
    via: Array.from(v.via).sort().join("+"),
  }));

  if (useGraph && hits.length > 1) {
    const inResults = new Set(hits.map((h) => h.path));
    const scoreBoost = new Map<string, number>();
    for (const h of hits) {
      const file = app.vault.getAbstractFileByPath(h.path) as TFile | null;
      if (!file) continue;
      const links = app.metadataCache.getFileCache(file)?.links ?? [];
      for (const l of links) {
        const dest = app.metadataCache.getFirstLinkpathDest(l.link, h.path);
        if (dest && dest.path !== h.path && inResults.has(dest.path)) {

          scoreBoost.set(dest.path, (scoreBoost.get(dest.path) ?? 0) + GRAPH_BOOST);
        }
      }
    }
    if (scoreBoost.size > 0) {
      hits = hits.map((h) => ({
        ...h,
        score: h.score + (scoreBoost.get(h.path) ?? 0),
      }));
    }
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, topK);
}
