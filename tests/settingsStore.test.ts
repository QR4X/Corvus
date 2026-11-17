import { beforeEach, describe, expect, it, vi } from "vitest";
import { __avisos } from "obsidian";
import { SettingsStore } from "../src/settingsStore";
import { FABRICA_ATE_0923, OLLAMA_LOCAL } from "../src/core/ollamaDefault";
import type { CorvusSettings } from "../src/settings";

function setup(opts: { saved?: unknown; file?: string; secrets?: boolean; failSave?: boolean } = {}) {
  const files = new Map<string, string>();
  if (opts.file !== undefined) files.set("p/data.json", opts.file);
  const secrets = new Map<string, string>();
  const saveData = vi.fn(async (_data: unknown) => {
    if (opts.failSave) throw new Error("disk full");
  });
  const app = {
    vault: {
      adapter: {
        exists: async (p: string) => files.has(p),
        read: async (p: string) => files.get(p) ?? "",
        write: async (p: string, d: string) => void files.set(p, d),
      },
    },
    secretStorage: opts.secrets
      ? { getSecret: (id: string) => secrets.get(id) ?? null, setSecret: (id: string, v: string) => void secrets.set(id, v) }
      : undefined,
  };
  const store = new SettingsStore({
    app: app as never,
    dataFile: (name) => `p/${name}`,
    loadData: async () => opts.saved ?? null,
    saveData,
  });
  return { store, saveData, secrets, files };
}

beforeEach(() => {
  __avisos.length = 0;
});

describe("SettingsStore.load", () => {
  it("a first install loads defaults and can save", async () => {
    const { store, saveData } = setup();
    const s = await store.load();
    expect(s.chatsPath).toBe("corvus/chats");
    await store.save();
    expect(saveData).toHaveBeenCalledTimes(1);
    expect(__avisos).toEqual([]);
  });

  it("an unreadable data.json makes the store read-only so nothing is overwritten", async () => {
    const { store, saveData } = setup({ saved: null, file: '{"openaiTier": 3, broken' });
    await store.load();
    expect(store.isReadOnly).toBe(true);
    expect(__avisos).toHaveLength(1);
    await store.save();
    expect(saveData).not.toHaveBeenCalled();
  });

  it("an empty data.json is not a broken read", async () => {
    const { store } = setup({ saved: null, file: "{}" });
    await store.load();
    expect(store.isReadOnly).toBe(false);
  });

  it("backs up a successfully read file", async () => {
    const { store, files } = setup({ saved: { openaiTier: 3 } });
    await store.load();
    await vi.waitFor(() => expect(files.get("p/data.backup.json")).toContain('"openaiTier": 3'));
  });

  it("reverts the legacy factory Ollama endpoint when it was never used", async () => {
    const { store } = setup({
      saved: { ollamaEndpoint: OLLAMA_LOCAL, ollamaModel: FABRICA_ATE_0923.modelo, activeModels: { ollama: FABRICA_ATE_0923.ativos } },
    });
    const s = await store.load();
    expect(s.ollamaEndpoint).toBe("");
    expect(s.ollamaDefaultReviewed).toBe(true);
  });

  it("drops fields nothing reads anymore", async () => {
    const { store } = setup({ saved: { language: "en-us", uiFontSize: "20" } });
    const s = (await store.load()) as unknown as Record<string, unknown>;
    expect(s).not.toHaveProperty("language");
    expect(s).not.toHaveProperty("uiFontSize");
  });

  it("carries values saved under legacy field names over to the current names", async () => {
    const { store } = setup({
      saved: {
        usoDoDia: { "2024-01-01": {} },
        limiteGastoDiario: 3,
        travarNoLimite: true,
        ollamaVistos: ["llama3"],
      },
    });
    const s = (await store.load()) as unknown as Record<string, unknown>;
    expect(s.dailyUsage).toEqual({ "2024-01-01": {} });
    expect(s.dailySpendLimit).toBe(3);
    expect(s.blockAtLimit).toBe(true);
    expect(s.ollamaSeenModels).toEqual(["llama3"]);
    expect(s).not.toHaveProperty("usoDoDia");
    expect(s).not.toHaveProperty("travarNoLimite");
  });

  it("a value under the current name wins over a legacy one", async () => {
    const { store } = setup({ saved: { limiteGastoDiario: 3, dailySpendLimit: 5 } });
    const s = await store.load();
    expect(s.dailySpendLimit).toBe(5);
  });
});

describe("SettingsStore secrets", () => {
  it("moves a plain-text key from data.json into the keychain", async () => {
    const { store, saveData, secrets } = setup({ secrets: true, saved: { openaiApiKey: "sk-old" } });
    const s = await store.load();
    expect(s.openaiApiKey).toBe("sk-old");
    expect(secrets.get("corvus-openai-key")).toBe("sk-old");
    const persisted = saveData.mock.calls[0][0] as CorvusSettings;
    expect(persisted.openaiApiKey).toBe("");
  });

  it("never writes keys to data.json when a keychain exists", async () => {
    const { store, saveData, secrets } = setup({ secrets: true, saved: { openaiTier: 2 } });
    const s = await store.load();
    s.anthropicApiKey = "sk-ant";
    await store.save();
    expect(secrets.get("corvus-anthropic-key")).toBe("sk-ant");
    expect((saveData.mock.calls.at(-1)![0] as CorvusSettings).anthropicApiKey).toBe("");
  });
});

describe("SettingsStore.save", () => {
  it("a failed save warns once per failure streak and never throws", async () => {
    const { store } = setup({ failSave: true });
    await store.load();
    await expect(store.save()).resolves.toBeUndefined();
    await store.save();
    expect(__avisos.filter((m) => /lost when you reopen/.test(m))).toHaveLength(1);
  });

  it("notifies listeners only after a successful save", async () => {
    const ok = setup();
    await ok.store.load();
    const cb = vi.fn();
    ok.store.onChange(cb);
    await ok.store.save();
    expect(cb).toHaveBeenCalledTimes(1);

    const bad = setup({ failSave: true });
    await bad.store.load();
    const cb2 = vi.fn();
    bad.store.onChange(cb2);
    await bad.store.save();
    expect(cb2).not.toHaveBeenCalled();
  });
});
