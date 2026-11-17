import { Notice, type App } from "obsidian";
import { migrateLegacyFields } from "./core/legacySettings";
import { FABRICA_ATE_0923, revisarOllamaPadrao } from "./core/ollamaDefault";
import { tr } from "./i18n/tr";
import { DEFAULT_SETTINGS, SECRET_FIELDS, type CorvusSettings } from "./settings";

interface SettingsHost {
  app: App;
  dataFile(name: string): string;
  loadData(): Promise<unknown>;
  saveData(data: unknown): Promise<void>;
}

function secretId(field: string): string {
  return `corvus-${field.replace(/ApiKey$/, "")}-key`;
}

export class SettingsStore {
  settings: CorvusSettings = { ...DEFAULT_SETTINGS };
  private readOnly = false;
  private saveFailureShown = false;
  private listeners = new Set<() => void>();

  constructor(private readonly host: SettingsHost) {}

  get isReadOnly(): boolean {
    return this.readOnly;
  }

  async load(): Promise<CorvusSettings> {
    const saved = ((await this.host.loadData()) ?? {}) as Partial<CorvusSettings>;

    if (Object.keys(saved).length === 0) {
      await this.guardUnreadableFile();
    } else {
      void this.backup(JSON.stringify(saved, null, 2));
    }

    migrateLegacyFields(saved);
    const s: CorvusSettings = Object.assign({}, DEFAULT_SETTINGS, saved);

    const ollama = revisarOllamaPadrao(saved, FABRICA_ATE_0923);
    if (ollama !== null) s.ollamaEndpoint = ollama;
    s.ollamaDefaultReviewed = true;

    s.activeModels = { ...DEFAULT_SETTINGS.activeModels, ...(saved.activeModels ?? {}) };
    s.discoveredEmbeddings = saved.discoveredEmbeddings ?? {};
    s.discoveredModels = saved.discoveredModels ?? {};
    s.effortConfigs = saved.effortConfigs ?? {};

    this.settings = s;
    this.loadSecrets(saved);
    return s;
  }

  async save(): Promise<void> {
    if (this.readOnly) {
      console.error("[corvus] saveSettings blocked: settings were not read.");
      return;
    }
    try {
      const ss = this.host.app.secretStorage;
      if (ss) {
        for (const f of SECRET_FIELDS) ss.setSecret(secretId(f), this.settings[f] ?? "");
        await this.host.saveData(this.persistable());
      } else {
        await this.host.saveData(this.settings);
      }
      this.saveFailureShown = false;
    } catch (err) {
      console.error("[corvus] failed to save settings:", err);
      if (!this.saveFailureShown) {
        this.saveFailureShown = true;
        new Notice(
          tr(
            "Corvus could not save your settings — the change is active now but will be lost when you reopen Obsidian. Check the vault's disk space and permissions."
          ),
          12000
        );
      }
      return;
    }
    this.notify();
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  notify(): void {
    this.listeners.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        console.error("[corvus] settings listener failed:", err);
      }
    });
  }

  private async guardUnreadableFile(): Promise<void> {
    try {
      const adapter = this.host.app.vault.adapter;
      const path = this.host.dataFile("data.json");
      if (!(await adapter.exists(path))) return;
      if ((await adapter.read(path)).trim().length <= 2) return;
      this.readOnly = true;
      console.error(
        "[corvus] data.json exists but could not be read — settings will NOT be saved until restart."
      );
      new Notice(
        tr(
          "Corvus: couldn't read your settings file. Nothing will be overwritten — restart Obsidian, and check data.backup.json next to it if needed."
        ),
        15000
      );
    } catch (err) {
      console.error("[corvus] data.json check failed:", err);
    }
  }

  private async backup(raw: string): Promise<void> {
    try {
      if (raw.trim().length > 2) {
        await this.host.app.vault.adapter.write(this.host.dataFile("data.backup.json"), raw);
      }
    } catch (err) {
      console.error("[corvus] settings backup failed:", err);
    }
  }

  private loadSecrets(saved: Record<string, unknown>): void {
    const ss = this.host.app.secretStorage;
    if (!ss) return;
    let migrated = false;
    for (const f of SECRET_FIELDS) {
      const id = secretId(f);
      const stored = ss.getSecret(id);
      const legacy = saved[f];
      if (stored) {
        this.settings[f] = stored;
      } else if (typeof legacy === "string" && legacy) {
        ss.setSecret(id, legacy);
        this.settings[f] = legacy;
        migrated = true;
      }
    }
    if (migrated && !this.readOnly) {
      void this.host.saveData(this.persistable()).catch((err) =>
        console.error("[corvus] secrets migration (saveData) failed:", err)
      );
    }
  }

  private persistable(): CorvusSettings {
    const copy = { ...this.settings };
    for (const f of SECRET_FIELDS) copy[f] = "";
    return copy;
  }
}
