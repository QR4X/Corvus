import type { DataAdapter } from "obsidian";
import type { CorvusSettings } from "../settings";
import type { VectorIndex } from "../rag/vectorIndex";
import { getProvider } from "../providers";
import { enriquecerCapacidadesOllama } from "../providers/ollama";
import {
  enrichModelsFromCatalog,
  getModelInfoCache,
  hydrateModelInfoCache,
} from "../providers/modelInfoStore";
import {
  inferEmbeddingSpec,
  pareceEmbeddingDoOllama,
  registerDiscoveredEmbeddings,
  type EmbeddingProvider,
} from "../rag/types";
import { somarDescobertos } from "../rag/discovered";
import { definirGratisConhecidos } from "../usage/pricing";
import { alinharAoInstalado, listaDeFabrica } from "./ollamaDefault";
import { EMBEDDING_PROVIDERS, providerCredential } from "./providersMeta";

interface ModelScannerHost {
  adapter: DataAdapter;
  cacheFile: string;
  settings(): CorvusSettings;
  save(): Promise<void>;
  vectorIndex(): VectorIndex | null;
}

export class ModelScanner {
  constructor(private readonly host: ModelScannerHost) {}

  private get s(): CorvusSettings {
    return this.host.settings();
  }

  async start(): Promise<void> {
    await this.loadCache();
    void this.enrichActive();
    this.registerEmbeddings();
    for (const [provider, ids] of Object.entries(this.s.freeModels ?? {})) {
      definirGratisConhecidos(provider, ids);
    }
    void this.syncOllama({ onlyFactoryList: true });
  }

  async scanModels(providerId: string): Promise<string[]> {
    const p = getProvider(providerId);
    if (!p.listModels) return [];
    const endpoint = this.s.ollamaEndpoint;
    const list = await p.listModels(providerCredential(this.s, providerId));
    const stale = providerId === "ollama" && this.s.ollamaEndpoint !== endpoint;

    if (providerId === "ollama" && !stale && this.alignOllama(list)) await this.host.save();

    if (list.length > 0 && !stale) {
      this.s.discoveredModels = { ...(this.s.discoveredModels ?? {}), [providerId]: [...list] };
      await this.host.save();
    }

    await this.scanFreeModels(providerId);
    if ((await this.enrich(providerId, list)) > 0) await this.saveCache();
    return list;
  }

  async scanEmbeddings(providerId: string): Promise<string[]> {
    if (!EMBEDDING_PROVIDERS.includes(providerId)) return [];
    const p = getProvider(providerId) as {
      listEmbeddingModels?: (credential: string) => Promise<string[]>;
    };
    if (!p.listEmbeddingModels) return [];
    const endpoint = this.s.ollamaEndpoint;
    let ids: string[];
    try {
      ids = await p.listEmbeddingModels(providerCredential(this.s, providerId));
    } catch {
      return [];
    }
    if (providerId === "ollama" && this.s.ollamaEndpoint !== endpoint) return [];

    const map = this.s.discoveredEmbeddings ?? {};
    if (providerId === "ollama") {
      const index = this.host.vectorIndex();
      const inUse = [
        this.s.ragEmbeddingProvider === "ollama" ? this.s.ragEmbeddingModel : "",
        index?.provider === "ollama" ? index.model : "",
      ].filter((m) => m && !ids.includes(m));
      const next = [...ids, ...new Set(inUse)];
      const prev = map.ollama ?? [];
      if (prev.length === next.length && prev.every((m) => next.includes(m))) return ids;
      map.ollama = next;
    } else {
      if (ids.length === 0) return [];
      map[providerId] = somarDescobertos(map[providerId], ids);
    }
    this.s.discoveredEmbeddings = map;
    this.registerEmbeddings();
    await this.host.save();
    return ids;
  }

  async syncOllama(opts: { onlyFactoryList: boolean }): Promise<string[] | null> {
    const s = this.s;
    if (!s.ollamaEndpoint) return null;
    const untouched =
      listaDeFabrica(s.activeModels.ollama ?? []) &&
      (s.favoriteModels?.ollama ?? []).length === 0 &&
      s.ollamaSeenModels === undefined;
    if (opts.onlyFactoryList && !untouched) return null;
    const p = getProvider("ollama");
    if (!p.listModels) return null;
    const endpoint = s.ollamaEndpoint;
    let installed: string[];
    try {
      installed = await p.listModels(providerCredential(s, "ollama"));
    } catch {
      return null;
    }
    if (s.ollamaEndpoint !== endpoint) return null;
    if (opts.onlyFactoryList && installed.length === 0) return null;
    if (this.alignOllama(installed)) await this.host.save();
    return installed;
  }

  private alignOllama(installed: readonly string[]): boolean {
    const s = this.s;
    const before = {
      ativos: s.activeModels.ollama ?? [],
      favoritos: s.favoriteModels?.ollama ?? [],
      modelo: s.ollamaModel ?? "",
      vistos: s.ollamaSeenModels ?? null,
    };
    const after = alinharAoInstalado(before, installed, pareceEmbeddingDoOllama);
    if (JSON.stringify(before) === JSON.stringify(after)) return false;
    s.activeModels = { ...s.activeModels, ollama: [...after.ativos] };
    s.favoriteModels = { ...(s.favoriteModels ?? {}), ollama: [...after.favoritos] };
    s.ollamaModel = after.modelo;
    s.ollamaSeenModels = [...after.vistos];
    return true;
  }

  private async scanFreeModels(providerId: string): Promise<void> {
    const p = getProvider(providerId);
    if (!p.listFreeModels) return;
    const credential = providerCredential(this.s, providerId);
    try {
      const free = await p.listFreeModels(credential);
      const quota = p.freeQuota ? await p.freeQuota(credential) : null;
      if (quota) (this.s.freeQuota ??= {})[providerId] = { ...quota, at: Date.now() };
      if (free.length) {
        (this.s.freeModels ??= {})[providerId] = free;
        definirGratisConhecidos(providerId, free);
      }
      if (quota || free.length) await this.host.save();
    } catch (err) {
      console.error("[corvus] failed to list free models:", err);
    }
  }

  private registerEmbeddings(): void {
    const specs = Object.entries(this.s.discoveredEmbeddings ?? {})
      .filter(([provider]) => EMBEDDING_PROVIDERS.includes(provider))
      .flatMap(([provider, ids]) =>
        ids.map((id) => inferEmbeddingSpec(provider as EmbeddingProvider, id))
      );
    registerDiscoveredEmbeddings(specs);
  }

  private async enrich(providerId: string, models: readonly string[]): Promise<number> {
    const list = [...new Set(models.filter(Boolean))];
    if (list.length === 0) return 0;
    try {
      return providerId === "ollama"
        ? await enriquecerCapacidadesOllama(this.s.ollamaEndpoint, list)
        : await enrichModelsFromCatalog(providerId, list);
    } catch (err) {
      console.error("[corvus] enriquecerCapacidades failed:", err);
      return 0;
    }
  }

  private async enrichActive(): Promise<void> {
    const s = this.s;
    let written = 0;
    for (const providerId of Object.keys(s.activeModels ?? {})) {
      if (!providerCredential(s, providerId)) continue;
      written += await this.enrich(providerId, [
        ...(s.activeModels?.[providerId] ?? []),
        ...(s.favoriteModels?.[providerId] ?? []),
      ]);
    }
    if (written > 0) await this.saveCache();
  }

  private async loadCache(): Promise<void> {
    try {
      if (!(await this.host.adapter.exists(this.host.cacheFile))) return;
      const raw = await this.host.adapter.read(this.host.cacheFile);
      hydrateModelInfoCache(JSON.parse(raw) as Parameters<typeof hydrateModelInfoCache>[0]);
    } catch (err) {
      console.error("[corvus] failed to load modelInfoCache:", err);
    }
  }

  private async saveCache(): Promise<void> {
    try {
      await this.host.adapter.write(
        this.host.cacheFile,
        JSON.stringify(getModelInfoCache(), null, 2)
      );
    } catch (err) {
      console.error("[corvus] failed to save modelInfoCache:", err);
    }
  }
}
