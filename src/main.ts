import { Plugin, WorkspaceLeaf, Platform, Notice, type TAbstractFile } from "obsidian";
import { CorvusView, VIEW_TYPE_CORVUS } from "./ui/CorvusView";
import { FONTE_DO_HOVER } from "./ui/responseLinks";
import { registerBrandLogos } from "./ui/brandLogos";
import { CorvusSettingsTab } from "./ui/SettingsTab";
import { startupOpensPanel } from "./ui/modules";
import { registerLocalUsage } from "./providers/dataCollect";
import { loadSkills, seedExampleSkills, isSkillFilePath, type Skill } from "./skills/skills";
import { esquecerDesfazeres } from "./agent/undo";
import { registrarComandosDoEditor } from "./editor/commands";
import { esquecerPedidos } from "./editor/bridge";
import { tr } from "./i18n/tr";
import { openOrCreateAgentMd } from "./core/agentMd";
import { acompanharEscrita } from "./core/wakeLock";
import { pluginFile } from "./core/pluginFiles";
import { ChatLibrary } from "./core/chatLibrary";
import { ModelScanner } from "./core/modelScanner";
import { RagIndex } from "./core/ragIndex";
import { migrateLegacyFolders } from "./core/vaultMigration";
import { UsageMeter } from "./usage/meter";
import { SettingsStore } from "./settingsStore";
import type { CorvusSettings } from "./settings";

const SKILLS_RELOAD_DELAY_MS = 600;

export default class CorvusPlugin extends Plugin {
  settings!: CorvusSettings;
  store!: SettingsStore;
  chats!: ChatLibrary;
  models!: ModelScanner;
  rag!: RagIndex;
  skills: Skill[] = [];
  private skillsReloadTimer: number | null = null;

  saveSettings(): Promise<void> {
    return this.store.save();
  }

  onSettingsChange(cb: () => void): () => void {
    return this.store.onChange(cb);
  }

  async onload() {
    const file = (name: string) => pluginFile(this.app, this.manifest, name);
    const settings = () => this.settings;
    const save = () => this.saveSettings();

    this.store = new SettingsStore({
      app: this.app,
      dataFile: file,
      loadData: () => this.loadData(),
      saveData: (data) => this.saveData(data),
    });
    this.settings = await this.store.load();

    this.chats = new ChatLibrary(this.app, settings, save, file("chatIndex.json"));
    this.rag = new RagIndex({ app: this.app, settings, save, notify: () => this.store.notify() });
    this.models = new ModelScanner({
      adapter: this.app.vault.adapter,
      cacheFile: file("modelInfoCache.json"),
      settings,
      save,
      vectorIndex: () => this.rag.index,
    });

    if (!this.store.isReadOnly) await migrateLegacyFolders(this.app.vault.adapter, this.settings, save);

    this.registerView(VIEW_TYPE_CORVUS, (leaf) => new CorvusView(leaf, this));
    this.registerHoverLinkSource(FONTE_DO_HOVER, { display: "Corvus", defaultMod: true });
    this.addRibbonIcon("bot", "Corvus", () => void this.activateView());
    registerBrandLogos();

    this.addCommand({
      id: "open-panel",
      name: tr("Open panel"),
      callback: () => this.activateView(),
    });
    this.addCommand({
      id: "open-agent-instructions",
      name: tr("Open agent instructions (AGENT.md)"),
      callback: () => void openOrCreateAgentMd(this.app, this.settings.agentInstructionsPath),
    });
    registrarComandosDoEditor(this);
    this.addSettingTab(new CorvusSettingsTab(this.app, this));

    this.watchVault();
    this.watchMobileNavbar();

    const wakeLock = acompanharEscrita(() => this.settings.keepAwakeWhileWriting);
    this.register(() => wakeLock.dispose());
    this.register(this.onSettingsChange(() => wakeLock.recheck()));

    this.register(new UsageMeter(settings, save).install());
    this.register(() => this.chats.dispose());
    this.register(() => this.rag.dispose());

    this.app.workspace.onLayoutReady(() => void this.loadInBackground());

    if (startupOpensPanel(this.settings.startupChatMode)) {
      window.setTimeout(() => void this.activateView(), 250);
    }
  }

  onunload() {
    esquecerDesfazeres();
    esquecerPedidos();
    if (this.skillsReloadTimer !== null) window.clearTimeout(this.skillsReloadTimer);
    this.skillsReloadTimer = null;
  }

  async reloadSkills(): Promise<void> {
    try {
      this.skills = await loadSkills(this.app, this.settings.skillsPath);
    } catch (err) {
      console.error("[corvus] reloadSkills failed:", err);
      this.skills = [];
    }
    this.store.notify();
  }

  async seedExampleSkills(): Promise<number> {
    const n = await seedExampleSkills(this.app, this.settings.skillsPath);
    await this.reloadSkills();
    return n;
  }

  async activateView() {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_CORVUS)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false) ?? workspace.getRightLeaf(true);
      await leaf?.setViewState({ type: VIEW_TYPE_CORVUS, active: true });
    }
    if (!leaf) {
      new Notice(tr("Couldn't open the Corvus panel — try toggling the right sidebar."));
      return;
    }
    void workspace.revealLeaf(leaf);
    if (Platform.isMobile) workspace.rightSplit?.expand();
  }

  private async loadInBackground(): Promise<void> {
    await this.models.start();
    void this.registerLocalModelUsage();
    await this.reloadSkills();
    await this.rag.load();
  }

  private async registerLocalModelUsage(): Promise<void> {
    const byModel: Record<string, number> = {};
    for (const c of await this.chats.load()) {
      if (c.model) byModel[c.model] = (byModel[c.model] ?? 0) + 1;
    }
    registerLocalUsage(byModel);
  }

  private watchVault(): void {
    const onChange = (file: TAbstractFile, oldPath?: string) => {
      this.rag.scheduleAutoReindex(file);
      const path = this.settings.skillsPath;
      if (!isSkillFilePath(file?.path ?? "", path) && !(oldPath && isSkillFilePath(oldPath, path))) return;
      if (this.skillsReloadTimer !== null) window.clearTimeout(this.skillsReloadTimer);
      this.skillsReloadTimer = window.setTimeout(() => {
        this.skillsReloadTimer = null;
        void this.reloadSkills();
      }, SKILLS_RELOAD_DELAY_MS);
    };
    this.registerEvent(this.app.vault.on("modify", (f) => onChange(f)));
    this.registerEvent(this.app.vault.on("create", (f) => onChange(f)));
    this.registerEvent(this.app.vault.on("delete", (f) => onChange(f)));
    this.registerEvent(this.app.vault.on("rename", (f, oldPath) => onChange(f, oldPath)));
  }

  private watchMobileNavbar(): void {
    if (!Platform.isMobile) return;
    const doc = activeDocument;
    const sync = () =>
      doc.body.toggleClass("corvus-has-navbar", doc.body.querySelector(".mobile-navbar") !== null);
    const obs = new MutationObserver(sync);
    const host = doc.body.querySelector(".app-container");
    if (host) obs.observe(host, { childList: true });
    sync();
    this.register(() => {
      obs.disconnect();
      doc.body.removeClass("corvus-has-navbar");
    });
  }
}
