import type { App, CachedMetadata, TFile } from "obsidian";
import {
  arrayBufferToDataUrl,
  chunkMarkdown,
  embedItems,
  estimateTokens,
  sha1Hex,
  type EmbedInput,
} from "./embeddings";
import { saveIndex, VectorIndex } from "./vectorIndex";
import { getQuantProfile, quantizeEmbedding } from "./quant";
import {
  getEmbeddingSpec,
  imageMimeFromPath,
  isImagePath,
  type VectorEntry,
} from "./types";
import { texto } from "../core/text";

export interface IndexProgress {

  phase: "scanning" | "embedding" | "done";
  filesScanned: number;
  filesTotal: number;

  filesToEmbed: number;
  filesEmbedded: number;
  chunksEmbedded: number;

  imagesEmbedded: number;

  audioSkipped: number;

  tokensUsed: number;

  currentFile?: string;
}

export interface IndexerOptions {
  app: App;

  openaiApiKey: string;
  openrouterApiKey: string;
  geminiApiKey?: string;
  nimApiKey?: string;

  ollamaEndpoint?: string;
  model: string;

  profile: string;
  indexPath: string;

  excludePaths: string[];

  onProgress?: (p: IndexProgress) => void;

  signal?: AbortSignal;

  shardSize?: number;
}

const AUDIO_EXTENSIONS = ["mp3", "wav", "webm", "m4a", "ogg", "flac"];

function isAudioPath(path: string): boolean {
  const ext = path.toLowerCase().split(".").pop() ?? "";
  return AUDIO_EXTENSIONS.includes(ext);
}

const BATCH_SIZE = 16;
const CHUNK_MAX_CHARS = 1500;
const CHUNK_OVERLAP = 200;

const SAVE_EVERY_N_FILES = 25;

function buildObsidianContext(
  file: TFile,
  cache: CachedMetadata | null
): string {
  const parts: string[] = [`Nota: ${file.basename}`];

  const fm: Record<string, unknown> | undefined = cache?.frontmatter;
  if (fm) {
    const aliases = fm.aliases ?? fm.alias;
    if (aliases) {
      const arr = (Array.isArray(aliases) ? aliases : [aliases])
        .map((a) => texto(a))
        .filter((a) => a.length > 0);
      if (arr.length) parts.push(`Aliases: ${arr.join(", ")}`);
    }
  }

  const tagSet = new Set<string>();
  const fmTags = fm?.tags ?? fm?.tag;
  if (fmTags) {
    (Array.isArray(fmTags) ? fmTags : [fmTags]).forEach((tg) => {
      const t = texto(tg).replace(/^#/, "");
      if (t) tagSet.add(t);
    });
  }
  cache?.tags?.forEach((t) => tagSet.add(t.tag.replace(/^#/, "")));
  if (tagSet.size) parts.push(`Tags: ${Array.from(tagSet).join(", ")}`);

  if (cache?.links?.length) {
    const linked = Array.from(
      new Set(cache.links.map((l) => l.displayText || l.link))
    ).slice(0, 25);
    if (linked.length) parts.push(`Links: ${linked.join(", ")}`);
  }
  return parts.join(" · ");
}

export async function indexVault(
  prev: VectorIndex | null,
  opts: IndexerOptions
): Promise<VectorIndex> {
  const {
    app,
    openaiApiKey,
    openrouterApiKey,
    geminiApiKey,
    nimApiKey,
    ollamaEndpoint,
    model,
    profile,
    indexPath,
    excludePaths,
    onProgress,
    signal,
  } = opts;
  const spec = getEmbeddingSpec(model);
  const prof = getQuantProfile(profile);
  const creds = { openaiApiKey, openrouterApiKey, geminiApiKey, nimApiKey, ollamaEndpoint };

  let effectiveDim =
    prof.targetDim > 0 && spec.supportsDimensions ? prof.targetDim : spec.dim;

  if (spec.local) {
    const [sonda] = await embedItems([{ kind: "text", text: "dimension probe" }], creds, model);
    if (sonda && sonda.length > 0) effectiveDim = sonda.length;
  }
  const embedDims = spec.supportsDimensions ? effectiveDim : undefined;

  const sharded = (opts.shardSize ?? 0) > 0;

  const startFresh =
    sharded ||
    !prev ||
    prev.streamed ||
    prev.model !== model ||
    prev.dim !== effectiveDim ||
    prev.precision !== prof.precision;
  const index = startFresh
    ? new VectorIndex({
        provider: spec.provider,
        model: spec.model,
        dim: effectiveDim,
        precision: prof.precision,
        profile: prof.id,
      })
    : prev;

  const prevHashes = startFresh ? new Map<string, string>() : prev.hashMap();

  const includedFiles: TFile[] = [];
  let audioSkipped = 0;

  function isExcluded(path: string): boolean {
    return excludePaths.some((ex) => {
      const exNorm = ex.endsWith("/") ? ex : ex + "/";
      return path === ex || path.startsWith(exNorm);
    });
  }

  for (const f of app.vault.getMarkdownFiles()) {
    if (!isExcluded(f.path)) includedFiles.push(f);
  }

  for (const f of app.vault.getFiles()) {
    if (isExcluded(f.path)) continue;
    const path = f.path;
    if (isAudioPath(path)) {
      audioSkipped++;
      continue;
    }
    if (spec.supportsImage && isImagePath(path)) {
      includedFiles.push(f);
    }
  }

  const filesTotal = includedFiles.length;
  const stillPresent = new Set(includedFiles.map((f) => f.path));

  index.pruneToPaths(stillPresent);

  type PendingFile =
    | { kind: "text"; file: TFile; content: string; hash: string }
    | { kind: "image"; file: TFile; dataUrl: string; hash: string };
  const toEmbed: PendingFile[] = [];
  let filesScanned = 0;

  for (const file of includedFiles) {
    if (signal?.aborted) throw new DOMException("cancelled", "AbortError");
    filesScanned++;

    const isImage = isImagePath(file.path);
    try {
      if (isImage) {
        const buffer = await app.vault.adapter.readBinary(file.path);
        const mime = imageMimeFromPath(file.path);
        const dataUrl = arrayBufferToDataUrl(buffer, mime);
        const hash = await sha1Hex(dataUrl);
        if (prevHashes.get(file.path) !== hash) {
          toEmbed.push({ kind: "image", file, dataUrl, hash });
        }
      } else {
        const content = await app.vault.cachedRead(file);
        if (!content.trim()) continue;
        const hash = await sha1Hex(content);
        if (prevHashes.get(file.path) !== hash) {
          toEmbed.push({ kind: "text", file, content, hash });
        }
      }
    } catch (err) {
      console.warn(`[corvus/rag] skip ${file.path}:`, err);
      continue;
    }

    onProgress?.({
      phase: "scanning",
      filesScanned,
      filesTotal,
      filesToEmbed: toEmbed.length,
      filesEmbedded: 0,
      chunksEmbedded: 0,
      imagesEmbedded: 0,
      audioSkipped,
      tokensUsed: 0,
      currentFile: file.path,
    });
  }

  if (toEmbed.length === 0) {
    index.lastIndexedAt = new Date().toISOString();
    await saveIndex(app, indexPath, index, { shardSize: opts.shardSize });
    onProgress?.({
      phase: "done",
      filesScanned: filesTotal,
      filesTotal,
      filesToEmbed: 0,
      filesEmbedded: 0,
      chunksEmbedded: 0,
      imagesEmbedded: 0,
      audioSkipped,
      tokensUsed: 0,
    });
    return index;
  }

  let filesEmbedded = 0;
  let chunksEmbedded = 0;
  let imagesEmbedded = 0;
  let tokensUsed = 0;
  let filesSinceLastSave = 0;
  const failedFiles: { path: string; error: string }[] = [];

  for (const item of toEmbed) {
    if (signal?.aborted) throw new DOMException("cancelled", "AbortError");

    try {
      const fileEntries: VectorEntry[] = [];

      if (item.kind === "text") {

        const cache = app.metadataCache.getFileCache(item.file);
        const ctxHeader = buildObsidianContext(item.file, cache);
        const chunks = chunkMarkdown(item.content, CHUNK_MAX_CHARS, CHUNK_OVERLAP);
        for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
          if (signal?.aborted) throw new DOMException("cancelled", "AbortError");
          const slice = chunks.slice(i, i + BATCH_SIZE);

          const embedTexts = slice.map((c) => {
            const prefix = [ctxHeader, c.breadcrumb].filter(Boolean).join(" · ");
            return prefix ? `${prefix}\n\n${c.text}` : c.text;
          });
          const inputs: EmbedInput[] = embedTexts.map((t) => ({
            kind: "text",
            text: t,
          }));
          const embeddings = await embedItems(inputs, creds, model, embedDims);
          for (let j = 0; j < slice.length; j++) {
            fileEntries.push({
              path: item.file.path,
              hash: item.hash,
              chunkIndex: i + j,
              chunkCount: chunks.length,
              text: slice[j].text,
              embedding: quantizeEmbedding(embeddings[j], prof.precision),
              kind: "text",
            });
            tokensUsed += estimateTokens(embedTexts[j]);
          }
        }
      } else {

        const embeddings = await embedItems(
          [{ kind: "image", dataUrl: item.dataUrl }],
          creds,
          model,
          embedDims
        );
        fileEntries.push({
          path: item.file.path,
          hash: item.hash,
          chunkIndex: 0,
          chunkCount: 1,
          text: `Image: ${item.file.name}`,
          embedding: quantizeEmbedding(embeddings[0], prof.precision),
          kind: "image",
        });
        imagesEmbedded++;
      }

      index.replaceFile(item.file.path, fileEntries);
      chunksEmbedded += fileEntries.length;
      filesEmbedded++;
      filesSinceLastSave++;

      if (filesSinceLastSave >= SAVE_EVERY_N_FILES && !sharded) {
        await saveIndex(app, indexPath, index);
        filesSinceLastSave = 0;
      }

      onProgress?.({
        phase: "embedding",
        filesScanned: filesTotal,
        filesTotal,
        filesToEmbed: toEmbed.length,
        filesEmbedded,
        chunksEmbedded,
        imagesEmbedded,
        audioSkipped,
        tokensUsed,
        currentFile: item.file.path,
      });
    } catch (err) {

      if (signal?.aborted) throw new DOMException("cancelled", "AbortError");

      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[corvus/rag] file failed: ${item.file.path}`,
        err
      );
      failedFiles.push({ path: item.file.path, error: msg });

      if (err instanceof DOMException && err.name === "AbortError") throw err;

    }
  }

  index.lastIndexedAt = new Date().toISOString();
  await saveIndex(app, indexPath, index, { shardSize: opts.shardSize });

  if (failedFiles.length > 0) {
    console.warn(
      `[corvus/rag] ${failedFiles.length} files failed during indexing:`,
      failedFiles
    );
  }

  onProgress?.({
    phase: "done",
    filesScanned: filesTotal,
    filesTotal,
    filesToEmbed: toEmbed.length,
    filesEmbedded,
    chunksEmbedded,
    imagesEmbedded,
    audioSkipped,
    tokensUsed,
  });

  return index;
}
