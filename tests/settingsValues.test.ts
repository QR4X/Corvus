import { describe, it, expect } from "vitest";
import {
  applyControl,
  DEFAULT_CHATS_PATH,
  DEFAULT_SKILLS_PATH,
  isControlKey,
  readControl,
  writeControl,
} from "../src/ui/settings/values";
import type { CorvusSettings } from "../src/main";

function fakeSettings(over: Partial<CorvusSettings> = {}): CorvusSettings {
  return {
    openaiApiKey: "sk-segredo",
    elevenApiKey: "el-segredo",
    openaiTier: 1,
    chatsPath: "corvus/chats",
    skillsPath: "corvus-ai/skills",
    language: "en-us",
    voiceEnabled: true,
    ...over,
  } as CorvusSettings;
}

function fakePlugin(over: Partial<CorvusSettings> = {}) {
  const calls: string[] = [];
  return {
    calls,
    settings: fakeSettings(over),
    saveSettings: async () => {
      calls.push("saveSettings");
    },
    saveData: async () => {
      calls.push("saveData");
    },
  };
}

describe("writeControl", () => {
  it("grava pelo saveSettings, nunca pelo saveData", async () => {
    const p = fakePlugin();
    expect(await writeControl(p, "voiceEnabled", false)).toBe(true);
    expect(p.settings.voiceEnabled).toBe(false);
    expect(p.calls).toEqual(["saveSettings"]);
  });

  it("recusa chave de API (e qualquer chave fora da lista) sem tocar em nada", async () => {
    for (const key of ["openaiApiKey", "elevenApiKey", "anthropicApiKey", "nada"]) {
      const p = fakePlugin();
      const antes = JSON.stringify(p.settings);
      expect(await writeControl(p, key, "vazou")).toBe(false);
      expect(JSON.stringify(p.settings)).toBe(antes);
      expect(p.calls).toEqual([]);
    }
  });

  it("nenhuma chave de API é control", () => {
    for (const key of [
      "openaiApiKey",
      "anthropicApiKey",
      "geminiApiKey",
      "openrouterApiKey",
      "nimApiKey",
      "elevenApiKey",
    ]) {
      expect(isControlKey(key), key).toBe(false);
    }
  });
});

describe("conversões", () => {
  it("o tier chega como texto do menu e vira número", () => {
    const s = fakeSettings();
    applyControl(s, "openaiTier", "3");
    expect(s.openaiTier).toBe(3);
    applyControl(s, "openaiTier", "lixo");
    expect(s.openaiTier).toBe(1);
    expect(readControl(fakeSettings({ openaiTier: 4 }), "openaiTier")).toBe("4");
  });

  it("pasta vazia volta pro padrão em vez de gravar na raiz", () => {
    const s = fakeSettings();
    applyControl(s, "chatsPath", "   ");
    expect(s.chatsPath).toBe(DEFAULT_CHATS_PATH);
    applyControl(s, "skillsPath", "");
    expect(s.skillsPath).toBe(DEFAULT_SKILLS_PATH);
    applyControl(s, "chatsPath", "  Minhas/conversas ");
    expect(s.chatsPath).toBe("Minhas/conversas");
  });

  it("interruptor só liga com true de verdade", () => {
    const s = fakeSettings();
    applyControl(s, "ttsEnabled", "true");
    expect(s.ttsEnabled).toBe(false);
    applyControl(s, "ttsEnabled", true);
    expect(s.ttsEnabled).toBe(true);
  });

  it("campos ausentes num data.json antigo leem como o padrão", () => {
    const s = fakeSettings({ language: "" });
    delete (s as Partial<CorvusSettings>).hapticsEnabled;
    delete (s as Partial<CorvusSettings>).mobileFullscreen;
    delete (s as Partial<CorvusSettings>).keepAwakeWhileWriting;
    delete (s as Partial<CorvusSettings>).openaiDataSharing;
    expect(readControl(s, "hapticsEnabled")).toBe(true);
    expect(readControl(s, "mobileFullscreen")).toBe(false);
    expect(readControl(s, "keepAwakeWhileWriting")).toBe(true);
    expect(readControl(s, "openaiDataSharing")).toBe(false);
    expect(readControl(s, "language")).toBe("en-us");
  });
});
