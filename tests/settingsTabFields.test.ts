import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// A aba de settings é uma subclasse do SettingTab do Obsidian, e o Obsidian
// guarda estado NA INSTÂNCIA: um campo nosso com o mesmo nome sobrescreve o
// dele sem aviso. Aconteceu com `navEl` (o item da barra lateral que o modal
// usa em openTab): o nosso segmented ocupava o lugar, e no 1.13 reabrir as
// settings quebrava. Lista tirada de uma instância real no 1.13.7 (campos do
// construtor + os que o modal põe) e dos métodos do protótipo.
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
    // Guarda contra o regex não achar nada.
    expect(nossos).toEqual(expect.arrayContaining(["tabBarEl", "slots", "renderNav"]));
    expect(nossos.filter((n) => DO_OBSIDIAN.includes(n))).toEqual([]);
  });
});
