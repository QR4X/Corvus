import { describe, it, expect, vi } from "vitest";

const captured = vi.hoisted(() => ({ tab: null as object | null }));

vi.mock("obsidian", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  class PluginSettingTab {
    constructor() {
      captured.tab = this;
    }
  }
  return { ...actual, PluginSettingTab };
});

import { CorvusSettingsTab } from "../src/ui/SettingsTab";

const OBSIDIAN_MEMBERS = [
  "app",
  "setting",
  "navEl",
  "settingItems",
  "renderedItems",
  "containerEl",
  "name",
  "id",
  "update",
  "getControlBinding",
  "refreshDomState",
  "getDefinitionForElement",
  "renderTab",
];

describe("CorvusSettingsTab does not shadow Obsidian SettingTab members", () => {
  it("none of our fields or methods reuses a SettingTab name", () => {
    try {
      new CorvusSettingsTab({} as never, {} as never);
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
    }
    const tab = captured.tab;
    expect(tab).not.toBeNull();
    const ours = [
      ...Object.keys(tab as object),
      ...Object.getOwnPropertyNames(CorvusSettingsTab.prototype),
    ];

    expect(ours).toEqual(expect.arrayContaining(["tabBarEl", "slots", "renderNav"]));
    expect(ours.filter((n) => OBSIDIAN_MEMBERS.includes(n))).toEqual([]);
  });
});
