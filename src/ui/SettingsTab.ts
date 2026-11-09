import {
  App,
  getLanguage,
  Notice,
  Platform,
  PluginSettingTab,
  requireApiVersion,
  Setting,
  setIcon,
} from "obsidian";
import type { SettingDefinitionItem } from "obsidian";
import type CorvusPlugin from "../main";
import {
  PROVIDERS,
  providerConfigured,
  providerHealth,
  type ProviderHealth,
} from "../core/providersMeta";
import { escolherAssistente, ehFree } from "../assistant/model";
import { getAllEmbeddingModels } from "../rag/types";
import { deleteIndex } from "../rag/vectorIndex";
import { getModelCapabilities } from "../providers/modelCapabilities";
import { freeTag, geminiTemTierGratis, gratisDeVerdade, type FreeTag } from "../usage/freeTag";
import { openaiFreeTierForModel } from "../usage/freeTokens";
import { buildModelCatalog, porFabricante, soltosPorFabricante } from "./modelCatalog";
import { PROVIDERS_MULTI_FABRICANTE } from "../providers/vendors";
import { prettyModelName } from "../providers/modelDescriptions";
import { speak, stopSpeaking, TTS_PROVIDERS, ttsReady } from "./readAloud";
import { fraseDaAmostra, idiomaDaAmostra } from "./settings/voiceSample";
import { elevenVoices } from "../providers/elevenlabs";
import { hapticsOn, setHapticsEnabled, tap } from "./haptics";
import { marcarPerigoso } from "./modals";
import {
  buildSettingsTree,
  nomeProprio,
  PROVIDER_FIELDS,
  tabsFor,
  type PickItem,
  type Place,
  type RowRender,
  type SettingsUi,
  type TabId,
} from "./settings/tree";
import { drawLegacyTree, type LegacyTree } from "./settings/legacy";
import {
  isControlKey,
  readControl,
  writeControl,
  type TextKey,
} from "./settings/values";
import { openActions } from "./menu";
import { modelLogo } from "../providers/modelLogo";
import { putThumb, seedThumb, thumbOf, type Thumb } from "./settings/thumb";
import { pendenciaDoIndice } from "./settings/searchIndex";
import {
  EffortLevelModal,
  nivelEditado,
  resumoDoNivel,
} from "./settings/effortEditor";
import { EFFORT_ICONS, type EffortLevel } from "../core/effort";
import { uiLocale, mark, tr } from "../i18n/tr";

export const FAVORITE_LIMIT = 5;

const HEALTH_TEXT: Record<ProviderHealth, string> = {
  off: mark("no credential"),
  unknown: mark("not tested"),
  ok: mark("connected"),
  fail: mark("last test failed"),
};

const CONN_TEXT: Record<string, (detail?: string) => string> = {
  unknown: () => tr("Not tested yet — hit Test to check the credential."),
  testing: () => tr("Talking to the provider…"),
  ok: (d) => tr("Connected. {detail}", { detail: d ?? "" }).trim(),
  fail: (d) => tr("Failed. {detail}", { detail: d ?? "" }).trim(),
};

interface ConnState {
  state: "unknown" | "testing" | "ok" | "fail";

  detail?: string;
}

interface Slot {
  row: Setting;
  paint: (row: Setting) => void;

  tab: TabId;
}

interface DefinitionLookup {
  getElementForDefinition?: (def: unknown) => HTMLElement | null | undefined;
}

export class CorvusSettingsTab extends PluginSettingTab {

  private tab: TabId = "providers";
  private provider = "openai";

  private catalog: Record<string, string[]> = {};

  private kind = "all";

  private openFam: string | null = null;

  private openVendor: string | null = null;

  private conn: Record<string, ConnState> = {};

  private fetchingFor: string | null = null;
  private fetchingVoices = false;

  private amostra: HTMLButtonElement | null = null;

  private timerDoIndice = 0;

  private timerDoOllama: number | null = null;
  private hapticsOff: (() => void) | null = null;

  private slots = new Map<string, Slot>();

  private places = new WeakMap<object, Place>();

  private legacy: LegacyTree | null = null;

  private tabBarEl: HTMLElement | null = null;
  private blurbEl: HTMLElement | null = null;
  private railEl: HTMLElement | null = null;

  constructor(
    app: App,
    private readonly plugin: CorvusPlugin
  ) {
    super(app, plugin);

    this.icon = "bot";
    this.prepareRoot();
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    try {
      return this.buildTree();
    } catch (err) {

      console.error("[corvus] settings: tree failed — falling back to display()", err);
      return [];
    }
  }

  display(): void {
    this.desenharLegado();
  }

  private desenharLegado(): void {
    this.legacy?.dispose();
    this.slots.clear();
    this.containerEl.empty();
    this.prepareRoot();
    this.legacy = drawLegacyTree(this.containerEl, this.buildTree(), {
      get: (key) => this.readValue(key),
      set: (key, value) => this.writeValue(key, value),
    });
  }

  hide(): void {
    this.pararAmostra();
    super.hide();
  }

  getControlValue(key: string): unknown {
    return this.readValue(key);
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    await this.writeValue(key, value);
  }

  getElementForDefinition(def: unknown): HTMLElement | null | undefined {
    const place = def && typeof def === "object" ? this.places.get(def) : undefined;
    if (place) {
      this.setTab(place.tab);
      if (place.provider) this.setProvider(place.provider);
    }
    const base = (PluginSettingTab.prototype as unknown as DefinitionLookup)
      .getElementForDefinition;

    return base?.call(this, def);
  }

  private buildTree(): SettingDefinitionItem[] {
    const tree = buildSettingsTree(this.ui());
    this.places = tree.places;
    return tree.items;
  }

  private readValue(key: string): unknown {
    return isControlKey(key) ? readControl(this.s, key) : undefined;
  }

  private async writeValue(key: string, value: unknown): Promise<void> {

    if (key === "hapticsEnabled") setHapticsEnabled(value === true);
    if (!(await writeControl(this.plugin, key, value))) return;
    switch (key) {
      case "chatsPath":
        void this.plugin.loadChatSummaries(true);
        break;
      case "skillsPath":
        await this.plugin.reloadSkills();
        break;
      case "hapticsEnabled":

        if (value === true) tap();
        break;
      case "language":
        this.retraduzir();
        break;
      case "openaiDataSharing":
      case "openaiTier":

        this.repaint("catalog:openai");
        this.repaint("freeOffer");
        break;
      case "ragQuantProfile":
      case "ragStreamShards":

        this.repaint("index");
        break;
      case "ragIndexPath":

        this.repaint("index");
        window.clearTimeout(this.timerDoIndice);
        this.timerDoIndice = window.setTimeout(() => {
          void this.plugin.loadVectorIndex().then(() => this.repaint("index"));
        }, 800);
        break;
    }
  }

  private retraduzir(): void {
    if (requireApiVersion("1.13.0")) this.update();
    else this.desenharLegado();
  }

  private refreshVisibility(): void {
    this.legacy?.refresh();
    if (requireApiVersion("1.13.0")) this.refreshDomState();
  }

  private ui(): SettingsUi {
    return {
      isMobile: Platform.isMobile,
      settings: () => this.plugin.settings,
      hasCredential: (id) => !!this.plugin.providerCredential(id),
      freeOfferCount: () => this.freeOfferCount(),
      nav: (row) => this.renderNav(row),
      rail: (row) => this.renderRail(row),
      credential: (id) =>
        this.slot(`cred:${id}`, "providers", (row) => this.paintCredential(row, id)),
      connection: (id) =>
        this.slot(`conn:${id}`, "providers", (row) => this.paintConnection(row, id)),

      newChatModel: (id) =>
        this.slot(`model:${id}`, "providers", (row) => this.paintNewChatModel(row, id)),
      fetchModels: (id) =>
        this.slot(`fetch:${id}`, "providers", (row) => this.paintFetch(row, id)),
      catalog: (id) =>
        this.slot(`catalog:${id}`, "providers", (row) => this.paintCatalog(row, id)),
      freeOffer: this.slot("freeOffer", "providers", (row) =>
        this.paintHint(row, this.freeOfferText())
      ),
      pick: (key, items, tab) =>
        this.slot(`pick:${key}`, tab, (row) => this.paintPick(row, key, items)),
      effortLevel: (level) =>
        this.slot(`effort:${level}`, "chat", (row) => this.paintEffortLevel(row, level)),
      assistantModel: this.slot("assistant", "chat", (row) =>
        this.paintAssistantModel(row)
      ),
      ttsProvider: this.slot("ttsWho", "chat", (row) => this.paintTtsProvider(row)),
      elevenKey: (row) => this.paintElevenKey(row),
      tavilyKey: (row) => this.paintTavilyKey(row),
      spendLimit: (row) => this.paintSpendLimit(row),
      elevenFetch: this.slot("elevenFetch", "chat", (row) => this.paintElevenFetch(row)),
      elevenVoice: this.slot("elevenVoice", "chat", (row) => this.paintElevenVoice(row)),
      testVoice: (row) => this.paintTestVoice(row),
      embeddingModel: this.slot("embedding", "rag", (row) =>
        this.paintEmbeddingModel(row)
      ),
      index: this.slot("index", "rag", (row) => this.paintIndex(row)),
      hint: (text) => (row) => this.paintHint(row, text),
    };
  }

  private slot(id: string, tab: TabId, paint: (row: Setting) => void): RowRender {
    return (row) => {
      const entry: Slot = { row, paint, tab };
      this.slots.set(id, entry);
      paint(row);
      return () => {
        if (this.slots.get(id) === entry) this.slots.delete(id);
      };
    };
  }

  private repaint(id: string): void {
    const entry = this.slots.get(id);
    if (!entry) return;
    entry.row.clear();
    entry.paint(entry.row);
  }

  private prepareRoot(): void {
    const el = this.containerEl;
    el.addClass("corvus-settings-root");
    const tabs = tabsFor(Platform.isMobile);
    if (!tabs.some((t) => t.id === this.tab)) this.tab = tabs[0].id;
    if (!PROVIDER_FIELDS[this.provider]) this.provider = PROVIDERS[0].id;
    el.dataset.corvusTab = this.tab;
    el.dataset.corvusProv = this.provider;
  }

  private blurbOf(id: TabId): string {
    const blurb = tabsFor(Platform.isMobile).find((t) => t.id === id)?.blurb;
    return blurb ? tr(blurb) : "";
  }

  private renderNav(row: Setting): () => void {
    this.prepareRoot();

    this.hapticsOff?.();
    const off = hapticsOn(this.containerEl);
    this.hapticsOff = off;

    const el = row.settingEl;
    el.empty();
    el.addClass("corvus-set-block", "corvus-set-navrow");
    const nav = el.createDiv({ cls: "corvus-seg corvus-settings-nav" });
    for (const t of tabsFor(Platform.isMobile)) {
      const active = t.id === this.tab;
      const btn = nav.createEl("button", {
        text: tr(t.label),
        cls: active ? "corvus-seg-item is-active" : "corvus-seg-item",
        attr: { type: "button", "aria-pressed": String(active), "data-tab": t.id },
      });
      btn.onclick = () => this.setTab(t.id);
    }
    const blurb = el.createEl("p", {
      cls: "corvus-settings-blurb",
      text: this.blurbOf(this.tab),
    });
    this.tabBarEl = nav;
    this.blurbEl = blurb;
    this.placeThumb(nav);

    return () => {
      off();
      if (this.hapticsOff === off) this.hapticsOff = null;
      if (this.tabBarEl === nav) this.tabBarEl = null;
      if (this.blurbEl === blurb) this.blurbEl = null;
    };
  }

  private setTab(id: TabId): void {
    if (!tabsFor(Platform.isMobile).some((t) => t.id === id)) return;
    const changed = id !== this.tab;
    this.tab = id;
    this.containerEl.dataset.corvusTab = id;
    if (this.tabBarEl) {
      for (const btn of Array.from(
        this.tabBarEl.querySelectorAll<HTMLElement>(".corvus-seg-item")
      )) {
        const active = btn.dataset.tab === id;
        btn.toggleClass("is-active", active);
        btn.setAttribute("aria-pressed", String(active));
      }
      this.placeThumb(this.tabBarEl);
    }
    this.blurbEl?.setText(this.blurbOf(id));

    if (id === "providers" && this.railEl) this.placeThumb(this.railEl);
    if (!changed) return;

    for (const [slotId, slot] of this.slots) {
      if (slot.tab === id) this.repaint(slotId);
    }
    this.refreshVisibility();
  }

  private placeThumb(row: HTMLElement): void {
    const put = () => putThumb(row);
    put();

    row.win.requestAnimationFrame(put);
  }

  private renderRail(row: Setting): () => void {
    const el = row.settingEl;
    el.empty();
    el.addClass("corvus-set-block", "corvus-set-railrow");
    const sub = el.createDiv({ cls: "corvus-seg corvus-settings-subnav" });
    for (const p of PROVIDERS) {
      const active = p.id === this.provider;
      const btn = sub.createEl("button", {
        cls: "corvus-seg-item" + (active ? " is-active" : ""),

        attr: {
          type: "button",
          "aria-pressed": String(active),
          "aria-label": p.name,
          title: p.name,
          "data-provider": p.id,
        },
      });
      const mark = btn.createSpan({ cls: "corvus-seg-logo" });
      setIcon(mark, p.icon);

      mark.createSpan({ cls: "corvus-seg-dot" });
      btn.onclick = () => this.setProvider(p.id);
    }
    this.railEl = sub;
    this.syncReady();
    this.placeThumb(sub);
    return () => {
      if (this.railEl === sub) this.railEl = null;
    };
  }

  private setProvider(id: string): void {
    if (!PROVIDER_FIELDS[id]) return;
    const old = this.provider;
    this.provider = id;
    this.containerEl.dataset.corvusProv = id;
    if (this.railEl) {
      for (const btn of Array.from(
        this.railEl.querySelectorAll<HTMLElement>(".corvus-seg-item")
      )) {
        const active = btn.dataset.provider === id;
        btn.toggleClass("is-active", active);
        btn.setAttribute("aria-pressed", String(active));
      }
      this.placeThumb(this.railEl);
    }
    if (old === id) return;

    this.kind = "all";

    this.repaint(`catalog:${old}`);
    this.repaint(`catalog:${id}`);
  }

  private connOf(id: string): ConnState {
    const live = this.conn[id];
    if (live) return live;
    const saved = this.s.providerStatus?.[id];
    if (!saved) return { state: "unknown" };
    return { state: saved.ok ? "ok" : "fail", detail: saved.detail };
  }

  private healthOf(id: string): ProviderHealth {
    if (!providerConfigured(this.plugin, id)) return "off";
    const live = this.conn[id];
    if (live?.state === "ok") return "ok";
    if (live?.state === "fail") return "fail";
    return providerHealth(this.plugin, id);
  }

  private syncReady(): void {
    if (!this.railEl) return;
    for (const btn of Array.from(
      this.railEl.querySelectorAll<HTMLElement>(".corvus-seg-item")
    )) {
      const id = btn.dataset.provider;
      if (!id) continue;
      btn.toggleClass("is-ready", providerConfigured(this.plugin, id));
      const health = this.healthOf(id);
      const dot = btn.querySelector<HTMLElement>(".corvus-seg-dot");
      if (dot) {
        dot.className = `corvus-seg-dot is-${health}`;
        dot.setAttribute("aria-hidden", "true");
      }
      btn.setAttribute(
        "title",
        `${PROVIDERS.find((x) => x.id === id)?.name ?? id} · ${tr(HEALTH_TEXT[health])}`
      );
    }
  }

  private get s() {
    return this.plugin.settings;
  }
  private save = () => this.plugin.saveSettings();

  private paintCredential(row: Setting, providerId: string): void {
    const f = PROVIDER_FIELDS[providerId];
    if (!f) return;
    const s = this.s;

    const changed = () => {
      this.syncReady();
      this.repaint(`conn:${providerId}`);
      this.refreshVisibility();
    };
    if (f.key) {
      const key = f.key;
      row.addText((t) => {
        t.inputEl.type = "password";
        t.setPlaceholder(tr("key…"))
          .setValue(s[key])
          .onChange(async (v) => {
            s[key] = v.trim();
            await this.save();
            changed();
          });
      });
    } else {
      row.addText((t) =>
        t
          .setPlaceholder("http://localhost:11434")
          .setValue(s.ollamaEndpoint)
          .onChange(async (v) => {
            s.ollamaEndpoint = v.trim();
            await this.save();
            changed();
            this.conferirOllamaDepois();
          })
      );
    }
  }

  private conferirOllamaDepois(): void {

    if (this.catalog.ollama) {
      delete this.catalog.ollama;
      this.repaint("catalog:ollama");
    }
    if (this.timerDoOllama !== null) window.clearTimeout(this.timerDoOllama);
    this.timerDoOllama = window.setTimeout(() => {
      this.timerDoOllama = null;
      void (async () => {
        const instalados = await this.plugin.conferirOllama({ soDeFabrica: false });
        if (instalados === null) return;
        this.catalog.ollama = instalados;
        this.repaint("catalog:ollama");
        this.repaint("model:ollama");

        await this.plugin.scanEmbeddings("ollama");
        this.repaint("embedding");
      })();
    }, 900);
  }

  private paintConnection(row: Setting, providerId: string): void {
    const st = this.connOf(providerId);
    row.setDesc(CONN_TEXT[st.state](st.detail));
    row.addButton((b) => {
      b.setButtonText(st.state === "testing" ? tr("Testing…") : tr("Test"))
        .setDisabled(
          st.state === "testing" || !providerConfigured(this.plugin, providerId)
        )
        .onClick(() => void this.testConnection(providerId));
    });
    row.nameEl.addClass("corvus-conn-name");
    row.nameEl.querySelector(".corvus-conn-dot")?.remove();
    row.nameEl.prepend(row.nameEl.createSpan({ cls: `corvus-conn-dot is-${st.state}` }));
    row.descEl.removeClass("is-unknown", "is-testing", "is-ok", "is-fail");
    row.descEl.addClass("corvus-conn-desc", `is-${st.state}`);
  }

  private async testConnection(providerId: string): Promise<void> {
    if (this.conn[providerId]?.state === "testing") return;
    this.conn[providerId] = { state: "testing" };
    this.repaint(`conn:${providerId}`);
    try {
      const desde = this.s.ollamaEndpoint;
      const models = await this.plugin.scanModels(providerId);

      const doEnderecoAtual = providerId !== "ollama" || this.s.ollamaEndpoint === desde;
      if (doEnderecoAtual && (models.length > 0 || providerId === "ollama")) {
        this.catalog[providerId] = models;
      }
      this.conn[providerId] = {
        state: "ok",
        detail:
          models.length === 0
            ? tr("The provider answered, but listed no models.")
            : models.length === 1
              ? tr("1 model available.")
              : tr("{n} models available.", { n: models.length }),
      };
    } catch (err) {
      this.conn[providerId] = {
        state: "fail",
        detail: err instanceof Error ? err.message : String(err),
      };
    }

    const now = this.conn[providerId];
    (this.s.providerStatus ??= {})[providerId] = {
      ok: now.state === "ok",
      at: Date.now(),
      detail: now.detail,
    };
    await this.save();
    this.repaint(`conn:${providerId}`);
    this.repaint(`catalog:${providerId}`);
    this.repaint(`model:${providerId}`);
    this.syncReady();
    if (providerId === "openai") this.freeOfferChanged();
  }

  private paintNewChatModel(row: Setting, providerId: string): void {
    const f = PROVIDER_FIELDS[providerId];
    if (!f) return;
    const field = f.model;
    row.addText((t) =>
      t.setValue(this.s[field]).onChange(async (v) => {
        const m = v.trim();
        if (!m) return;
        this.s[field] = m;
        this.addToList("activeModels", providerId, m);
        await this.save();
      })
    );
  }

  private paintFetch(row: Setting, providerId: string): void {
    const busy = this.fetchingFor === providerId;
    row.addButton((b) =>
      b
        .setButtonText(busy ? tr("Fetching…") : tr("Fetch models"))
        .setCta()
        .setDisabled(this.fetchingFor !== null)
        .onClick(() => void this.fetchModels(providerId))
    );
  }

  private async fetchModels(providerId: string): Promise<void> {
    if (this.fetchingFor) return;
    this.fetchingFor = providerId;
    this.repaint(`fetch:${providerId}`);
    this.repaint(`catalog:${providerId}`);
    try {

      const desde = this.s.ollamaEndpoint;
      const [models, embeds] = await Promise.all([
        this.plugin.scanModels(providerId),
        this.plugin.scanEmbeddings(providerId),
      ]);

      if (providerId === "ollama" && this.s.ollamaEndpoint !== desde) return;
      this.catalog[providerId] = models;

      if (embeds.length > 0 || providerId === "ollama") this.repaint("embedding");

      const gratis = models.filter((m) => this.tagGratis(providerId, m) !== null).length;
      const partes = [
        models.length === 1
          ? tr("1 model found")
          : tr("{n} models found", { n: models.length }),
        ...(gratis > 0 ? [tr("{n} free", { n: gratis })] : []),
        ...(embeds.length > 0
          ? [tr("{n} for Vault Q&A embeddings", { n: embeds.length })]
          : []),
      ];
      new Notice(
        models.length > 0
          ? `${partes.join(" · ")}.`
          : tr("No models returned — check the key or the endpoint.")
      );
    } catch (err) {
      console.error("[corvus] scanModels failed:", err);
      new Notice(
        tr("Fetch failed: {error}", {
          error: err instanceof Error ? err.message : String(err),
        })
      );
    } finally {
      this.fetchingFor = null;
      this.repaint(`fetch:${providerId}`);
      this.repaint(`catalog:${providerId}`);
      this.repaint(`model:${providerId}`);
      if (providerId === "openai") this.freeOfferChanged();
    }
  }

  private freeOfferCount(): number {
    return (this.catalog.openai ?? this.s.activeModels.openai ?? []).filter(
      (m) => openaiFreeTierForModel(m) !== null
    ).length;
  }

  private freeOfferText(): string {
    const n = this.freeOfferCount();
    return n === 1
      ? tr("1 model in this list would get a daily quota — it is the one marked with a \"+\".")
      : tr(
          "{n} models in this list would get a daily quota — they are the ones marked with a \"+\".",
          { n }
        );
  }

  private freeOfferChanged(): void {
    this.repaint("freeOffer");
    this.refreshVisibility();
  }

  private paintHint(row: Setting, text: string): void {
    const el = row.settingEl;
    el.empty();
    el.addClass("corvus-set-block", "corvus-set-hint");
    el.createEl("p", { cls: "corvus-settings-hint", text });
  }

  private paintCatalog(row: Setting, providerId: string): void {
    const el = row.settingEl;

    const velho = el.querySelector<HTMLElement>(".corvus-models-filter");
    const thumb = velho ? thumbOf(velho) : null;
    el.empty();
    el.addClass("corvus-set-block", "corvus-set-catalog");
    if (providerId !== this.provider) return;
    this.drawModels(el.createDiv({ cls: "corvus-models" }), providerId, thumb);
  }

  private drawModels(
    list: HTMLElement,
    providerId: string,
    thumb?: Thumb | null
  ): void {
    const redraw = () => this.repaint(`catalog:${providerId}`);

    const shown = this.s.activeModels[providerId] ?? [];
    const favs = this.s.favoriteModels?.[providerId] ?? [];
    const models = Array.from(
      new Set([...(this.catalog[providerId] ?? []), ...shown, ...favs])
    ).sort();

    if (models.length === 0) {
      list.createEl("p", {
        cls: "corvus-models-empty",
        text:
          this.fetchingFor === providerId
            ? tr("Fetching…")
            : tr("No models yet — fetch the catalog, or type one in the field above."),
      });
      return;
    }

    const head = list.createDiv({ cls: "corvus-models-head" });
    head.createSpan({
      text: models.length === 1 ? tr("1 model") : tr("{n} models", { n: models.length }),
    });
    head.createSpan({
      cls: "corvus-models-legend",
      text: tr("Show · Favorite ({n}/{max})", { n: favs.length, max: FAVORITE_LIMIT }),
    });

    const groups = buildModelCatalog(providerId, models);
    if (
      this.kind !== "all" &&
      this.kind !== "free" &&
      !groups.some((g) => g.id === this.kind)
    ) {
      this.kind = "all";
    }

    if (favs.length > 0) {
      const sec = list.createDiv({ cls: "corvus-models-fav" });
      const cab = sec.createDiv({ cls: "corvus-models-fav-head" });
      const ico = cab.createSpan({ cls: "corvus-models-fav-ico" });
      setIcon(ico, "star");
      cab.createSpan({ text: tr("Favorites") });
      cab.createSpan({
        cls: "corvus-model-section-count",
        text: `${favs.length}/${FAVORITE_LIMIT}`,
      });
      for (const m of [...favs].sort()) this.modelRow(sec, providerId, m, redraw);
    }

    const gratis = models.filter((m) => this.tagGratis(providerId, m) !== null);
    if (gratis.length > 0) {
      head.firstElementChild?.setText(
        models.length === 1
          ? tr("1 model · {free} free", { free: gratis.length })
          : tr("{n} models · {free} free", { n: models.length, free: gratis.length })
      );
    }

    if (groups.length > 1 || gratis.length > 0) {
      const filter = list.createDiv({ cls: "corvus-seg corvus-models-filter" });
      seedThumb(filter, thumb);
      const items = [
        { id: "all", label: tr("All"), icon: "layers" },
        ...(gratis.length > 0
          ? [{ id: "free", label: tr("Free"), icon: "gift" }]
          : []),
        ...groups.map((g) => ({ id: g.id, label: g.label, icon: g.icon })),
      ];
      for (const it of items) {
        const active = it.id === this.kind;
        const btn = filter.createEl("button", {
          cls: "corvus-seg-item" + (active ? " is-active" : ""),
          attr: {
            type: "button",
            "aria-pressed": String(active),
            "aria-label": it.label,
            title: it.label,
          },
        });
        const mark = btn.createSpan({ cls: "corvus-seg-ico" });
        setIcon(mark, it.icon);

        if (active) btn.createSpan({ cls: "corvus-seg-label", text: it.label });
        btn.onclick = () => {
          this.kind = it.id;
          redraw();
        };
      }
      this.placeThumb(filter);
    }

    const multi = PROVIDERS_MULTI_FABRICANTE.has(providerId);

    const panes: { key: string; sec: HTMLElement; wrap: HTMLElement }[] = [];
    const vendors: { key: string; sec: HTMLElement; body: HTMLElement }[] = [];
    const applyOpen = () => {
      for (const pane of panes) {
        const closed = pane.key !== this.openFam;
        pane.sec.toggleClass("is-closed", closed);
        pane.wrap.toggleClass("is-closed", closed);
        pane.sec.setAttribute("aria-expanded", String(!closed));
      }
      for (const v of vendors) {
        const closed = v.key !== this.openVendor;
        v.sec.toggleClass("is-closed", closed);
        v.body.toggleClass("is-closed", closed);
        v.sec.setAttribute("aria-expanded", String(!closed));
      }
    };

    const fabricanteSec = (chave: string, nome: string, total: number, exemplo: string) => {
      const key = `${providerId}:v:${chave}`;
      const closed = key !== this.openVendor;
      const sec = list.createEl("button", {
        cls: closed ? "corvus-model-vendor is-closed" : "corvus-model-vendor",
        attr: { type: "button", "aria-expanded": String(!closed) },
      });
      setIcon(sec.createSpan({ cls: "corvus-model-vendor-ico" }), modelLogo(exemplo));
      sec.createSpan({ cls: "corvus-model-vendor-name", text: nome });
      sec.createSpan({ cls: "corvus-model-section-count", text: String(total) });
      setIcon(sec.createSpan({ cls: "corvus-model-section-chev" }), "chevron-down");
      const body = list.createDiv({
        cls: closed ? "corvus-model-vendor-body is-closed" : "corvus-model-vendor-body",
      });
      vendors.push({ key, sec, body });
      sec.onclick = () => {
        this.openVendor = this.openVendor === key ? null : key;
        applyOpen();
      };
      return body;
    };

    const classeSec = (
      host: HTMLElement,
      key: string,
      g: { id: string; label: string; icon: string },
      fam: { id: string; label: string; icon: string; models: string[] }
    ) => {

      const orfa = fam.id === "other";
      const closed = key !== this.openFam;
      const sec = host.createEl("button", {
        cls: closed ? "corvus-model-section is-closed" : "corvus-model-section",
        attr: { type: "button", "aria-expanded": String(!closed) },
      });
      const mark = sec.createSpan({ cls: "corvus-model-section-ico" });
      setIcon(mark, orfa ? g.icon : fam.icon);
      sec.createSpan({
        cls: "corvus-model-section-name",
        text: orfa ? g.label : fam.label,
      });

      if (this.kind === "all" && !orfa) {
        sec.createSpan({ cls: "corvus-model-section-role", text: g.label });
      }
      sec.createSpan({
        cls: "corvus-model-section-count",
        text: String(fam.models.length),
      });
      const chev = sec.createSpan({ cls: "corvus-model-section-chev" });
      setIcon(chev, "chevron-down");

      const wrap = host.createDiv({
        cls: closed ? "corvus-model-fam is-closed" : "corvus-model-fam",
      });
      for (const m of fam.models) this.modelRow(wrap, providerId, m, redraw);

      panes.push({ key, sec, wrap });
      sec.onclick = () => {
        this.openFam = this.openFam === key ? null : key;
        applyOpen();
      };
    };

    if (this.kind === "free") {
      const nota = this.notaGratis(providerId);
      if (nota) list.createEl("p", { cls: "corvus-models-free-note", text: nota });
      if (gratis.length === 0) {
        list.createEl("p", {
          cls: "corvus-models-empty",
          text: tr("Nothing free in this catalog."),
        });
        return;
      }
      if (!multi) {
        const wrap = list.createDiv({ cls: "corvus-model-fam" });
        for (const m of gratis) this.modelRow(wrap, providerId, m, redraw);
        return;
      }
      for (const v of soltosPorFabricante(gratis)) {
        const body = fabricanteSec(v.fabricante.chave, v.fabricante.nome, v.models.length, v.models[0]);
        const wrap = body.createDiv({ cls: "corvus-model-fam" });
        for (const m of v.models) this.modelRow(wrap, providerId, m, redraw);
      }
      return;
    }

    const visible =
      this.kind === "all" ? groups : groups.filter((g) => g.id === this.kind);

    if (!multi) {
      for (const g of visible) {
        for (const fam of g.families) {
          classeSec(list, `${providerId}:${g.id}:${fam.id}`, g, fam);
        }
      }
      return;
    }

    for (const v of porFabricante(visible)) {
      const body = fabricanteSec(
        v.fabricante.chave,
        v.fabricante.nome,
        v.total,
        v.secoes[0].family.models[0]
      );
      if (v.secoes.length === 1) {
        const wrap = body.createDiv({ cls: "corvus-model-fam" });
        for (const m of v.secoes[0].family.models) this.modelRow(wrap, providerId, m, redraw);
        continue;
      }
      for (const s of v.secoes) {
        classeSec(
          body,
          `${providerId}:${v.fabricante.chave}:${s.roleId}:${s.family.id}`,
          { id: s.roleId, label: s.roleLabel, icon: s.roleIcon },
          s.family
        );
      }
    }
  }

  private tagGratis(providerId: string, m: string): FreeTag | null {
    return freeTag(providerId, m, {
      free: gratisDeVerdade(
        m,
        this.s.freeModels?.[providerId],
        getModelCapabilities(providerId, m).free === true
      ),
      dataSharing: this.s.openaiDataSharing === true,
      tier: this.s.openaiTier ?? 1,
      cota: this.s.freeQuota?.[providerId],
    });
  }

  private notaGratis(providerId: string): string | null {
    if (providerId === "openrouter") {

      const c = this.s.freeQuota?.[providerId];
      if (!c) {
        return tr(
          "No cost, checked by price, not by the \":free\" in the name. They share 20 requests a minute and 50 a day (1,000 once you've bought $10 in credits)."
        );
      }
      const n = c.limit.toLocaleString(uiLocale());
      return c.limit >= 1000
        ? tr(
            "No cost, checked by price, not by the \":free\" in the name. They share 20 requests a minute and {n} a day on this key.",
            { n }
          )
        : tr(
            "No cost, checked by price, not by the \":free\" in the name. They share 20 requests a minute and {n} a day on this key (1,000 once you've bought $10 in credits).",
            { n }
          );
    }
    if (providerId === "nim") {
      return tr(
        "No cost: the models NVIDIA marks as Free Endpoint, for development and testing, 40 requests a minute. The rest of NIM isn't part of the free tier."
      );
    }
    return null;
  }

  private modelRow(
    host: HTMLElement,
    providerId: string,
    m: string,
    redraw: () => void
  ): void {
    const shown = this.s.activeModels[providerId] ?? [];
    const favs = this.s.favoriteModels?.[providerId] ?? [];

    const row = host.createDiv({ cls: "corvus-model-row" });
    const info = row.createDiv({ cls: "corvus-model-info" });
    const title = info.createDiv({ cls: "corvus-model-name" });
    title.createSpan({ text: prettyModelName(m) });

    const tag = this.tagGratis(providerId, m);
    if (tag) {
      title.createSpan({
        cls: `corvus-tag is-free is-${tag.kind}`,
        text: tag.label,
        attr: { title: tag.detail },
      });
    }
    info.createDiv({ cls: "corvus-model-id", text: m });

    const actions = row.createDiv({ cls: "corvus-model-actions" });

    const isShown = shown.includes(m);
    const showBtn = actions.createEl("button", {
      cls: isShown ? "corvus-model-toggle is-on" : "corvus-model-toggle",
      text: tr("Show"),
      attr: {
        type: "button",
        "aria-pressed": String(isShown),
        title: tr("Appears in this provider's model list"),
      },
    });
    showBtn.onclick = async () => {
      this.toggleInList("activeModels", providerId, m);
      await this.save();
      redraw();
    };

    const isFav = favs.includes(m);
    const favBtn = actions.createEl("button", {
      cls: isFav ? "corvus-model-toggle is-fav" : "corvus-model-toggle",
      attr: {
        type: "button",
        "aria-pressed": String(isFav),
        title: tr("Appears on the new-chat screen (max {n})", { n: FAVORITE_LIMIT }),
      },
    });
    setIcon(favBtn, isFav ? "star" : "star-off");
    favBtn.onclick = async () => {
      const list = this.s.favoriteModels?.[providerId] ?? [];
      if (!list.includes(m) && list.length >= FAVORITE_LIMIT) {
        new Notice(
          tr("{n} favorites per provider is the limit — unstar one first.", {
            n: FAVORITE_LIMIT,
          })
        );
        return;
      }
      this.toggleInList("favoriteModels", providerId, m);

      if (this.s.favoriteModels[providerId]?.includes(m)) {
        this.addToList("activeModels", providerId, m);
      }
      await this.save();
      redraw();
    };
  }

  private addToList(
    field: "activeModels" | "favoriteModels",
    providerId: string,
    model: string
  ): void {
    const map = (this.s[field] ??= {});
    const list = map[providerId] ?? [];
    if (!list.includes(model)) map[providerId] = [model, ...list];
  }

  private toggleInList(
    field: "activeModels" | "favoriteModels",
    providerId: string,
    model: string
  ): void {
    const map = (this.s[field] ??= {});
    const list = map[providerId] ?? [];
    map[providerId] = list.includes(model)
      ? list.filter((x) => x !== model)
      : [model, ...list];
  }

  private pickButton(
    row: Setting,
    opts: {
      items: PickItem[];
      value: string;
      onPick: (value: string) => void | Promise<void>;

      ouvir?: (value: string) => string;
    }
  ): void {
    const { items, value, ouvir } = opts;
    const atual = items.find((i) => i.value === value);
    const btn = row.controlEl.createEl("button", {
      cls: "corvus-pick",
      attr: {
        type: "button",
        "aria-haspopup": "menu",
        "aria-label": `${row.nameEl.textContent ?? ""}: ${atual?.label ?? value}`,
      },
    });
    const ico = btn.createSpan({ cls: "corvus-pick-ico" });
    if (atual?.glyph) {
      ico.addClass("is-glyph");
      ico.setText(atual.glyph);
    } else if (atual?.icon) {
      setIcon(ico, atual.icon);
    }

    btn.createSpan({ cls: "corvus-pick-label", text: atual?.label ?? value });
    setIcon(btn.createSpan({ cls: "corvus-pick-chev" }), "chevrons-up-down");
    btn.onclick = (ev) =>
      openActions(
        ev,
        items.map((i) => ({
          label: i.label,
          icon: i.icon,
          glyph: i.glyph,
          checked: i.value === value,
          extra: ouvir && {
            icon: "play",
            label: tr("Play {name}", { name: i.label }),
            run: (b: HTMLButtonElement) => this.tocarAmostra(b, i.value, ouvir(i.value)),
          },
          run: () => {
            if (i.value !== value) void opts.onPick(i.value);
          },
        })),
        { escolha: true, aoFechar: ouvir && (() => this.pararAmostra()) }
      );
  }

  private paintPick(row: Setting, key: TextKey, items: () => PickItem[]): void {
    const atual = this.readValue(key);
    this.pickButton(row, {
      items: items(),

      value: typeof atual === "string" ? atual : "",
      onPick: async (v) => {
        await this.writeValue(key, v);
        this.repaint(`pick:${key}`);

        this.refreshVisibility();
      },

      ouvir: key === "ttsVoice" ? nomeProprio : undefined,
    });
  }

  private paintEffortLevel(row: Setting, level: EffortLevel): void {
    const s = this.s;

    row.nameEl.querySelector(".corvus-effort-ico")?.remove();
    const ico = row.nameEl.createSpan({ cls: "corvus-effort-ico" });
    setIcon(ico, EFFORT_ICONS[level]);
    row.nameEl.prepend(ico);
    const editado = nivelEditado(s.effortConfigs, level);
    row.setDesc(resumoDoNivel(s.effortConfigs, level) + (editado ? ` · ${tr("edited")}` : ""));
    row.addButton((b) =>
      b.setButtonText(tr("Edit")).onClick(() => {
        new EffortLevelModal(this.app, this.plugin, level, () =>
          this.repaint(`effort:${level}`)
        ).open();
      })
    );
  }

  private paintAssistantModel(row: Setting): void {
    const s = this.s;
    const alvo = escolherAssistente({
      assistantProvider: s.assistantProvider,
      assistantModel: s.assistantModel,
      favoriteModels: s.favoriteModels,
      activeModels: s.activeModels,
      freeModels: s.freeModels,
    });
    const livres = s.freeModels?.openrouter ?? [];

    row.setDesc(
      alvo
        ? tr("Writes skills and projects for you. Now: {model}", {
            model:
              prettyModelName(alvo.model) +
              (ehFree(alvo.model, livres) ? ` · ${tr("free")}` : ""),
          })
        : tr("Nothing free found yet — run SCAN on OpenRouter, or pick a model here.")
    );

    const todos = [
      ...new Set([...(s.activeModels?.openrouter ?? []), ...livres]),
    ].sort();
    this.pickButton(row, {
      items: [

        {
          value: "",

          label: tr("Automatic — first free model"),
          icon: "wand-sparkles",
        },
        ...todos.map((id) => ({
          value: id,
          label: ehFree(id, livres)
            ? `${prettyModelName(id)} · ${tr("free")}`
            : prettyModelName(id),
          icon: modelLogo(id),
        })),
      ],
      value: s.assistantModel ?? "",
      onPick: async (v) => {
        s.assistantModel = v;
        s.assistantProvider = v ? "openrouter" : "";
        await this.save();
        this.repaint("assistant");
      },
    });
  }

  private paintTtsProvider(row: Setting): void {
    const s = this.s;
    this.pickButton(row, {
      items: TTS_PROVIDERS.map((p) => ({
        value: p.id,
        label: ttsReady(this.plugin, p.id)
          ? p.label
          : tr("{provider} (needs {what})", { provider: p.label, what: tr(p.needs) }),

        icon: p.id === "openai" ? "logo-openai" : "audio-waveform",
      })),
      value: s.ttsProvider,
      onPick: async (v) => {
        s.ttsProvider = v;
        await this.save();
        this.repaint("ttsWho");
        this.refreshVisibility();
      },
    });
  }

  private paintElevenKey(row: Setting): void {
    const s = this.s;
    row.addText((t) => {
      t.inputEl.type = "password";
      t.setPlaceholder(tr("key…"))
        .setValue(s.elevenApiKey)
        .onChange(async (v) => {
          s.elevenApiKey = v.trim();
          await this.save();

          this.repaint("ttsWho");
          this.refreshVisibility();
        });
    });
  }

  private paintSpendLimit(row: Setting): void {
    const s = this.s;
    row.addText((t) => {
      t.inputEl.type = "number";
      t.inputEl.min = "0";
      t.inputEl.step = "0.5";
      t.inputEl.inputMode = "decimal";
      t.setPlaceholder(tr("No limit"))
        .setValue(s.limiteGastoDiario > 0 ? String(s.limiteGastoDiario) : "")
        .onChange(async (v) => {
          const n = Number(v.replace(",", "."));
          s.limiteGastoDiario = Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
          await this.save();
        });
    });
  }

  private paintTavilyKey(row: Setting): void {
    const s = this.s;
    row.addText((t) => {
      t.inputEl.type = "password";
      t.setPlaceholder(tr("Starts with tvly"))
        .setValue(s.tavilyApiKey ?? "")
        .onChange(async (v) => {
          s.tavilyApiKey = v.trim();
          await this.save();
        });
    });
  }

  private paintElevenFetch(row: Setting): void {
    row.addButton((b) =>
      b
        .setButtonText(this.fetchingVoices ? tr("Fetching…") : tr("Fetch voices"))
        .setCta()

        .setDisabled(this.fetchingVoices)
        .onClick(() => void this.fetchVoices())
    );
  }

  private paintElevenVoice(row: Setting): void {
    const s = this.s;
    if (s.elevenVoices.length === 0) return;
    this.pickButton(row, {
      items: s.elevenVoices.map((v) => {

        const own = v.category === "cloned" || v.category === "professional";
        return {
          value: v.id,
          label: own ? `${v.name} · ${tr("yours")}` : v.name,
          icon: own ? "user-round" : "audio-lines",
        };
      }),
      value: s.elevenVoice || s.elevenVoices[0].id,
      onPick: async (v) => {
        s.elevenVoice = v;
        await this.save();
        this.repaint("elevenVoice");
      },
      ouvir: (id) => s.elevenVoices.find((v) => v.id === id)?.name ?? "ElevenLabs",
    });
  }

  private paintTestVoice(row: Setting): void {
    row.addButton((b) =>
      b.setButtonText(tr("Play sample")).onClick(async () => {
        b.setButtonText(tr("Playing…")).setDisabled(true);

        await speak(this.plugin, fraseDaAmostra(this.nomeDaVozAtual(), this.idiomaDaAmostra()), {
          guardar: true,
        });
        b.setButtonText(tr("Play sample")).setDisabled(false);
      })
    );
  }

  private tocarAmostra(botao: HTMLButtonElement, voz: string, nome: string): void {
    if (this.amostra === botao) {
      stopSpeaking();
      return;
    }
    const rotulo = botao.getAttribute("aria-label") ?? tr("Play");
    const desenhar = (estado: "parado" | "buscando" | "tocando") => {
      botao.toggleClass("is-loading", estado === "buscando");
      botao.toggleClass("is-playing", estado === "tocando");
      setIcon(botao, estado === "parado" ? "play" : estado === "buscando" ? "loader" : "square");
      botao.setAttribute("aria-label", estado === "parado" ? rotulo : tr("Stop"));
    };
    this.amostra = botao;
    desenhar("buscando");

    void speak(this.plugin, fraseDaAmostra(nome, this.idiomaDaAmostra()), {
      voice: voz,
      guardar: true,
      onPlaying: () => desenhar("tocando"),
    }).finally(() => {
      desenhar("parado");
      if (this.amostra === botao) this.amostra = null;
    });
  }

  private pararAmostra(): void {
    if (this.amostra) stopSpeaking();
  }

  private idiomaDaAmostra(): string {
    return idiomaDaAmostra(this.s.voiceLanguage, getLanguage());
  }

  private nomeDaVozAtual(): string {
    const s = this.s;
    if (s.ttsProvider === "eleven") {
      return s.elevenVoices.find((v) => v.id === s.elevenVoice)?.name ?? "ElevenLabs";
    }
    return nomeProprio(s.ttsVoice);
  }

  private async fetchVoices(): Promise<void> {
    if (this.fetchingVoices) return;
    this.fetchingVoices = true;
    this.repaint("elevenFetch");
    try {
      const voices = await elevenVoices(this.s.elevenApiKey);
      this.s.elevenVoices = voices.map((v) => ({
        id: v.id,
        name: v.name,
        category: v.category,
      }));
      if (!this.s.elevenVoice && voices[0]) this.s.elevenVoice = voices[0].id;
      await this.save();
      const minhas = voices.filter(
        (v) => v.category === "cloned" || v.category === "professional"
      ).length;
      new Notice(
        (voices.length === 1 ? tr("1 voice") : tr("{n} voices", { n: voices.length })) +
          (minhas > 0
            ? " · " + (minhas === 1 ? tr("1 yours") : tr("{n} yours", { n: minhas }))
            : "") +
          "."
      );
    } catch (err) {
      new Notice(
        tr("Could not load voices: {error}", {
          error: err instanceof Error ? err.message : String(err),
        })
      );
    } finally {
      this.fetchingVoices = false;
      this.repaint("elevenFetch");
      this.repaint("elevenVoice");
      this.refreshVisibility();
    }
  }

  private paintEmbeddingModel(row: Setting): void {
    const s = this.s;
    const specs = getAllEmbeddingModels();
    this.pickButton(row, {
      items: specs.map((spec) => {

        const gratis = spec.local
          ? tr("local")
          : spec.provider === "gemini"
            ? geminiTemTierGratis(spec.model)
              ? tr("free tier")
              : ""
            : gratisDeVerdade(spec.model, s.freeModels?.[spec.provider], spec.free === true)
              ? tr("free")
              : "";
        const extras = [
          gratis,
          providerConfigured(this.plugin, spec.provider)
            ? ""
            : spec.provider === "ollama"
              ? tr("needs Ollama")
              : tr("needs key"),
        ].filter(Boolean);
        return {
          value: spec.model,
          label: [prettyModelName(spec.model), ...extras].join(" · "),
          icon:
            PROVIDERS.find((p) => p.id === spec.provider)?.icon ?? "box",
        };
      }),
      value: s.ragEmbeddingModel,
      onPick: async (v) => {
        const spec = specs.find((m) => m.model === v);
        s.ragEmbeddingModel = v;
        if (spec) s.ragEmbeddingProvider = spec.provider;
        await this.save();
        this.repaint("embedding");

        this.repaint("index");
      },
    });
  }

  private paintIndex(row: Setting): void {
    const s = this.s;
    const size = this.plugin.vectorIndex?.size ?? 0;

    const pendente = pendenciaDoIndice(this.plugin.vectorIndex ?? null, s);
    const folder = s.ragIndexPath;
    row.setDesc(
      (size === 0
        ? tr("No index yet (folder: {folder}).", { folder })
        : size === 1
          ? tr("Index loaded: 1 chunk (folder: {folder}).", { folder })
          : tr("Index loaded: {n} chunks (folder: {folder}).", { n: size, folder })) +
        (pendente ? ` ${pendente}` : "")
    );
    row
      .addButton((b) =>
        b
          .setButtonText(this.plugin.indexing ? tr("Cancel indexing") : tr("Index vault"))
          .setCta()
          .onClick(() => void this.runIndex())
      )
      .addButton((b) =>

        marcarPerigoso(b.setButtonText(tr("Delete index")))
          .setDisabled(size === 0 && !this.plugin.vectorIndex)
          .onClick(async () => {
            await deleteIndex(this.app.vault.adapter, s.ragIndexPath);
            this.plugin.vectorIndex = null;
            new Notice(tr("Index deleted."));
            this.repaint("index");
          })
      );
  }

  private async runIndex(): Promise<void> {
    const run = this.plugin.runVaultIndex();

    this.repaint("index");
    await run;
    this.repaint("index");
  }
}
