import { describe, it, expect } from "vitest";
import {
  applyControl,
  isControlKey,
  readControl,
  writeControl,
} from "../src/ui/settings/values";
import { DEFAULT_SETTINGS, type CorvusSettings } from "../src/settings";

function fakeSettings(over: Partial<CorvusSettings> = {}): CorvusSettings {
  return {
    openaiApiKey: "sk-secret",
    elevenApiKey: "el-secret",
    openaiTier: 1,
    chatsPath: "corvus/chats",
    skillsPath: "corvus-ai/skills",
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
  it("saves through saveSettings, never saveData", async () => {
    const p = fakePlugin();
    expect(await writeControl(p, "voiceEnabled", false)).toBe(true);
    expect(p.settings.voiceEnabled).toBe(false);
    expect(p.calls).toEqual(["saveSettings"]);
  });

  it("rejects API keys and unknown keys without touching anything", async () => {
    for (const key of ["openaiApiKey", "elevenApiKey", "anthropicApiKey", "nothing"]) {
      const p = fakePlugin();
      const before = JSON.stringify(p.settings);
      expect(await writeControl(p, key, "leaked")).toBe(false);
      expect(JSON.stringify(p.settings)).toBe(before);
      expect(p.calls).toEqual([]);
    }
  });

  it("treats no API key as a control", () => {
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

describe("conversions", () => {
  it("turns the tier menu text into a number", () => {
    const s = fakeSettings();
    applyControl(s, "openaiTier", "3");
    expect(s.openaiTier).toBe(3);
    applyControl(s, "openaiTier", "garbage");
    expect(s.openaiTier).toBe(1);
    expect(readControl(fakeSettings({ openaiTier: 4 }), "openaiTier")).toBe("4");
  });

  it("resets an empty folder to the default instead of the vault root", () => {
    const s = fakeSettings();
    applyControl(s, "chatsPath", "   ");
    expect(s.chatsPath).toBe(DEFAULT_SETTINGS.chatsPath);
    applyControl(s, "skillsPath", "");
    expect(s.skillsPath).toBe(DEFAULT_SETTINGS.skillsPath);
    applyControl(s, "chatsPath", "  My/chats ");
    expect(s.chatsPath).toBe("My/chats");
  });

  it("turns a toggle on only for a real true", () => {
    const s = fakeSettings();
    applyControl(s, "ttsEnabled", "true");
    expect(s.ttsEnabled).toBe(false);
    applyControl(s, "ttsEnabled", true);
    expect(s.ttsEnabled).toBe(true);
  });

  it("reads fields missing from an old data.json as the default", () => {
    const s = fakeSettings();
    delete (s as Partial<CorvusSettings>).language;
    delete (s as Partial<CorvusSettings>).hapticsEnabled;
    delete (s as Partial<CorvusSettings>).mobileFullscreen;
    delete (s as Partial<CorvusSettings>).keepAwakeWhileWriting;
    delete (s as Partial<CorvusSettings>).openaiDataSharing;
    expect(readControl(s, "hapticsEnabled")).toBe(true);
    expect(readControl(s, "mobileFullscreen")).toBe(false);
    expect(readControl(s, "keepAwakeWhileWriting")).toBe(true);
    expect(readControl(s, "openaiDataSharing")).toBe(false);
    expect(readControl(s, "language")).toBe(DEFAULT_SETTINGS.language);
  });
});
