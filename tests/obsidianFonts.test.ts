import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("obsidian", async () => {
  const stub = await vi.importActual<typeof import("./obsidian-stub")>("./obsidian-stub");
  const button = {
    setButtonText: () => button,
    onClick: () => button,
    setCta: () => button,
  };
  class Setting {
    addButton(cb: (b: typeof button) => void): this {
      cb(button);
      return this;
    }
  }
  return { ...stub, Setting };
});

const { isControlKey } = await import("../src/ui/settings/values");
const { ConfirmModal } = await import("../src/ui/modals");
const { LanguageModal } = await import("../src/editor/inline");

function openConfirmModal(): Set<string> {
  const classes = new Set<string>();
  const modal = new ConfirmModal({} as never, { title: "Delete?" });
  Object.assign(modal, {
    modalEl: { addClass: (c: string) => classes.add(c) },
    titleEl: { setText: () => {} },
    contentEl: { createEl: () => {}, empty: () => {} },
  });
  modal.onOpen();
  return classes;
}

const read = (path: string) =>
  readFileSync(resolve(__dirname, "..", path), "utf8");
const css = read("styles/main.css").replace(/\/\*[\s\S]*?\*\//g, "");
const roots = [
  ".corvus-root",
  ".corvus-settings-root",
  ".corvus-pop-layer",
  ".corvus-modal-container",
  ".corvus-effort-modal",
  ".corvus-native-confirm-modal",
  ".corvus-language-modal",
];

describe("Obsidian Appearance is the only source of plugin typography", () => {
  it("binds every independent UI root to the native font and size", () => {
    const selector = roots.join(",\\s*").replace(/\./g, "\\.");
    const rule = new RegExp(`${selector}\\s*\\{([^}]+)\\}`).exec(css)?.[1];
    expect(rule).toBeDefined();
    expect(rule).toContain("font-family: var(--font-interface)");
    expect(rule).toContain("font-size: var(--font-text-size)");
    expect(rule).toContain("--font-ui-medium: var(--font-text-size)");
    for (const [token, scale] of [
      ["smaller", "0.8"],
      ["small", "0.875"],
      ["large", "1.25"],
    ]) {
      expect(rule).toContain(
        `--font-ui-${token}: calc(var(--font-text-size) * ${scale})`
      );
    }
  });

  it("does not hard-code fonts or text sizes anywhere in the plugin CSS", () => {
    const families = [...css.matchAll(/font-family:\s*([^;]+);/g)];
    expect(families.length).toBeGreaterThan(10);
    for (const [, value] of families) {
      expect(["inherit", "var(--font-interface)"]).toContain(value);
    }
    expect(css).not.toMatch(/font-size:\s*[\d.]+(?:px|rem)\b/);
    expect(css).not.toMatch(/--corvus-(?:read-font|font-family|font-size)/);
    for (const selector of [".corvus-markdown", ".corvus-msg-user"]) {
      const escaped = selector.replace(/\./g, "\\.");
      expect(css).toMatch(
        new RegExp(`${escaped}\\s*\\{[^}]*font-size:\\s*var\\(--font-ui-medium\\)`)
      );
    }
    expect(css).toMatch(
      /\.corvus-input textarea:active\s*\{[^}]*font-size:\s*var\(--font-ui-medium\)/
    );
  });

  it("covers native controls, rendered markdown and modal headings", () => {
    expect(css).toContain(
      ":is(button, input, textarea, select, code, pre, .markdown-rendered,"
    );
    expect(openConfirmModal().has("corvus-native-confirm-modal")).toBe(true);
    expect(
      new LanguageModal({} as never, () => {}).modalEl.hasClass("corvus-language-modal")
    ).toBe(true);
  });

  it("does not accept plugin-specific font settings as controls", () => {
    for (const key of ["uiFontFamily", "uiFontSize"]) {
      expect(isControlKey(key)).toBe(false);
    }
  });
});
