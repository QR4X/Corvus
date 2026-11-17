import { describe, it, expect } from "vitest";
import { QUANT_ITEMS, pendingIndexUpdate } from "../src/ui/settings/searchIndex";
import { QUANT_PROFILES } from "../src/rag/quant";
import { applyControl, isControlKey } from "../src/ui/settings/values";
import { buildSettingsTree, type RowRender, type SettingsUi } from "../src/ui/settings/tree";
import { DEFAULT_SETTINGS, type CorvusSettings } from "../src/settings";

describe("the Q&A index: precision and pieces", () => {
  it("offers the engine's four profiles and no more", () => {
    expect(QUANT_ITEMS.map((i) => i.value).sort()).toEqual(Object.keys(QUANT_PROFILES).sort());
    for (const i of QUANT_ITEMS) expect(i.icon, i.value).toBeTruthy();
  });

  it("both are controls that values.ts knows how to save", () => {
    expect(isControlKey("ragQuantProfile")).toBe(true);
    expect(isControlKey("ragStreamShards")).toBe(true);
  });

  it("the index row warns about what only applies on the next update", () => {
    const idx = { profile: "balanced", streamed: false };
    expect(pendingIndexUpdate(idx, { ragQuantProfile: "balanced", ragStreamShards: false })).toBeNull();
    expect(pendingIndexUpdate(idx, { ragQuantProfile: "light" })).toBe(
      "Update the index to apply the new precision."
    );
    expect(pendingIndexUpdate(idx, { ragStreamShards: true })).toBe(
      "Update the index to apply search in pieces."
    );
    expect(
      pendingIndexUpdate({ profile: "light", streamed: true }, { ragQuantProfile: "balanced" })
    ).toBe("Update the index to apply the new precision and a single index file.");

    expect(pendingIndexUpdate(null, { ragQuantProfile: "light" })).toBeNull();
  });

  it("changing the embedding model also only applies after a rebuild", () => {
    const idx = { profile: "balanced", streamed: false, model: "text-embedding-3-small" };
    expect(pendingIndexUpdate(idx, { ragEmbeddingModel: "text-embedding-3-small" })).toBeNull();
    expect(pendingIndexUpdate(idx, { ragEmbeddingModel: "gemini-embedding-001" })).toBe(
      "Update the index to apply the new embedding model."
    );
  });
});

describe("the index folder", () => {
  const s = () => ({ ragIndexPath: "x" }) as unknown as CorvusSettings;

  it("is a text field on the Vault tab", () => {
    expect(isControlKey("ragIndexPath")).toBe(true);
    const noop: RowRender = () => {};
    const ui = new Proxy(
      { isMobile: false, settings: () => DEFAULT_SETTINGS, hasCredential: () => false, freeOfferCount: () => 0 },
      {
        get: (target, key) =>
          key in target ? target[key as keyof typeof target] : () => noop,
      }
    ) as unknown as SettingsUi;
    const tree = buildSettingsTree(ui);
    type Row = { name?: unknown; control?: { type: string; key: string } };
    const rows = (tree.items as unknown as { items: Row[] }[]).flatMap((g) => g.items);
    const row = rows.find((r) => r.control?.key === "ragIndexPath");
    expect(row?.name).toBe("Index folder");
    expect(row?.control?.type).toBe("text");
    expect(row && tree.places.get(row)?.tab).toBe("vault");
  });

  it("trims edge slashes; empty falls back to the default", () => {
    const a = s();
    applyControl(a, "ragIndexPath", " /my/index/ ");
    expect(a.ragIndexPath).toBe("my/index");
    applyControl(a, "ragIndexPath", "   ");
    expect(a.ragIndexPath).toBe(DEFAULT_SETTINGS.ragIndexPath);
    expect(DEFAULT_SETTINGS.ragIndexPath).toBe(".corvus/index");
  });
});
