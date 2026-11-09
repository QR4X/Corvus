import { Plugin, WorkspaceLeaf, Platform, Notice, type TAbstractFile } from "obsidian";
import { settingsReadLooksBroken } from "./core/settingsGuard";
import { CORVUS_HIDDEN, CHATS_FOLDER, HIDDEN_MOVES, shouldMigrate } from "./core/vaultPaths";
import { getProvider } from "./providers";
import { CorvusView, VIEW_TYPE_CORVUS } from "./ui/CorvusView";
import { FONTE_DO_HOVER } from "./ui/responseLinks";
import { registerBrandLogos } from "./ui/brandLogos";
import { CorvusSettingsTab } from "./ui/SettingsTab";
import { startupOpensPanel } from "./ui/modules";
import { VectorIndex, loadIndex, RAG_SHARD_SIZE } from "./rag/vectorIndex";
import { indexVault } from "./rag/indexer";
import {
  inferEmbeddingSpec,
  pareceEmbeddingDoOllama,
  registerDiscoveredEmbeddings,
  type EmbeddingModelSpec,
  type EmbeddingProvider,
} from "./rag/types";
import { registerLocalUsage } from "./providers/dataCollect";
import { listAllChats, type ChatSummary } from "./core/chatPersistence";
import {
  hydrateModelInfoCache,
  getModelInfoCache,
  fetchAndCacheModelInfo,
  enrichModelsFromCatalog,
  type EnrichedModelInfo,
} from "./providers/modelInfoStore";
import { enriquecerCapacidadesOllama } from "./providers/ollama";
import {
  loadSkills,
  seedExampleSkills,
  isSkillFilePath,
  type Skill,
} from "./skills/skills";
import type { Project } from "./projects";
import type {
  EffortConfig,
  EffortLevel,
} from "./core/effort";
import { limparCamposMortos } from "./core/legacySettings";
import { EMBEDDING_PROVIDERS, somarDescobertos } from "./rag/discovered";
import { chatIndexSignature } from "./core/chatIndex";
import {
  FABRICA_ATE_0923,
  alinharAoInstalado,
  listaDeFabrica,
  revisarOllamaPadrao,
} from "./core/ollamaDefault";
import { definirGratisConhecidos } from "./usage/pricing";
import { lancar, podar, type LivroDoDia } from "./usage/dailyLedger";
import { definirAnotadorDeUso, definirGuardaDeGasto } from "./usage/recorder";
import { ehPago, gastoDeHoje, marcosCruzados, usd } from "./usage/dailySpend";
import { ProviderError } from "./providers/base";
import { esquecerDesfazeres } from "./agent/undo";
import { registrarComandosDoEditor } from "./editor/commands";
import { esquecerPedidos } from "./editor/bridge";
import { LOCALES, resolveLocale } from "./i18n";
import { setUiLocale, tr } from "./i18n/tr";
import { openOrCreateAgentMd } from "./core/agentMd";
import { acompanharEscrita } from "./core/wakeLock";

export interface ProviderStatus {
  ok: boolean;

  at: number;

  detail?: string;
}

export interface CorvusSettings {

  openaiApiKey: string;
  anthropicApiKey: string;
  geminiApiKey: string;
  openrouterApiKey: string;
  nimApiKey: string;

  ollamaEndpoint: string;

  ollamaPadraoRevisto?: boolean;

  defaultProvider: string;

  defaultModel: string;
  anthropicModel: string;
  geminiModel: string;
  openrouterModel: string;
  nimModel: string;
  ollamaModel: string;

  ollamaVistos?: string[];

  activeModels: Record<string, string[]>;

  favoriteModels: Record<string, string[]>;

  freeModels: Record<string, string[]>;

  freeQuota: Record<string, { limit: number; remaining?: number; at: number }>;

  usoDoDia: LivroDoDia;

  limitesDiarios: Record<string, number>;

  limiteGastoDiario: number;

  travarNoLimite: boolean;

  assistantProvider: string;
  assistantModel: string;

  assistantSeesVault: boolean;

  openaiDataSharing: boolean;

  openaiTier: number;

  providerStatus: Record<string, ProviderStatus>;

  voiceEnabled: boolean;

  voiceModel: string;

  voiceLanguage: string;

  ttsEnabled: boolean;

  ttsProvider: string;

  ttsModel: string;

  ttsVoice: string;

  elevenApiKey: string;
  elevenModel: string;

  elevenVoice: string;

  elevenVoices: { id: string; name: string; category?: string }[];

  hapticsEnabled: boolean;

  discoveredEmbeddings: Record<string, string[]>;

  discoveredModels: Record<string, string[]>;

  unreadChats: string[];

  defaultMode: string;

  startupChatMode: string;

  defaultEffort: string;

  effortConfigs: Partial<Record<EffortLevel, Partial<EffortConfig>>>;

  language: string;

  chatsPath: string;
  skillsPath: string;

  projects: Project[];

  ragIndexPath: string;
  ragEmbeddingProvider: string;
  ragEmbeddingModel: string;

  ragQuantProfile: string;

  ragStreamShards: boolean;

  ragAutoReindex: boolean;

  ragMobileSkipNoticeShown?: boolean;

  agentPermissionLevel: string;

  agentInstructionsPath: string;

  agentDiffApproval: boolean;

  agentWeb: boolean;

  tavilyApiKey: string;

  instagramReelsEnabled: boolean;

  mobileFullscreen: boolean;

  keepAwakeWhileWriting: boolean;
}

const DEFAULT_SETTINGS: CorvusSettings = {
  openaiApiKey: "",
  anthropicApiKey: "",
  geminiApiKey: "",
  openrouterApiKey: "",
  nimApiKey: "",

  ollamaEndpoint: "",
  defaultProvider: "openai",
  defaultModel: "gpt-4o",
  anthropicModel: "claude-sonnet-4-6",
  geminiModel: "gemini-2.5-flash",
  openrouterModel: "anthropic/claude-3.5-sonnet",
  nimModel: "meta/llama-3.3-70b-instruct",

  ollamaModel: "",
  activeModels: {
    openai: ["gpt-4o", "gpt-4o-mini", "o1", "o3", "gpt-5"],
    anthropic: [
      "claude-opus-4-8",
      "claude-sonnet-4-6",
      "claude-haiku-4-5-20251001",
    ],
    gemini: [
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemini-3.5-flash",
      "gemini-3.1-flash-lite",
    ],
    openrouter: [
      "openrouter/auto",
      "anthropic/claude-3.5-sonnet",
      "openai/gpt-4o",
      "meta-llama/llama-3.3-70b-instruct",
      "google/gemini-2.0-flash-001",
    ],
    nim: [
      "meta/llama-3.3-70b-instruct",
      "meta/llama-3.1-70b-instruct",
      "meta/llama-3.1-8b-instruct",
      "nvidia/llama-3.1-nemotron-70b-instruct",
      "mistralai/mixtral-8x22b-instruct-v0.1",
      "deepseek-ai/deepseek-r1",
      "qwen/qwen2.5-72b-instruct",
      "microsoft/phi-4",
    ],
    ollama: [],
  },
  favoriteModels: {},
  freeModels: {},
  freeQuota: {},
  usoDoDia: {},
  limitesDiarios: {},
  limiteGastoDiario: 0,
  travarNoLimite: false,
  assistantProvider: "",
  assistantModel: "",

  assistantSeesVault: false,

  openaiDataSharing: false,
  openaiTier: 1,
  providerStatus: {},
  voiceEnabled: true,
  voiceModel: "gpt-4o-mini-transcribe",
  voiceLanguage: "",
  ttsEnabled: false,
  ttsProvider: "openai",
  ttsModel: "gpt-4o-mini-tts",
  ttsVoice: "alloy",
  elevenApiKey: "",
  elevenModel: "eleven_multilingual_v2",
  elevenVoice: "",
  elevenVoices: [],
  hapticsEnabled: true,
  discoveredEmbeddings: {},
  discoveredModels: {},
  unreadChats: [],
  defaultMode: "chat",

  startupChatMode: "",
  defaultEffort: "med",
  effortConfigs: {},

  language: "auto",

  chatsPath: CHATS_FOLDER,
  skillsPath: "corvus-ai/skills",
  projects: [],
  ragIndexPath: `${CORVUS_HIDDEN}/index`,
  ragEmbeddingProvider: "openai",
  ragEmbeddingModel: "text-embedding-3-small",
  ragQuantProfile: "balanced",
  ragStreamShards: false,
  ragAutoReindex: false,
  ragMobileSkipNoticeShown: false,
  agentPermissionLevel: "ask",
  agentInstructionsPath: "",
  agentDiffApproval: true,
  agentWeb: true,
  tavilyApiKey: "",
  instagramReelsEnabled: true,
  mobileFullscreen: false,

  keepAwakeWhileWriting: true,
};

export default class CorvusPlugin extends Plugin {
  settings!: CorvusSettings;

  vectorIndex: VectorIndex | null = null;

  indexing: AbortController | null = null;

  settingsTab: CorvusSettingsTab | null = null;

  private settingsListeners = new Set<() => void>();

  private autoReindexTimer: number | null = null;
  private autoReindexController: AbortController | null = null;

  skills: Skill[] = [];

  private skillsReloadTimer: number | null = null;

  chatSummaries: ChatSummary[] | null = null;
  private chatSummariesPromise: Promise<ChatSummary[]> | null = null;
  private chatsListeners = new Set<() => void>();
  private reconcilingChats = false;
  private chatIndexWriteTimer: number | null = null;

  markChatUnread(id: string): void {
    if (!id || this.settings.unreadChats.includes(id)) return;
    this.settings.unreadChats = [...this.settings.unreadChats, id];
    void this.saveSettings();
    this.notifyUnread();
  }

  clearChatUnread(id: string): void {
    if (!id || !this.settings.unreadChats.includes(id)) return;
    this.settings.unreadChats = this.settings.unreadChats.filter(
      (x) => x !== id
    );
    void this.saveSettings();
    this.notifyUnread();
  }

  unreadSet(): Set<string> {
    return new Set(this.settings.unreadChats);
  }

  private unreadListeners = new Set<() => void>();

  onUnreadChange(cb: () => void): () => void {
    this.unreadListeners.add(cb);
    return () => this.unreadListeners.delete(cb);
  }

  private notifyUnread(): void {
    this.unreadListeners.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        console.error("[corvus] unread listener failed:", err);
      }
    });
  }

  onChatsChange(cb: () => void): () => void {
    this.chatsListeners.add(cb);
    return () => this.chatsListeners.delete(cb);
  }
  private notifyChats(): void {
    this.chatsListeners.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        console.error("[corvus] chats listener failed:", err);
      }
    });
  }

  private chatIndexPath(): string {

    const dir =
      this.manifest.dir ??
      `${this.app.vault.configDir}/plugins/${this.manifest.id}`;
    return `${dir}/chatIndex.json`;
  }

  private static readonly CHAT_INDEX_VERSION = 2;
  private async readChatIndex(): Promise<ChatSummary[] | null> {
    try {
      const p = this.chatIndexPath();
      if (!(await this.app.vault.adapter.exists(p))) return null;

      const parsed = JSON.parse(await this.app.vault.adapter.read(p)) as
        | { v?: unknown; items?: unknown }
        | unknown[]
        | null;

      let items: unknown;
      if (Array.isArray(parsed)) {
        items = parsed;
      } else if (
        parsed &&
        typeof parsed === "object" &&
        parsed.v === CorvusPlugin.CHAT_INDEX_VERSION
      ) {
        items = parsed.items;
      } else {
        return null;
      }
      if (!Array.isArray(items)) return null;

      const valid = items.every(
        (it): it is ChatSummary =>
          !!it &&
          typeof it === "object" &&
          typeof (it as ChatSummary).id === "string" &&
          typeof (it as ChatSummary).date === "string"
      );
      if (!valid) return null;

      return (items as ChatSummary[]).map((it) => ({
        ...it,
        starred: it.starred === true,
      }));
    } catch (err) {
      console.error("[corvus] readChatIndex failed:", err);
      return null;
    }
  }
  private async writeChatIndex(arr: ChatSummary[]): Promise<void> {

    if (this.chatIndexWriteTimer !== null) {
      window.clearTimeout(this.chatIndexWriteTimer);
      this.chatIndexWriteTimer = null;
    }
    try {

      const envelope = { v: CorvusPlugin.CHAT_INDEX_VERSION, items: arr };
      await this.app.vault.adapter.write(
        this.chatIndexPath(),
        JSON.stringify(envelope)
      );
    } catch (err) {
      console.error("[corvus] writeChatIndex failed:", err);
    }
  }

  private scheduleChatIndexWrite(): void {
    if (this.chatIndexWriteTimer != null) {
      window.clearTimeout(this.chatIndexWriteTimer);
    }
    this.chatIndexWriteTimer = window.setTimeout(() => {
      this.chatIndexWriteTimer = null;
      if (this.chatSummaries) void this.writeChatIndex(this.chatSummaries);
    }, 800);
  }

  async loadChatSummaries(force = false): Promise<ChatSummary[]> {
    if (!force && this.chatSummaries) return this.chatSummaries;
    if (!force && this.chatSummariesPromise) return this.chatSummariesPromise;
    this.chatSummariesPromise = (async () => {
      try {
        if (!force) {
          const cached = await this.readChatIndex();
          if (cached) {
            this.chatSummaries = cached;
            this.notifyChats();
            void this.reconcileChatSummaries(); 
            return cached;
          }
        }
        const all = await listAllChats(this.app, this.settings.chatsPath, 100_000);
        this.chatSummaries = all;
        this.notifyChats();
        void this.writeChatIndex(all);
        return all;
      } catch (err) {
        console.error("[corvus] loadChatSummaries failed:", err);
        return this.chatSummaries ?? [];
      } finally {
        this.chatSummariesPromise = null;
      }
    })();
    return this.chatSummariesPromise;
  }

  private async reconcileChatSummaries(): Promise<void> {
    if (this.reconcilingChats) return;
    this.reconcilingChats = true;
    try {
      const fresh = await listAllChats(this.app, this.settings.chatsPath, 100_000);

      const sig = chatIndexSignature;
      if (!this.chatSummaries || sig(fresh) !== sig(this.chatSummaries)) {
        this.chatSummaries = fresh;
        this.notifyChats();
        void this.writeChatIndex(fresh);
      }
    } catch (err) {
      console.error("[corvus] reconcileChatSummaries failed:", err);
    } finally {
      this.reconcilingChats = false;
    }
  }

  upsertChatSummary(s: ChatSummary): void {
    if (!this.chatSummaries) return;

    this.chatSummaries = [
      ...this.chatSummaries.filter((c) => c.id !== s.id),
      s,
    ].sort((a, b) => b.date.localeCompare(a.date));
    this.notifyChats();
    this.scheduleChatIndexWrite();
  }

  removeChatSummary(id: string): void {

    this.clearChatUnread(id);
    if (!this.chatSummaries) return;
    this.chatSummaries = this.chatSummaries.filter((c) => c.id !== id);
    this.notifyChats();
    this.scheduleChatIndexWrite();
  }

  providerCredential(id: string): string {
    const s = this.settings;
    switch (id) {
      case "anthropic":
        return s.anthropicApiKey ?? "";
      case "gemini":
        return s.geminiApiKey ?? "";
      case "openrouter":
        return s.openrouterApiKey ?? "";
      case "nim":
        return s.nimApiKey ?? "";
      case "ollama":
        return s.ollamaEndpoint ?? "";
      default:
        return s.openaiApiKey ?? "";
    }
  }

  async scanModels(providerId: string): Promise<string[]> {
    const p = getProvider(providerId);
    if (!p.listModels) return [];
    const desde = this.settings.ollamaEndpoint;
    const lista = await p.listModels(this.providerCredential(providerId));

    if (
      providerId === "ollama" &&
      this.settings.ollamaEndpoint === desde &&
      this.alinharOllama(lista)
    ) {
      await this.saveSettings();
    }

    if (lista.length > 0 && (providerId !== "ollama" || this.settings.ollamaEndpoint === desde)) {
      this.settings.discoveredModels = {
        ...(this.settings.discoveredModels ?? {}),
        [providerId]: [...lista],
      };
      await this.saveSettings();
    }

    await this.scanFreeModels(providerId);

    if ((await this.enriquecerCapacidades(providerId, lista)) > 0) {
      await this.saveModelInfoCache();
    }
    return lista;
  }

  async enriquecerCapacidades(
    providerId: string,
    models: readonly string[]
  ): Promise<number> {
    const lista = Array.from(new Set(models.filter((m) => Boolean(m))));
    if (lista.length === 0) return 0;
    try {
      return providerId === "ollama"
        ? await enriquecerCapacidadesOllama(this.settings.ollamaEndpoint, lista)
        : await enrichModelsFromCatalog(providerId, lista);
    } catch (err) {
      console.error("[corvus] enriquecerCapacidades failed:", err);
      return 0;
    }
  }

  private async enriquecerCapacidadesAtivas(): Promise<void> {
    const s = this.settings;
    let gravados = 0;
    for (const providerId of Object.keys(s.activeModels ?? {})) {

      if (!this.providerCredential(providerId)) continue;
      const modelos = [
        ...(s.activeModels?.[providerId] ?? []),
        ...(s.favoriteModels?.[providerId] ?? []),
      ];
      gravados += await this.enriquecerCapacidades(providerId, modelos);
    }
    if (gravados > 0) await this.saveModelInfoCache();
  }

  alinharOllama(instalados: readonly string[]): boolean {
    const s = this.settings;
    const antes = {
      ativos: s.activeModels.ollama ?? [],
      favoritos: s.favoriteModels?.ollama ?? [],
      modelo: s.ollamaModel ?? "",
      vistos: s.ollamaVistos ?? null,
    };
    const depois = alinharAoInstalado(antes, instalados, pareceEmbeddingDoOllama);
    if (JSON.stringify(antes) === JSON.stringify(depois)) return false;
    s.activeModels = { ...s.activeModels, ollama: [...depois.ativos] };
    s.favoriteModels = { ...(s.favoriteModels ?? {}), ollama: [...depois.favoritos] };
    s.ollamaModel = depois.modelo;
    s.ollamaVistos = [...depois.vistos];
    return true;
  }

  async conferirOllama(opts: { soDeFabrica: boolean }): Promise<string[] | null> {
    const s = this.settings;
    if (!s.ollamaEndpoint) return null;
    if (
      opts.soDeFabrica &&
      !(
        listaDeFabrica(s.activeModels.ollama ?? []) &&
        (s.favoriteModels?.ollama ?? []).length === 0 &&
        s.ollamaVistos === undefined
      )
    ) {
      return null;
    }
    const p = getProvider("ollama");
    if (!p.listModels) return null;
    const desde = s.ollamaEndpoint;
    let instalados: string[];
    try {
      instalados = await p.listModels(this.providerCredential("ollama"));
    } catch {
      return null; 
    }

    if (s.ollamaEndpoint !== desde) return null;

    if (opts.soDeFabrica && instalados.length === 0) return null;
    if (this.alinharOllama(instalados)) await this.saveSettings();
    return instalados;
  }

  async scanEmbeddings(providerId: string): Promise<string[]> {
    if (!EMBEDDING_PROVIDERS.includes(providerId)) return [];
    const p = getProvider(providerId) as {
      listEmbeddingModels?: (credential: string) => Promise<string[]>;
    };
    if (!p.listEmbeddingModels) return [];
    const desde = this.settings.ollamaEndpoint;
    let ids: string[] = [];
    try {
      ids = await p.listEmbeddingModels(this.providerCredential(providerId));
    } catch {
      return [];
    }

    if (providerId === "ollama" && this.settings.ollamaEndpoint !== desde) return [];
    const map = this.settings.discoveredEmbeddings ?? {};
    if (providerId === "ollama") {

      const emUso = [
        this.settings.ragEmbeddingProvider === "ollama" ? this.settings.ragEmbeddingModel : "",
        this.vectorIndex?.provider === "ollama" ? this.vectorIndex.model : "",
      ].filter((m) => m && !ids.includes(m));
      const novo = [...ids, ...new Set(emUso)];
      const antes = map.ollama ?? [];
      if (antes.length === novo.length && antes.every((m) => novo.includes(m))) return ids;
      map.ollama = novo;
    } else {

      if (ids.length === 0) return [];
      map[providerId] = somarDescobertos(map[providerId], ids);
    }
    this.settings.discoveredEmbeddings = map;
    this.refreshDiscoveredEmbeddings();
    await this.saveSettings();
    return ids;
  }

  async scanFreeModels(providerId: string): Promise<void> {
    const p = getProvider(providerId);
    if (!p.listFreeModels) return;
    try {
      const livres = await p.listFreeModels(
        this.providerCredential(providerId)
      );
      const cota = p.freeQuota
        ? await p.freeQuota(this.providerCredential(providerId))
        : null;
      if (cota) (this.settings.freeQuota ??= {})[providerId] = { ...cota, at: Date.now() };
      if (livres.length) {
        (this.settings.freeModels ??= {})[providerId] = livres;
        definirGratisConhecidos(providerId, livres);
      }
      if (cota || livres.length) await this.saveSettings();
    } catch (err) {
      console.error("[corvus] failed to list free models:", err);
    }
  }

  async runVaultIndex(): Promise<void> {
    if (this.indexing) {
      this.indexing.abort();
      return;
    }
    const s = this.settings;
    this.indexing = new AbortController();
    this.notifyListeners();
    const notice = new Notice(tr("Indexing vault…"), 0);
    try {
      this.vectorIndex = await indexVault(this.vectorIndex, {
        app: this.app,
        openaiApiKey: s.openaiApiKey,
        openrouterApiKey: s.openrouterApiKey,
        geminiApiKey: s.geminiApiKey,
        nimApiKey: s.nimApiKey,
        ollamaEndpoint: s.ollamaEndpoint,
        model: s.ragEmbeddingModel,
        profile: s.ragQuantProfile,
        indexPath: s.ragIndexPath,

        excludePaths: [s.ragIndexPath, s.chatsPath],
        shardSize: s.ragStreamShards ? RAG_SHARD_SIZE : 0,
        signal: this.indexing.signal,
        onProgress: (p) => {
          const n = {
            done: p.filesEmbedded,
            total: p.filesToEmbed,
            chunks: p.chunksEmbedded,
          };
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
      const trechos = this.vectorIndex.size;
      new Notice(
        trechos === 1
          ? tr("Index ready: 1 chunk.")
          : tr("Index ready: {n} chunks.", { n: trechos })
      );
    } catch (err) {
      notice.hide();
      if (err instanceof DOMException && err.name === "AbortError") {
        new Notice(tr("Indexing cancelled."));
      } else {
        console.error("[corvus] indexVault failed:", err);
        new Notice(
          tr("Indexing failed: {error}", {
            error: err instanceof Error ? err.message : String(err),
          })
        );
      }
    } finally {
      this.indexing = null;

      this.notifyListeners();
    }
  }

  private observarNavbar(): void {
    if (!Platform.isMobile) return;
    const doc = activeDocument;
    const sync = () =>
      doc.body.toggleClass(
        "corvus-has-navbar",
        doc.body.querySelector(".mobile-navbar") !== null
      );
    const obs = new MutationObserver(sync);
    const host = doc.body.querySelector(".app-container");
    if (host) obs.observe(host, { childList: true });
    sync();
    this.register(() => {
      obs.disconnect();
      doc.body.removeClass("corvus-has-navbar");
    });
  }

  private async carregarEmSegundoPlano(): Promise<void> {

    await this.loadModelInfoCache();

    void this.enriquecerCapacidadesAtivas();

    this.refreshDiscoveredEmbeddings();

    for (const [provider, ids] of Object.entries(this.settings.freeModels ?? {})) {
      definirGratisConhecidos(provider, ids);
    }

    void this.refreshLocalUsageHot();

    void this.conferirOllama({ soDeFabrica: true });

    await this.reloadSkills();

    await this.loadVectorIndex();
  }

  async loadVectorIndex(): Promise<void> {
    this.vectorIndex = null;
    try {
      const mobileGuard = Platform.isMobile
        ? {
            maxBytes: 16 * 1024 * 1024,
            onSkip: (mb: number) => {

              if (this.settings.ragMobileSkipNoticeShown) return;
              new Notice(
                tr(
                  "RAG index too large for mobile ({mb} MB) — semantic search is off here to avoid a crash. Use desktop or shrink the index.",
                  { mb: mb.toFixed(0) }
                )
              );
              this.settings.ragMobileSkipNoticeShown = true;
              void this.saveSettings().catch((err) =>
                console.error("[corvus] failed to persist mobile RAG notice flag:", err)
              );
            },
          }
        : undefined;
      this.vectorIndex = await loadIndex(
        this.app.vault.adapter,
        this.settings.ragIndexPath,
        mobileGuard
      );
    } catch (err) {
      console.error("[corvus] failed to load RAG index:", err);
    }
  }

  onSettingsChange(cb: () => void): () => void {
    this.settingsListeners.add(cb);
    return () => this.settingsListeners.delete(cb);
  }

  private notifyListeners(): void {
    this.settingsListeners.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        console.error("[corvus] settings listener failed:", err);
      }
    });
  }

  refreshDiscoveredEmbeddings(): void {
    const specs: EmbeddingModelSpec[] = [];
    const map = this.settings.discoveredEmbeddings ?? {};
    for (const [provider, ids] of Object.entries(map)) {

      if (!EMBEDDING_PROVIDERS.includes(provider)) continue;
      for (const id of ids) {
        specs.push(inferEmbeddingSpec(provider as EmbeddingProvider, id));
      }
    }
    registerDiscoveredEmbeddings(specs);
  }

  async refreshLocalUsageHot(): Promise<void> {
    try {
      const chats = await this.loadChatSummaries();
      const byModel: Record<string, number> = {};
      for (const c of chats) {
        if (c.model) byModel[c.model] = (byModel[c.model] ?? 0) + 1;
      }
      registerLocalUsage(byModel);
    } catch (err) {
      console.error("[corvus] refreshLocalUsageHot failed:", err);
    }
  }

  async reloadSkills(): Promise<void> {
    try {
      this.skills = await loadSkills(this.app, this.settings.skillsPath);
    } catch (err) {
      console.error("[corvus] reloadSkills failed:", err);
      this.skills = [];
    }
    this.notifyListeners();
  }

  async seedExampleSkills(): Promise<number> {
    const n = await seedExampleSkills(this.app, this.settings.skillsPath);
    await this.reloadSkills();
    return n;
  }

  private modelInfoCachePath(): string {

    const dir =
      this.manifest.dir ??
      `${this.app.vault.configDir}/plugins/${this.manifest.id}`;
    return `${dir}/modelInfoCache.json`;
  }

  private async loadModelInfoCache(): Promise<void> {
    try {
      const path = this.modelInfoCachePath();
      if (await this.app.vault.adapter.exists(path)) {
        const raw = await this.app.vault.adapter.read(path);
        hydrateModelInfoCache(
          JSON.parse(raw) as Parameters<typeof hydrateModelInfoCache>[0]
        );
      }
    } catch (err) {
      console.error("[corvus] failed to load modelInfoCache:", err);
    }
  }

  async saveModelInfoCache(): Promise<void> {
    try {
      await this.app.vault.adapter.write(
        this.modelInfoCachePath(),
        JSON.stringify(getModelInfoCache(), null, 2)
      );
    } catch (err) {
      console.error("[corvus] failed to save modelInfoCache:", err);
    }
  }

  async fetchModelInfo(
    provider: string,
    model: string
  ): Promise<EnrichedModelInfo | null> {
    const info = await fetchAndCacheModelInfo(provider, model);
    if (info) await this.saveModelInfoCache();
    return info;
  }

  async onload() {
    await this.loadSettings();

    await this.migrarParaPastaOculta();

    this.registerView(
      VIEW_TYPE_CORVUS,
      (leaf) => new CorvusView(leaf, this)
    );

    this.registerHoverLinkSource(FONTE_DO_HOVER, {
      display: "Corvus",
      defaultMod: true,
    });

    this.addRibbonIcon("bot", "Corvus", () => {
      void this.activateView();
    });

    registerBrandLogos();

    this.addCommand({
      id: "open-panel",
      name: tr("Open panel"),
      callback: () => this.activateView(),
    });

    this.addCommand({
      id: "open-agent-instructions",
      name: tr("Open agent instructions (AGENT.md)"),
      callback: () => {
        void openOrCreateAgentMd(this.app, this.settings.agentInstructionsPath);
      },
    });

    registrarComandosDoEditor(this);

    this.settingsTab = new CorvusSettingsTab(this.app, this);
    this.addSettingTab(this.settingsTab);

    this.setupAutoReindex();

    this.setupSkillsWatcher();

    this.observarNavbar();

    const vigiaEscrita = acompanharEscrita(() => this.settings.keepAwakeWhileWriting);
    this.register(() => vigiaEscrita.dispose());
    this.register(this.onSettingsChange(() => vigiaEscrita.recheck()));

    this.app.workspace.onLayoutReady(() => {
      void this.carregarEmSegundoPlano();
    });

    definirAnotadorDeUso((provider, model, delta) => this.anotarUso(provider, model, delta));
    definirGuardaDeGasto((provider, model) => this.conferirLimiteDeGasto(provider, model));

    if (startupOpensPanel(this.settings.startupChatMode)) {

      window.setTimeout(() => void this.activateView(), 250);
    }
  }

  anotarUso(provider: string, model: string, delta: { r?: number; i?: number; o?: number }): void {
    const agora = new Date();
    const livro = (this.settings.usoDoDia ??= {});
    const limite = this.settings.limiteGastoDiario ?? 0;

    const conta = limite > 0 && ((delta.i ?? 0) > 0 || (delta.o ?? 0) > 0);
    const antes = conta ? gastoDeHoje(livro, agora).total : 0;
    lancar(livro, agora, provider, model, delta);
    podar(livro, agora);
    if (conta) {
      const depois = gastoDeHoje(livro, agora).total;
      for (const marco of marcosCruzados(antes, depois, limite)) this.avisarGasto(marco, depois, limite);
    }
    if (this.usoTimer !== null) return;
    this.usoTimer = window.setTimeout(() => {
      this.usoTimer = null;
      void this.saveSettings();
    }, 5000);
  }

  private usoTimer: number | null = null;

  private avisarGasto(marco: 80 | 100, gasto: number, limite: number): void {
    const valores = { limit: usd(limite), spent: usd(gasto) };
    if (marco === 80) {
      new Notice(tr("You've used 80% of today's {limit} spending limit ({spent}).", valores), 8000);
      return;
    }
    new Notice(
      this.settings.travarNoLimite
        ? tr(
            "Today's {limit} spending limit is reached ({spent}). Paid models pause until midnight; free and local ones still work.",
            valores
          )
        : tr(
            "Today's {limit} spending limit is reached ({spent}). Turn on “Stop paid models at the limit” in settings to pause them.",
            valores
          ),
      12000
    );
  }

  conferirLimiteDeGasto(provider: string, model: string): void {
    const s = this.settings;
    const limite = s.limiteGastoDiario ?? 0;
    if (!(limite > 0) || !s.travarNoLimite || !ehPago(provider, model)) return;
    const { total } = gastoDeHoje(s.usoDoDia ?? {}, new Date());
    if (total < limite) return;
    throw new ProviderError(
      tr(
        "Today's {limit} spending limit is reached ({spent} spent), so paid models are paused until midnight. Free and local models still work, or raise the limit in Settings › Chat › Daily spending.",
        { limit: usd(limite), spent: usd(total) }
      ),
      "unknown"
    );
  }

  onunload() {
    definirAnotadorDeUso(null);
    definirGuardaDeGasto(null);

    esquecerDesfazeres();
    esquecerPedidos();

    if (this.usoTimer !== null) {
      window.clearTimeout(this.usoTimer);
      this.usoTimer = null;
      void this.saveSettings();
    }

    if (this.autoReindexTimer !== null) {
      window.clearTimeout(this.autoReindexTimer);
      this.autoReindexTimer = null;
    }
    if (this.chatIndexWriteTimer !== null) {
      window.clearTimeout(this.chatIndexWriteTimer);
      this.chatIndexWriteTimer = null;
    }
    if (this.skillsReloadTimer !== null) {
      window.clearTimeout(this.skillsReloadTimer);
      this.skillsReloadTimer = null;
    }
    this.autoReindexController?.abort();
    this.autoReindexController = null;
  }

  private setupAutoReindex() {

    const schedule = (file: TAbstractFile) => {
      if (!this.settings.ragAutoReindex) return;
      if (!this.vectorIndex || this.vectorIndex.size === 0) return;
      if (!file?.path || !file.path.endsWith(".md")) return;
      if (this.autoReindexTimer !== null) {
        window.clearTimeout(this.autoReindexTimer);
      }
      this.autoReindexTimer = window.setTimeout(
        () => void this.runAutoReindex(),
        4000
      );
    };

    this.registerEvent(this.app.vault.on("modify", schedule));
    this.registerEvent(this.app.vault.on("create", schedule));
    this.registerEvent(this.app.vault.on("delete", schedule));
    this.registerEvent(this.app.vault.on("rename", schedule));
  }

  private setupSkillsWatcher() {
    const schedule = (file: TAbstractFile, oldPath?: string) => {
      const path = file?.path ?? "";
      const inFolder =
        isSkillFilePath(path, this.settings.skillsPath) ||
        (!!oldPath && isSkillFilePath(oldPath, this.settings.skillsPath));
      if (!inFolder) return;
      if (this.skillsReloadTimer !== null) {
        window.clearTimeout(this.skillsReloadTimer);
      }
      this.skillsReloadTimer = window.setTimeout(() => {
        this.skillsReloadTimer = null;
        void this.reloadSkills();
      }, 600);
    };

    this.registerEvent(this.app.vault.on("modify", (f) => schedule(f)));
    this.registerEvent(this.app.vault.on("create", (f) => schedule(f)));
    this.registerEvent(this.app.vault.on("delete", (f) => schedule(f)));
    this.registerEvent(
      this.app.vault.on("rename", (f, oldPath) => schedule(f, oldPath))
    );
  }

  private async runAutoReindex() {
    this.autoReindexTimer = null;
    if (!this.settings.ragAutoReindex) return;
    if (!this.vectorIndex || this.vectorIndex.size === 0) return;

    this.autoReindexController?.abort();
    this.autoReindexController = new AbortController();

    try {
      this.vectorIndex = await indexVault(this.vectorIndex, {
        app: this.app,
        openaiApiKey: this.settings.openaiApiKey,
        openrouterApiKey: this.settings.openrouterApiKey,
        geminiApiKey: this.settings.geminiApiKey,
        nimApiKey: this.settings.nimApiKey,
        ollamaEndpoint: this.settings.ollamaEndpoint,
        model: this.settings.ragEmbeddingModel,
        profile: this.settings.ragQuantProfile,
        indexPath: this.settings.ragIndexPath,
        excludePaths: [
          this.settings.ragIndexPath,
          this.settings.chatsPath,
        ],
        shardSize: this.settings.ragStreamShards ? RAG_SHARD_SIZE : 0,
        signal: this.autoReindexController.signal,
      });
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        console.error("[corvus] auto-reindex failed:", err);
      }
    }
  }

  async activateView() {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_CORVUS);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {

      leaf = workspace.getRightLeaf(false) ?? workspace.getRightLeaf(true);
      await leaf?.setViewState({ type: VIEW_TYPE_CORVUS, active: true });
    }

    if (leaf) {
      void workspace.revealLeaf(leaf);

      if (Platform.isMobile) workspace.rightSplit?.expand();
    } else {
      new Notice(tr("Couldn't open the Corvus panel — try toggling the right sidebar."));
    }
  }

  private static readonly SECRET_FIELDS = [
    "openaiApiKey",
    "anthropicApiKey",
    "geminiApiKey",
    "openrouterApiKey",
    "nimApiKey",

    "elevenApiKey",
    "tavilyApiKey",
  ] as const;

  private secretId(field: string): string {
    return `corvus-${field.replace(/ApiKey$/, "")}-key`;
  }

  private settingsUnsafe = false;

  private avisoDeSaveDado = false;

  private dataPath(nome = "data.json"): string {

    const dir =
      this.manifest.dir ??
      `${this.app.vault.configDir}/plugins/${this.manifest.id}`;
    return `${dir}/${nome}`;
  }

  private async backupSettings(bruto: string): Promise<void> {
    try {
      if (bruto.trim().length > 2) {
        await this.app.vault.adapter.write(this.dataPath("data.backup.json"), bruto);
      }
    } catch (err) {
      console.error("[corvus] settings backup failed:", err);
    }
  }

  async loadSettings() {

    const saved = ((await this.loadData()) ?? {}) as Partial<CorvusSettings>;

    if (Object.keys(saved).length === 0) {
      try {
        const caminho = this.dataPath();
        const existe = await this.app.vault.adapter.exists(caminho);
        const bruto = existe
          ? (await this.app.vault.adapter.read(caminho)).trim()
          : "";
        {
          if (
            settingsReadLooksBroken({
              chavesLidas: 0,
              arquivoExiste: existe,
              tamanhoBruto: bruto.length,
            })
          ) {
            this.settingsUnsafe = true;
            console.error(
              "[corvus] data.json exists but could not be read — settings will NOT be saved until restart."
            );

            setUiLocale(resolveLocale(DEFAULT_SETTINGS.language));
            new Notice(
              tr(
                "Corvus: couldn't read your settings file. Nothing will be overwritten — restart Obsidian, and check data.backup.json next to it if needed."
              ),
              15000
            );
          }
        }
      } catch (err) {
        console.error("[corvus] data.json check failed:", err);
      }
    } else {
      void this.backupSettings(JSON.stringify(saved, null, 2));
    }

    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);

    if (!LOCALES.some((l) => l.id === this.settings.language))
      this.settings.language = "auto";
    setUiLocale(resolveLocale(this.settings.language));

    const ollama = revisarOllamaPadrao(saved, FABRICA_ATE_0923);
    if (ollama !== null) this.settings.ollamaEndpoint = ollama;
    this.settings.ollamaPadraoRevisto = true;

    this.settings.activeModels = {
      ...DEFAULT_SETTINGS.activeModels,
      ...(saved.activeModels ?? {}),
    };
    this.settings.discoveredEmbeddings = saved.discoveredEmbeddings ?? {};
    this.settings.discoveredModels = saved.discoveredModels ?? {};

    limparCamposMortos(this.settings);

    this.settings.effortConfigs = saved.effortConfigs ?? {};

    this.loadSecrets(saved);
  }

  private async migrarParaPastaOculta(): Promise<void> {
    if (this.settingsUnsafe) return;
    const ad = this.app.vault.adapter;

    const destinoOcupado = async (pasta: string): Promise<boolean> => {
      if (!(await ad.exists(pasta))) return false;
      try {
        const listing = await ad.list(pasta);
        return listing.files.length + listing.folders.length > 0;
      } catch {

        return true;
      }
    };
    let mudou = false;
    for (const mv of HIDDEN_MOVES) {
      const atual =
        mv.campo === "chatsPath" ? this.settings.chatsPath : this.settings.ragIndexPath;
      const podeIr = shouldMigrate({
        caminhoAtual: atual,
        legado: mv.legado,
        novo: mv.novo,
        origemExiste: await ad.exists(mv.legado),
        destinoExiste: await destinoOcupado(mv.novo),
      });

      if (!podeIr) continue;
      try {
        await this.moverPasta(mv.legado, mv.novo);
        if (mv.campo === "chatsPath") this.settings.chatsPath = mv.novo;
        else this.settings.ragIndexPath = mv.novo;
        mudou = true;
      } catch (err) {

        console.error(`[corvus] migration of ${mv.legado} failed:`, err);
      }
    }
    if (mudou) {
      await this.saveSettings();
      new Notice(
        tr(
          "Corvus moved your chats into a visible folder — file-sync plugins (Google Drive, Obsidian Sync…) copy them between devices now, and they show up in the vault's search and file list."
        ),
        10000
      );
    }
  }

  private async moverPasta(de: string, para: string): Promise<number> {
    const ad = this.app.vault.adapter;
    if (!(await ad.exists(para))) await ad.mkdir(para);
    const listing = await ad.list(de);
    let n = 0;
    for (const sub of listing.folders) {
      n += await this.moverPasta(sub, `${para}/${sub.split("/").pop()}`);
    }
    for (const arq of listing.files) {
      const nome = arq.split("/").pop() as string;
      const destino = `${para}/${nome}`;

      const dados = await ad.readBinary(arq);
      await ad.writeBinary(destino, dados);
      if (!(await ad.exists(destino))) {
        throw new Error(`failed to write ${destino}`);
      }
      await ad.remove(arq);
      n += 1;
    }

    const sobrou = await ad.list(de);
    if (sobrou.files.length === 0 && sobrou.folders.length === 0) {
      await ad.rmdir(de, false);
    }
    return n;
  }

  private loadSecrets(saved: Record<string, unknown>) {
    const ss = this.app.secretStorage;
    if (!ss) return; 
    let migrated = false;
    for (const f of CorvusPlugin.SECRET_FIELDS) {
      const id = this.secretId(f);
      const stored = ss.getSecret(id);
      if (stored) {
        this.settings[f] = stored;
      } else if (typeof saved[f] === "string" && saved[f]) {

        ss.setSecret(id, saved[f]);
        this.settings[f] = saved[f];
        migrated = true;
      }
    }

    if (migrated && !this.settingsUnsafe) {
      void this.saveData(this.persistableSettings()).catch((err) =>
        console.error("[corvus] secrets migration (saveData) failed:", err)
      );
    }
  }

  private persistableSettings(): CorvusSettings {
    const copy = { ...this.settings };
    for (const f of CorvusPlugin.SECRET_FIELDS) copy[f] = "";
    return copy;
  }

  async saveSettings() {

    if (this.settingsUnsafe) {
      console.error("[corvus] saveSettings blocked: settings were not read.");
      return;
    }
    try {
      const ss = this.app.secretStorage;
      if (ss) {

        for (const f of CorvusPlugin.SECRET_FIELDS) {
          ss.setSecret(this.secretId(f), this.settings[f] ?? "");
        }
        await this.saveData(this.persistableSettings());
      } else {

        await this.saveData(this.settings);
      }
      this.avisoDeSaveDado = false;
    } catch (err) {
      console.error("[corvus] failed to save settings:", err);

      if (!this.avisoDeSaveDado) {
        this.avisoDeSaveDado = true;
        new Notice(
          tr(
            "Corvus could not save your settings — the change is active now but will be lost when you reopen Obsidian. Check the vault's disk space and permissions."
          ),
          12000
        );
      }
      return;
    }

    setUiLocale(resolveLocale(this.settings.language));

    this.settingsListeners.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        console.error("[corvus] settings listener failed:", err);
      }
    });
  }
}
