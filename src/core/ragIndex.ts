import { Notice, Platform, type App, type TAbstractFile } from "obsidian";
import type { CorvusSettings } from "../settings";
import { VectorIndex, loadIndex, RAG_SHARD_SIZE } from "../rag/vectorIndex";
import { indexVault, type IndexerOptions } from "../rag/indexer";
import { tr } from "../i18n/tr";

const AUTO_REINDEX_DELAY_MS = 4000;
const MOBILE_MAX_INDEX_BYTES = 16 * 1024 * 1024;

interface RagIndexHost {
  app: App;
  settings(): CorvusSettings;
  save(): Promise<void>;
  notify(): void;
}

const isAbort = (err: unknown) => err instanceof DOMException && err.name === "AbortError";

export class RagIndex {
  index: VectorIndex | null = null;
  indexing: AbortController | null = null;
  private autoTimer: number | null = null;
  private autoController: AbortController | null = null;

  constructor(private readonly host: RagIndexHost) {}

  private options(signal: AbortSignal): IndexerOptions {
    const s = this.host.settings();
    return {
      app: this.host.app,
      creds: s,
      model: s.ragEmbeddingModel,
      profile: s.ragQuantProfile,
      indexPath: s.ragIndexPath,
      excludePaths: [s.ragIndexPath, s.chatsPath],
      shardSize: s.ragStreamShards ? RAG_SHARD_SIZE : 0,
      signal,
    };
  }

  async run(): Promise<void> {
    if (this.indexing) {
      this.indexing.abort();
      return;
    }
    this.indexing = new AbortController();
    this.host.notify();
    const notice = new Notice(tr("Indexing vault…"), 0);
    try {
      this.index = await indexVault(this.index, {
        ...this.options(this.indexing.signal),
        onProgress: (p) => {
          const n = { done: p.filesEmbedded, total: p.filesToEmbed, chunks: p.chunksEmbedded };
          notice.setMessage(
            p.phase === "scanning"
              ? tr("Indexing (scanning): {done}/{total} files · {chunks} chunks", n)
              : p.phase === "embedding"
                ? tr("Indexing (embedding): {done}/{total} files · {chunks} chunks", n)
                : tr("Indexing (done): {done}/{total} files · {chunks} chunks", n)
          );
        },
      });
      notice.hide();
      const chunks = this.index.size;
      new Notice(chunks === 1 ? tr("Index ready: 1 chunk.") : tr("Index ready: {n} chunks.", { n: chunks }));
    } catch (err) {
      notice.hide();
      if (isAbort(err)) {
        new Notice(tr("Indexing cancelled."));
      } else {
        console.error("[corvus] indexVault failed:", err);
        new Notice(
          tr("Indexing failed: {error}", { error: err instanceof Error ? err.message : String(err) })
        );
      }
    } finally {
      this.indexing = null;
      this.host.notify();
    }
  }

  async load(): Promise<void> {
    this.index = null;
    const s = this.host.settings();
    const mobileGuard = Platform.isMobile
      ? {
          maxBytes: MOBILE_MAX_INDEX_BYTES,
          onSkip: (mb: number) => {
            if (s.ragMobileSkipNoticeShown) return;
            new Notice(
              tr(
                "RAG index too large for mobile ({mb} MB) — semantic search is off here to avoid a crash. Use desktop or shrink the index.",
                { mb: mb.toFixed(0) }
              )
            );
            s.ragMobileSkipNoticeShown = true;
            void this.host.save();
          },
        }
      : undefined;
    try {
      this.index = await loadIndex(this.host.app.vault.adapter, s.ragIndexPath, mobileGuard);
    } catch (err) {
      console.error("[corvus] failed to load RAG index:", err);
    }
  }

  scheduleAutoReindex(file: TAbstractFile): void {
    if (!this.autoReindexOn() || !file?.path?.endsWith(".md")) return;
    if (this.autoTimer !== null) window.clearTimeout(this.autoTimer);
    this.autoTimer = window.setTimeout(() => void this.autoReindex(), AUTO_REINDEX_DELAY_MS);
  }

  dispose(): void {
    if (this.autoTimer !== null) window.clearTimeout(this.autoTimer);
    this.autoTimer = null;
    this.autoController?.abort();
    this.autoController = null;
  }

  private autoReindexOn(): boolean {
    return this.host.settings().ragAutoReindex && !!this.index && this.index.size > 0;
  }

  private async autoReindex(): Promise<void> {
    this.autoTimer = null;
    if (!this.autoReindexOn()) return;
    this.autoController?.abort();
    this.autoController = new AbortController();
    try {
      this.index = await indexVault(this.index, this.options(this.autoController.signal));
    } catch (err) {
      if (!isAbort(err)) console.error("[corvus] auto-reindex failed:", err);
    }
  }
}
