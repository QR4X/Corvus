import { Platform, type App, type DataAdapter } from "obsidian";
import { ensureFolder } from "../core/chatPersistence";
import type {
  IndexFile,
  SearchResult,
  StoredEntry,
  VectorEntry,
} from "./types";
import {
  base64ToTypedArray,
  quantizeEmbedding,
  scoreVectors,
  typedArrayToBase64,
  type QuantPrecision,
} from "./quant";

const INDEX_FILENAME_DESKTOP = "embeddings.json";
const INDEX_FILENAME_MOBILE = "embeddings.mobile.json";

export function indexFileName(): string {
  return Platform.isMobile ? INDEX_FILENAME_MOBILE : INDEX_FILENAME_DESKTOP;
}

const SHARDED_VERSION = 2;

export const RAG_SHARD_SIZE = 400;

const SHARD_TARGET_BYTES = 4 * 1024 * 1024;

function indexBaseName(): string {
  return Platform.isMobile ? "embeddings.mobile" : "embeddings";
}
function manifestFileName(): string {
  return `${indexBaseName()}.manifest.json`;
}
export function manifestFilePath(indexPath: string): string {
  return `${indexPath}/${manifestFileName()}`;
}
function shardFileName(gen: string, i: number): string {
  return `${indexBaseName()}.${gen}.shard${i}.json`;
}

interface ShardManifest {
  version: number;
  sharded: true;
  provider: string;
  model: string;
  dim: number;
  precision: QuantPrecision;
  profile: string;
  lastIndexedAt: string;
  fileCount: number;
  totalEntries: number;
  shardCount: number;
  shardSize: number;

  shards: string[];
}

const INDEX_VERSION = 2;

export class VectorIndex {
  provider: string;
  model: string;
  dim: number;
  precision: QuantPrecision;
  profile: string;
  entries: VectorEntry[];
  lastIndexedAt: string;

  streamed = false;
  private _adapter: DataAdapter | null = null;
  private _indexPath = "";
  private _shards: string[] = [];
  private _streamedSize = 0;
  private _streamedFileCount = 0;

  constructor(opts: {
    provider: string;
    model: string;
    dim: number;
    precision: QuantPrecision;
    profile: string;
    entries?: VectorEntry[];
    lastIndexedAt?: string;
  }) {
    this.provider = opts.provider;
    this.model = opts.model;
    this.dim = opts.dim;
    this.precision = opts.precision;
    this.profile = opts.profile;
    this.entries = opts.entries ?? [];
    this.lastIndexedAt = opts.lastIndexedAt ?? "";
  }

  setStreamed(adapter: DataAdapter, indexPath: string, manifest: ShardManifest) {
    this.streamed = true;
    this._adapter = adapter;
    this._indexPath = indexPath;
    this._shards = manifest.shards;
    this._streamedSize = manifest.totalEntries;
    this._streamedFileCount = manifest.fileCount;
  }

  get size(): number {
    return this.streamed ? this._streamedSize : this.entries.length;
  }

  get fileCount(): number {
    if (this.streamed) return this._streamedFileCount;
    return new Set(this.entries.map((e) => e.path)).size;
  }

  hashMap(): Map<string, string> {
    const map = new Map<string, string>();
    for (const e of this.entries) {
      if (!map.has(e.path)) map.set(e.path, e.hash);
    }
    return map;
  }

  replaceFile(path: string, newEntries: VectorEntry[]) {
    this.entries = this.entries.filter((e) => e.path !== path);
    this.entries.push(...newEntries);
  }

  pruneToPaths(keepSet: Set<string>) {
    this.entries = this.entries.filter((e) => keepSet.has(e.path));
  }

  clear() {
    this.entries = [];
    this.lastIndexedAt = "";
  }

  search(queryRaw: number[], topK = 5, minScore = 0.3): SearchResult[] {
    const q = quantizeEmbedding(queryRaw, this.precision);
    const scored: SearchResult[] = [];
    for (const entry of this.entries) {
      const score = scoreVectors(q, entry.embedding, this.precision);
      if (score >= minScore) scored.push({ entry, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  async searchStreamed(
    queryRaw: number[],
    topK = 5,
    minScore = 0.3
  ): Promise<SearchResult[]> {
    if (!this._adapter) return [];
    const q = quantizeEmbedding(queryRaw, this.precision);
    let top: SearchResult[] = [];
    for (const shardName of this._shards) {
      let parsed: { entries: StoredEntry[] };
      try {
        const raw = await this._adapter.read(`${this._indexPath}/${shardName}`);
        parsed = JSON.parse(raw) as { entries: StoredEntry[] };
      } catch (err) {

        console.warn(`[corvus/rag] unreadable shard, skipping: ${shardName}`, err);
        continue;
      }
      for (const s of parsed.entries) {
        let embedding: Float32Array | Int8Array;
        try {
          embedding = base64ToTypedArray(s.emb, this.precision);
        } catch {
          continue; 
        }

        if (embedding.length !== q.length) continue;
        const score = scoreVectors(q, embedding, this.precision);
        if (score >= minScore) {
          top.push({
            entry: {
              path: s.path,
              hash: s.hash,
              chunkIndex: s.chunkIndex,
              chunkCount: s.chunkCount,
              text: s.text,
              kind: s.kind,
              embedding,
            },
            score,
          });
        }
      }

      if (top.length > topK) {
        top.sort((a, b) => b.score - a.score);
        top = top.slice(0, topK);
      }
    }
    top.sort((a, b) => b.score - a.score);
    return top.slice(0, topK);
  }
}

export function indexFilePath(indexPath: string): string {
  return `${indexPath}/${indexFileName()}`;
}

export async function loadIndex(
  adapter: DataAdapter,
  indexPath: string,
  opts?: { maxBytes?: number; onSkip?: (sizeMB: number) => void }
): Promise<VectorIndex | null> {

  const manifestPath = manifestFilePath(indexPath);
  if (await adapter.exists(manifestPath)) {
    try {
      const manifest = JSON.parse(
        await adapter.read(manifestPath)
      ) as ShardManifest;

      const shardNames = manifest.shards ?? [];
      const present = await Promise.all(
        shardNames.map((s) => adapter.exists(`${indexPath}/${s}`))
      );
      const missingIdx = present.findIndex((ok) => !ok);
      if (missingIdx !== -1) {
        console.warn(
          `[corvus/rag] incomplete sharded index — missing shard: ${shardNames[missingIdx]}. Please reindex.`
        );
        return null;
      }
      const idx = new VectorIndex({
        provider: manifest.provider,
        model: manifest.model,
        dim: manifest.dim,
        precision: manifest.precision,
        profile: manifest.profile,
        lastIndexedAt: manifest.lastIndexedAt,
      });
      idx.setStreamed(adapter, indexPath, manifest);
      return idx;
    } catch (err) {
      console.error("[corvus/rag] invalid sharded manifest:", err);
      return null;
    }
  }

  const path = indexFilePath(indexPath);
  if (!(await adapter.exists(path))) return null;

  if (opts?.maxBytes) {
    try {
      const st = await adapter.stat(path);
      if (st && st.size > opts.maxBytes) {
        const mb = st.size / (1024 * 1024);
        console.warn(
          `[corvus/rag] index ${mb.toFixed(1)}MB > cap ${(opts.maxBytes / (1024 * 1024)).toFixed(0)}MB — skipping semantic load (RAG via keyword).`
        );
        opts.onSkip?.(mb);
        return null;
      }
    } catch { void 0; }
  }
  try {
    const raw = await adapter.read(path);
    const parsed = JSON.parse(raw) as IndexFile;
    if (parsed.version !== INDEX_VERSION) {
      console.warn(
        `[corvus/rag] index version ${parsed.version} != ${INDEX_VERSION} — discarding (reindex from scratch).`
      );
      return null;
    }
    const precision: QuantPrecision = parsed.precision ?? "float32";
    const entries: VectorEntry[] = parsed.entries.map((s: StoredEntry) => ({
      path: s.path,
      hash: s.hash,
      chunkIndex: s.chunkIndex,
      chunkCount: s.chunkCount,
      text: s.text,
      kind: s.kind,
      embedding: base64ToTypedArray(s.emb, precision),
    }));
    return new VectorIndex({
      provider: parsed.provider,
      model: parsed.model,
      dim: parsed.dim,
      precision,
      profile: parsed.profile ?? "balanced",
      entries,
      lastIndexedAt: parsed.lastIndexedAt,
    });
  } catch (err) {
    console.error("[corvus/rag] failed to parse index:", err);
    return null;
  }
}

function toStored(e: VectorEntry): StoredEntry {
  return {
    path: e.path,
    hash: e.hash,
    chunkIndex: e.chunkIndex,
    chunkCount: e.chunkCount,
    text: e.text,
    kind: e.kind,
    emb: typedArrayToBase64(e.embedding),
  };
}

export async function saveIndex(
  app: App,
  indexPath: string,
  index: VectorIndex,
  opts?: { shardSize?: number }
): Promise<void> {
  const adapter = app.vault.adapter;
  await ensureFolder(adapter, indexPath);
  const shardSize = opts?.shardSize ?? 0;

  if (shardSize > 0) {

    const manifestPath = manifestFilePath(indexPath);
    let oldShards: string[] = [];
    try {
      if (await adapter.exists(manifestPath)) {
        oldShards =
          (JSON.parse(await adapter.read(manifestPath)) as ShardManifest)
            .shards ?? [];
      }
    } catch { void 0; }

    const gen = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const shards: string[] = [];
    let cur: StoredEntry[] = [];
    let curBytes = 0;
    const flush = async () => {
      if (cur.length === 0) return;
      const name = shardFileName(gen, shards.length);
      await adapter.write(
        `${indexPath}/${name}`,
        JSON.stringify({ entries: cur })
      );
      shards.push(name);
      cur = [];
      curBytes = 0;
    };

    for (const e of index.entries) {
      const s = toStored(e);

      const sz = s.emb.length + Math.ceil(s.text.length * 1.3) + s.path.length + 160; 
      if (
        cur.length > 0 &&
        (curBytes + sz > SHARD_TARGET_BYTES || cur.length >= shardSize)
      ) {
        await flush();
      }
      cur.push(s);
      curBytes += sz;
    }
    await flush();

    const manifest: ShardManifest = {
      version: SHARDED_VERSION,
      sharded: true,
      provider: index.provider,
      model: index.model,
      dim: index.dim,
      precision: index.precision,
      profile: index.profile,
      lastIndexedAt: index.lastIndexedAt,
      fileCount: index.fileCount,
      totalEntries: index.entries.length,
      shardCount: shards.length,
      shardSize,
      shards,
    };

    await adapter.write(manifestPath, JSON.stringify(manifest));

    const keep = new Set(shards);
    for (const old of oldShards) {
      if (keep.has(old)) continue;
      const p = `${indexPath}/${old}`;
      try {
        if (await adapter.exists(p)) await adapter.remove(p);
      } catch { void 0; }
    }
    const single = indexFilePath(indexPath);
    try {
      if (await adapter.exists(single)) await adapter.remove(single);
    } catch { void 0; }
    return;
  }

  await removeShardedFiles(adapter, indexPath);
  const payload: IndexFile = {
    version: INDEX_VERSION,
    provider: index.provider,
    model: index.model,
    dim: index.dim,
    precision: index.precision,
    profile: index.profile,
    lastIndexedAt: index.lastIndexedAt,
    fileCount: index.fileCount,
    entries: index.entries.map(toStored),
  };
  await adapter.write(indexFilePath(indexPath), JSON.stringify(payload));
}

async function removeShardedFiles(
  adapter: DataAdapter,
  indexPath: string
): Promise<void> {
  const manifestPath = manifestFilePath(indexPath);
  if (!(await adapter.exists(manifestPath))) return;
  try {
    const manifest = JSON.parse(await adapter.read(manifestPath)) as ShardManifest;
    for (const s of manifest.shards ?? []) {
      const p = `${indexPath}/${s}`;
      if (await adapter.exists(p)) await adapter.remove(p);
    }
  } catch { void 0; }
  if (await adapter.exists(manifestPath)) await adapter.remove(manifestPath);
}

export async function deleteIndex(
  adapter: DataAdapter,
  indexPath: string
): Promise<void> {
  const path = indexFilePath(indexPath);
  if (await adapter.exists(path)) {
    await adapter.remove(path);
  }
  await removeShardedFiles(adapter, indexPath);
}
