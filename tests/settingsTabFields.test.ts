import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DO_OBSIDIAN = [
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

const SRC = readFileSync(resolve(__dirname, "../src/ui/SettingsTab.ts"), "utf8");

describe("CorvusSettingsTab não pisa em campo do Obsidian", () => {
  it("nenhum campo/método nosso reusa um nome do SettingTab", () => {
    const nossos = [
      ...SRC.matchAll(/^\s{2}(?:private |protected |public )?(?:readonly )?(?:async )?(\w+)\s*[(:=<]/gm),
    ].map((m) => m[1]);

    expect(nossos).toEqual(expect.arrayContaining(["tabBarEl", "slots", "renderNav"]));
    expect(nossos.filter((n) => DO_OBSIDIAN.includes(n))).toEqual([]);
  });
});
