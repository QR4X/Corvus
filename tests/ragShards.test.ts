import { describe, it, expect } from "vitest";
import {
  VectorIndex,
  saveIndex,
  loadIndex,
  deleteIndex,
  manifestFilePath,
} from "../src/rag/vectorIndex";
import { quantizeEmbedding } from "../src/rag/quant";
import type { VectorEntry } from "../src/rag/types";
import type { App, DataAdapter } from "obsidian";

function memAdapter() {
  const files = new Map<string, string>();
  const adapter = {
    files,
    exists: async (p: string) => files.has(p),
    read: async (p: string) => {
      const v = files.get(p);
      if (v === undefined) throw new Error("ENOENT " + p);
      return v;
    },
    write: async (p: string, c: string) => {
      files.set(p, c);
    },
    remove: async (p: string) => {
      files.delete(p);
    },
    stat: async (p: string) =>
      files.has(p)
        ? { type: "file", ctime: 0, mtime: 0, size: files.get(p)!.length }
        : null,
    mkdir: async () => {},
  };
  return adapter;
}

const mk = (raw: number[]): Float32Array =>
  quantizeEmbedding(raw, "float32") as Float32Array;

function entry(path: string, raw: number[]): VectorEntry {
  return {
    path,
    hash: "h-" + path,
    chunkIndex: 0,
    chunkCount: 1,
    text: "text of " + path,
    kind: "text",
    embedding: mk(raw),
  };
}

function buildIndex(): VectorIndex {
  return new VectorIndex({
    provider: "openai",
    model: "text-embedding-3-small",
    dim: 4,
    precision: "float32",
    profile: "precision",
    entries: [
      entry("a.md", [1, 0, 0, 0]),
      entry("b.md", [0, 1, 0, 0]),
      entry("c.md", [0.8, 0.6, 0, 0]),
    ],
  });
}

const PATH = "corvus-ai/index";

describe("sharded index save, load and streamed search", () => {
  it("writes a manifest and one file per shard", async () => {
    const adapter = memAdapter();
    const app = { vault: { adapter } } as unknown as App;
    await saveIndex(app, PATH, buildIndex(), { shardSize: 2 });

    expect(adapter.files.has(manifestFilePath(PATH))).toBe(true);
    const manifest = JSON.parse(adapter.files.get(manifestFilePath(PATH))!);
    expect(manifest.sharded).toBe(true);
    expect(manifest.totalEntries).toBe(3);
    expect(manifest.shardCount).toBe(2);
    expect(manifest.shards).toHaveLength(2);

    for (const s of manifest.shards) {
      expect(adapter.files.has(`${PATH}/${s}`)).toBe(true);
    }

    expect(adapter.files.has(`${PATH}/embeddings.json`)).toBe(false);
  });

  it("loads a manifest as a streamed index without entries in memory", async () => {
    const adapter = memAdapter();
    const app = { vault: { adapter } } as unknown as App;
    await saveIndex(app, PATH, buildIndex(), { shardSize: 2 });

    const loaded = await loadIndex(adapter as unknown as DataAdapter, PATH);
    expect(loaded).not.toBeNull();
    expect(loaded!.streamed).toBe(true);
    expect(loaded!.size).toBe(3);
    expect(loaded!.entries).toHaveLength(0);
    expect(loaded!.model).toBe("text-embedding-3-small");
    expect(loaded!.dim).toBe(4);
  });

  it("returns the same order as the in-memory search across shards", async () => {
    const adapter = memAdapter();
    const app = { vault: { adapter } } as unknown as App;
    const inMem = buildIndex();
    await saveIndex(app, PATH, inMem, { shardSize: 2 });

    const loaded = await loadIndex(adapter as unknown as DataAdapter, PATH);
    const query = [1, 0, 0, 0];
    const streamed = await loaded!.searchStreamed(query, 2, 0);
    const memory = inMem.search(query, 2, 0);

    expect(streamed.map((r) => r.entry.path)).toEqual(["a.md", "c.md"]);
    expect(streamed.map((r) => r.entry.path)).toEqual(
      memory.map((r) => r.entry.path)
    );
    expect(streamed[0].score).toBeCloseTo(1.0, 4);
    expect(streamed[1].score).toBeCloseTo(0.8, 3);
  });

  it("deletes the manifest and every shard", async () => {
    const adapter = memAdapter();
    const app = { vault: { adapter } } as unknown as App;
    await saveIndex(app, PATH, buildIndex(), { shardSize: 2 });
    expect(adapter.files.size).toBeGreaterThan(0);

    await deleteIndex(adapter as unknown as DataAdapter, PATH);

    const leftover = [...adapter.files.keys()].filter((k) =>
      k.includes("embeddings")
    );
    expect(leftover).toEqual([]);
  });

  it("leaves no orphan shards after saving twice", async () => {
    const adapter = memAdapter();
    const app = { vault: { adapter } } as unknown as App;
    await saveIndex(app, PATH, buildIndex(), { shardSize: 2 });
    await saveIndex(app, PATH, buildIndex(), { shardSize: 2 });
    const manifest = JSON.parse(adapter.files.get(manifestFilePath(PATH))!);
    const shardFiles = [...adapter.files.keys()].filter((k) =>
      k.includes(".shard")
    );

    expect(shardFiles).toHaveLength(manifest.shardCount);
    for (const s of manifest.shards) {
      expect(adapter.files.has(`${PATH}/${s}`)).toBe(true);
    }
  });

  it("returns null instead of an incomplete index when a shard is missing", async () => {
    const adapter = memAdapter();
    const app = { vault: { adapter } } as unknown as App;
    await saveIndex(app, PATH, buildIndex(), { shardSize: 2 });
    const manifest = JSON.parse(adapter.files.get(manifestFilePath(PATH))!);
    adapter.files.delete(`${PATH}/${manifest.shards[0]}`);
    const loaded = await loadIndex(adapter as unknown as DataAdapter, PATH);
    expect(loaded).toBeNull();
  });

  it("splits shards by byte budget so large chunks force more shards than the count", async () => {
    const adapter = memAdapter();
    const app = { vault: { adapter } } as unknown as App;

    const big = "x".repeat(1_500_000);
    const entries: VectorEntry[] = Array.from({ length: 5 }, (_, i) => ({
      path: `n${i}.md`,
      hash: "h" + i,
      chunkIndex: 0,
      chunkCount: 1,
      text: big,
      kind: "text",
      embedding: mk([1, 0, 0, 0]),
    }));
    const idx = new VectorIndex({
      provider: "openai",
      model: "m",
      dim: 4,
      precision: "float32",
      profile: "precision",
      entries,
    });
    await saveIndex(app, PATH, idx, { shardSize: 1000 });
    const manifest = JSON.parse(adapter.files.get(manifestFilePath(PATH))!);
    expect(manifest.shardCount).toBeGreaterThanOrEqual(3);
  });

  it("switching from sharded to single file removes the shards", async () => {
    const adapter = memAdapter();
    const app = { vault: { adapter } } as unknown as App;
    await saveIndex(app, PATH, buildIndex(), { shardSize: 2 });
    await saveIndex(app, PATH, buildIndex());

    expect(adapter.files.has(manifestFilePath(PATH))).toBe(false);
    expect(adapter.files.has(`${PATH}/embeddings.json`)).toBe(true);

    const loaded = await loadIndex(adapter as unknown as DataAdapter, PATH);
    expect(loaded!.streamed).toBe(false);
    expect(loaded!.size).toBe(3);
  });
});
