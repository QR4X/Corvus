import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildSettingsTree,
  TABS,
  type RowRender,
  type SettingsUi,
} from "../src/ui/settings/tree";
import { isControlKey } from "../src/ui/settings/values";
import { PROVIDERS } from "../src/core/providersMeta";
import type { CorvusSettings } from "../src/settings";

type Row = {
  name?: unknown;
  desc?: unknown;
  control?: { key: string; type: string };
  render?: RowRender;
  searchable?: boolean;
  visible?: () => boolean;
  aliases?: string[];
};
type Group = { type: string; heading?: string; cls?: string; items: Row[] };

const noop: RowRender = () => {};

function fakeUi(
  over: {
    isMobile?: boolean;
    settings?: Partial<CorvusSettings>;
    creds?: string[];
  } = {}
): SettingsUi {
  const s = {
    voiceEnabled: true,
    ttsEnabled: true,
    ttsProvider: "openai",
    elevenVoices: [],
    elevenApiKey: "",
    openaiDataSharing: false,
    ...over.settings,
  } as CorvusSettings;
  return {
    isMobile: over.isMobile ?? false,
    settings: () => s,
    hasCredential: (id) => (over.creds ?? []).includes(id),
    freeOfferCount: () => 0,
    nav: noop,
    rail: noop,
    credential: () => noop,
    connection: () => noop,
    newChatModel: () => noop,
    fetchModels: () => noop,
    catalog: () => noop,
    freeOffer: noop,
    pick: () => noop,
    effortLevel: () => noop,
    assistantModel: noop,
    ttsProvider: noop,
    elevenKey: noop,
    elevenFetch: noop,
    elevenVoice: noop,
    testVoice: noop,
    embeddingModel: noop,
    index: noop,
    hint: () => noop,
  };
}

function groupsOf(ui: SettingsUi): Group[] {
  return buildSettingsTree(ui).items as unknown as Group[];
}

function rowKey(r: Row, i: number): string {
  if (r.control) return "ctrl:" + r.control.key;
  if (typeof r.name === "string" && r.name) return "name:" + r.name;
  return "item#" + i;
}

const all = (ui = fakeUi()) => groupsOf(ui).flatMap((g) => g.items);
const byName = (name: string, ui = fakeUi()) =>
  all(ui).find((r) => r.name === name);

describe("tree structure rules", () => {
  it("has only groups at the top level, each with a unique key", () => {
    const gs = groupsOf(fakeUi({ isMobile: true }));
    expect(gs.every((g) => g.type === "group")).toBe(true);
    const keys = gs.map((g, i) => (g.heading ? `group:${g.heading}` : `group#${i}`));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every row inside a group a unique key", () => {
    for (const g of groupsOf(fakeUi({ isMobile: true }))) {
      const keys = g.items.map(rowKey);
      expect(new Set(keys).size, g.heading ?? g.cls).toBe(keys.length);
    }
  });

  it("names every row with a string so search does not break", () => {
    for (const r of all(fakeUi({ isMobile: true }))) {
      expect(typeof r.name).toBe("string");
    }
  });

  it("keeps unnamed rows out of search", () => {
    for (const r of all(fakeUi({ isMobile: true }))) {
      if (r.name === "") expect(r.searchable).toBe(false);
    }
  });

  it("uses only writable control keys and never an API key", () => {
    for (const r of all(fakeUi({ isMobile: true }))) {
      if (!r.control) continue;
      expect(isControlKey(r.control.key), r.control.key).toBe(true);
      expect(r.control.key).not.toMatch(/ApiKey$/);
    }
  });
});

describe("search", () => {
  const NAMES = [
    ...PROVIDERS.filter((p) => p.id !== "ollama").map((p) => `${p.name} API key`),
    "Ollama endpoint",
    ...PROVIDERS.map((p) => `${p.name} connection`),
    ...PROVIDERS.map((p) => `${p.name} model for new chats`),
    ...PROVIDERS.map((p) => `${p.name} models`),
    "I share API data with OpenAI",
    "Usage tier",
    "Provider",
    "Mode",
    "Open on startup",
    "Effort",
    "Assistant model",
    "Let it see your note names",
    "Talk instead of typing",
    "Ears",
    "What you speak",
    "Read answers out loud",
    "Who reads",
    "Voice",
    "OpenAI voice quality",
    "ElevenLabs voice quality",
    "Test OpenAI voice",
    "ElevenLabs key",
    "Your voices",
    "ElevenLabs voice",
    "Test ElevenLabs voice",
    "Chats folder",
    "Skills folder",
    "Embedding model",
    "Auto re-index on note changes",
    "Index",
    "Permission level",
    "Show diff before applying edits",
    "Keep screen on while writing",
    "Fullscreen",
    "Haptics",
  ];

  it("finds every setting in the tree", () => {
    const names = new Set(all(fakeUi({ isMobile: true })).map((r) => r.name));
    expect(NAMES.filter((n) => !names.has(n))).toEqual([]);
  });

  it("has no repeated names in search", () => {
    const names = all(fakeUi({ isMobile: true }))
      .filter((r) => r.searchable !== false)
      .map((r) => r.name as string);
    const repeated = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
    expect(repeated).toEqual([]);
  });

  it("shows each voice quality only for its reader", () => {
    for (const [provider, name] of [
      ["openai", "OpenAI voice quality"],
      ["eleven", "ElevenLabs voice quality"],
    ] as const) {
      const ui = fakeUi({ settings: { ttsProvider: provider } });
      const vis = all(ui)
        .filter((r) => /voice quality$/.test(String(r.name)))
        .filter((r) => (r.visible ? r.visible() : true))
        .map((r) => r.name);
      expect(vis, provider).toEqual([name]);
    }
  });

  it('finds the voice toggles for "voice" even when everything is off', () => {
    const ui = fakeUi({ settings: { voiceEnabled: false, ttsEnabled: false } });
    const matches = (r: Row) =>
      [r.name, r.desc, ...(r.aliases ?? [])].some(
        (t) => typeof t === "string" && t.toLowerCase().includes("voice")
      );
    const found = all(ui)
      .filter((r) => r.searchable !== false && (r.visible ? r.visible() : true))
      .filter(matches)
      .map((r) => r.name);
    expect(found).toEqual(
      expect.arrayContaining(["Talk instead of typing", "Read answers out loud"])
    );
  });

  it("keeps other rows when one throws while drawing", () => {
    const ui = { ...fakeUi(), index: (() => { throw new Error("boom"); }) as RowRender };
    const row = all(ui).find((r) => r.name === "Index");
    const descs: string[] = [];
    const fake = { setName() {}, setDesc: (d: string) => descs.push(d) };
    expect(() => row?.render?.(fake as never, {} as never)).not.toThrow();
    expect(descs[0]).toMatch(/failed to draw/);
  });

  it("shows the short name on the row and the long one in search", () => {
    const row = byName("Anthropic API key");
    const names: string[] = [];
    row?.render?.({ setName: (n: string) => names.push(n) } as never, {} as never);
    expect(names).toEqual(["API key"]);
  });
});

describe("tabs", () => {
  it("shows the Mobile tab only on mobile", () => {
    const hasMobile = (ui: SettingsUi) =>
      groupsOf(ui).some((g) => g.cls?.includes("corvus-set-tab-mobile"));
    expect(hasMobile(fakeUi({ isMobile: false }))).toBe(false);
    expect(hasMobile(fakeUi({ isMobile: true }))).toBe(true);
  });

  it("places every group except the tab bar, and every row, in a tab", () => {
    const tree = buildSettingsTree(fakeUi({ isMobile: true }));
    for (const g of tree.items as unknown as Group[]) {
      if (g.cls?.includes("corvus-set-navgroup")) continue;
      const tab = /corvus-set-tab-(\w+)/.exec(g.cls ?? "")?.[1];
      expect(tab, g.heading ?? g.cls).toBeTruthy();
      for (const r of g.items) expect(tree.places.get(r)?.tab).toBe(tab);
    }
  });

  it("places a provider row under its provider so search highlights the right logo", () => {
    const tree = buildSettingsTree(fakeUi());
    const row = (tree.items as unknown as Group[])
      .flatMap((g) => g.items)
      .find((r) => r.name === "Gemini API key");
    expect(row && tree.places.get(row)).toEqual({ tab: "providers", provider: "gemini" });
  });

  it("has CSS hiding every tab and provider the tree uses", () => {
    const css = readFileSync(resolve(__dirname, "../styles/main.css"), "utf8");
    for (const t of TABS) {
      expect(css, t.id).toContain(
        `.corvus-settings-root:not([data-corvus-tab="${t.id}"]) .corvus-set-tab-${t.id}`
      );
    }
    for (const p of PROVIDERS) {
      expect(css, p.id).toContain(
        `.corvus-settings-root:not([data-corvus-prov="${p.id}"]) .corvus-set-prov-${p.id}`
      );
    }
  });
});

describe("choice menus", () => {
  type Picked = { key: string; tab: string; items: { value: string; label: string; icon?: string; glyph?: string }[] };
  const picked: Picked[] = [];
  const ui = { ...fakeUi({ isMobile: true }) } as SettingsUi;
  ui.pick = (key, items, tab) => {
    picked.push({ key, tab, items: items() });
    return noop;
  };
  const tree = buildSettingsTree(ui);

  it("uses no native dropdown in any tab", () => {
    const dropdowns = (tree.items as unknown as Group[])
      .flatMap((g) => g.items)
      .filter((r) => r.control?.type === "dropdown")
      .map((r) => r.name);
    expect(dropdowns).toEqual([]);
  });

  it("puts the OpenAI tier and agent permission level outside the Chat tab", () => {
    expect(picked.filter((p) => p.tab === "providers").map((p) => p.key)).toEqual(["openaiTier"]);
    expect(picked.filter((p) => p.tab === "agent").map((p) => p.key)).toEqual([
      "agentPermissionLevel",
    ]);
    const tier = picked.find((p) => p.key === "openaiTier")!;
    expect(tier.items.map((i) => i.glyph)).toEqual(["1", "2", "3", "4", "5"]);
    const perm = picked.find((p) => p.key === "agentPermissionLevel")!;
    expect(perm.items.map((i) => i.value)).toEqual(["ask", "vault", "yolo"]);
  });

  it("puts the remaining choice menus in the Chat tab", () => {
    expect(picked.filter((p) => p.tab === "rag").map((p) => p.key)).toEqual(["ragQuantProfile"]);
    const chatKeys = picked.filter((p) => p.tab === "chat").map((p) => p.key).sort();
    expect(chatKeys).toEqual(
      [
        "defaultEffort",
        "defaultMode",
        "defaultProvider",
        "elevenModel",
        "startupChatMode",
        "ttsModel",
        "ttsVoice",
        "voiceLanguage",
        "voiceModel",
      ].sort()
    );
    expect(new Set(picked.map((p) => p.tab))).toEqual(new Set(["chat", "rag", "providers", "agent"]));
  });

  it("gives each effort level a row in a Chat tab group", () => {
    const g = (tree.items as unknown as Group[]).find((x) => x.heading === "Effort levels");
    expect(g).toBeTruthy();
    expect(tree.places.get(g as object)?.tab).toBe("chat");
    expect(g!.items.map((r) => r.name)).toEqual([
      "Low effort level",
      "Medium effort level",
      "High effort level",
      "Extra high effort level",
      "Max effort level",
    ]);
  });

  it("shows index precision and sharded search in the Q&A tab", () => {
    const rag = (tree.items as unknown as Group[])
      .filter((x) => tree.places.get(x as object)?.tab === "rag")
      .flatMap((x) => x.items);
    const names = rag.map((r) => r.name);
    expect(names).toContain("Index precision");
    expect(rag.find((r) => r.name === "Search the index in pieces")?.control?.key).toBe("ragStreamShards");
  });

  it("gives every option a label and an icon or glyph", () => {
    for (const p of picked) {
      expect(p.items.length, p.key).toBeGreaterThan(0);
      for (const i of p.items) {
        expect(i.label, `${p.key}:${i.value}`).toBeTruthy();
        expect(!!(i.icon || i.glyph), `${p.key}:${i.value} has no icon`).toBe(true);
      }
    }
  });

  it("shows mode names instead of raw ids", () => {
    const mode = picked.find((p) => p.key === "defaultMode")!;
    expect(mode.items.map((i) => i.label)).toEqual(["Chat", "Vault Q&A", "Agent"]);
  });
});

describe("visibility", () => {
  const vis = (name: string, ui: SettingsUi) => {
    const r = all(ui).find((x) => x.name === name);
    return r?.visible ? r.visible() : true;
  };

  it("shows the usage tier only with data sharing on", () => {
    expect(vis("Usage tier", fakeUi({ settings: { openaiDataSharing: false } }))).toBe(false);
    expect(vis("Usage tier", fakeUi({ settings: { openaiDataSharing: true } }))).toBe(true);
  });

  it('finds the sharing toggle for "tier" even when it is off', () => {
    const ui = fakeUi({ settings: { openaiDataSharing: false } });
    const found = all(ui)
      .filter((r) => r.searchable !== false && (r.visible ? r.visible() : true))
      .filter((r) => [r.name, r.desc, ...(r.aliases ?? [])].some((t) => typeof t === "string" && /tier/i.test(t)))
      .map((r) => r.name);
    expect(found).toContain("I share API data with OpenAI");
  });

  it("hides dictation rows when dictation is off", () => {
    expect(vis("Ears", fakeUi({ settings: { voiceEnabled: false } }))).toBe(false);
    expect(vis("Ears", fakeUi({ settings: { voiceEnabled: true } }))).toBe(true);
  });

  it("shows rows for the selected reader", () => {
    const eleven = fakeUi({ settings: { ttsProvider: "eleven" } });
    expect(vis("ElevenLabs key", eleven)).toBe(true);
    expect(vis("Test OpenAI voice", eleven)).toBe(false);
    const openai = fakeUi({ settings: { ttsProvider: "openai" } });
    expect(vis("ElevenLabs key", openai)).toBe(false);
    expect(vis("Test OpenAI voice", openai)).toBe(true);
    const off = fakeUi({ settings: { ttsEnabled: false } });
    expect(vis("Who reads", off)).toBe(false);
    expect(vis("Test OpenAI voice", off)).toBe(false);
  });

  it("shows the ElevenLabs voice only after fetching voices", () => {
    const without = fakeUi({ settings: { ttsProvider: "eleven", elevenVoices: [] } });
    expect(vis("ElevenLabs voice", without)).toBe(false);
    const withVoices = fakeUi({
      settings: { ttsProvider: "eleven", elevenVoices: [{ id: "v", name: "V" }] },
    });
    expect(vis("ElevenLabs voice", withVoices)).toBe(true);
  });
});
