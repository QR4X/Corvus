// src/ui/settings/legacy.ts
// Desenha a árvore das settings no Obsidian ANTES do 1.13 (1.11.4–1.12.x),
// onde `getSettingDefinitions()` não existe e quem desenha é o `display()`.
//
// É o desenhista do 1.13 em miniatura, só com o que a nossa árvore usa: grupo
// (título + classes), linhas `control` (toggle, dropdown, text), linhas
// `render` e `visible`. O `SettingGroup` existe desde o 1.11.0 — então aqui as
// linhas também ficam em cartões, e o CSS é o mesmo dos dois caminhos.
//
// Duas regras copiadas do 1.13, pra os dois caminhos se comportarem igual:
//   • depois de um `control` mudar, reavalia os `visible` (lá é o
//     `refreshDomState()` que o próprio Obsidian chama);
//   • um grupo com TODAS as linhas escondidas some junto (título incluído).

import { SettingGroup } from "obsidian";
import type {
  Setting,
  SettingDefinition,
  SettingDefinitionItem,
} from "obsidian";

/** Como o desenho lê e grava um `control` — o mesmo caminho do 1.13. */
export interface LegacyIo {
  get(key: string): unknown;
  set(key: string, value: unknown): Promise<void>;
}

export interface LegacyTree {
  /** Reavalia os `visible` (o `refreshDomState()` deste caminho). */
  refresh(): void;
  /** Roda as limpezas que as linhas `render` devolveram. */
  dispose(): void;
}

interface DrawnRow {
  def: SettingDefinition;
  setting: Setting;
}

interface DrawnGroup {
  el: HTMLElement;
  rows: DrawnRow[];
}

/** `visible` pode ser booleano ou função; função que explode conta como à vista
 *  (o 1.13 faz o mesmo: loga e usa o padrão). */
function isVisible(def: SettingDefinition): boolean {
  const v = def.visible;
  if (typeof v !== "function") return v !== false;
  try {
    return v();
  } catch (err) {
    console.error("[corvus] settings: visible falhou", err);
    return true;
  }
}

export function drawLegacyTree(
  containerEl: HTMLElement,
  items: SettingDefinitionItem[],
  io: LegacyIo
): LegacyTree {
  const groups: DrawnGroup[] = [];
  const cleanups: (() => void)[] = [];

  const refresh = () => {
    for (const g of groups) {
      let any = false;
      for (const r of g.rows) {
        const on = isVisible(r.def);
        r.setting.settingEl.toggle(on);
        if (on) any = true;
      }
      g.el.toggle(any || g.rows.length === 0);
    }
  };

  const drawRow = (setting: Setting, def: SettingDefinition, group: SettingGroup) => {
    setting.setName(def.name ?? "");
    if (typeof def.desc === "string") setting.setDesc(def.desc);
    else if (def.desc) setting.setDesc(def.desc.cloneNode(true) as DocumentFragment);

    if (def.render) {
      const cleanup = def.render(setting, group);
      if (cleanup) cleanups.push(cleanup);
      return;
    }
    const c = def.control;
    if (!c) return;
    const commit = async (value: unknown) => {
      await io.set(c.key, value);
      refresh();
    };
    const value = io.get(c.key) ?? c.defaultValue;
    switch (c.type) {
      case "toggle":
        setting.addToggle((t) =>
          t.setValue(value === true).onChange((v) => void commit(v))
        );
        break;
      case "dropdown":
        setting.addDropdown((d) => {
          for (const [v, label] of Object.entries(c.options)) d.addOption(v, label);
          d.setValue(typeof value === "string" ? value : "").onChange(
            (v) => void commit(v)
          );
        });
        break;
      case "text":
        setting.addText((t) => {
          if (c.placeholder) t.setPlaceholder(c.placeholder);
          t.setValue(typeof value === "string" ? value : "").onChange(
            (v) => void commit(v)
          );
        });
        break;
      default:
        console.warn(`[corvus] settings: control "${c.type}" sem desenho antes do 1.13.`);
    }
  };

  for (const item of items) {
    // A nossa árvore só tem grupos; página e lista não têm desenho aqui.
    if (!("type" in item) || item.type !== "group") continue;
    const g = new SettingGroup(containerEl);
    if (item.heading) g.setHeading(item.heading);
    // No 1.12 o addClass do grupo leva UMA classe (no 1.13 leva várias).
    for (const cls of (item.cls ?? "").split(" ").filter(Boolean)) g.addClass(cls);
    const drawn: DrawnGroup = { el: g.listEl.parentElement ?? g.listEl, rows: [] };
    for (const row of item.items ?? []) {
      if ("type" in row) continue;
      g.addSetting((setting) => {
        drawRow(setting, row, g);
        drawn.rows.push({ def: row, setting });
      });
    }
    groups.push(drawn);
  }
  refresh();

  return {
    refresh,
    dispose() {
      for (const c of cleanups.splice(0)) {
        try {
          c();
        } catch (err) {
          console.error("[corvus] settings: limpeza falhou", err);
        }
      }
    },
  };
}
