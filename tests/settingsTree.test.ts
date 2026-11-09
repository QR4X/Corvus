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
import type { CorvusSettings } from "../src/main";

// A árvore é o que o Obsidian 1.13 desenha e indexa na busca, e o que o
// display() desenha antes do 1.13. Estes testes cobram as regras que o
// desenhista do 1.13 impõe (app.js 1.13.7) — quebrar uma delas não dá erro
// na hora: dá "duplicate setting key" no console e linha reaproveitada errada.

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

/** A chave que o 1.13 dá a uma linha (Q2 no app.js 1.13.7). */
function rowKey(r: Row, i: number): string {
  if (r.control) return "ctrl:" + r.control.key;
  if (typeof r.name === "string" && r.name) return "name:" + r.name;
  return "item#" + i;
}

const all = (ui = fakeUi()) => groupsOf(ui).flatMap((g) => g.items);
const byName = (name: string, ui = fakeUi()) =>
  all(ui).find((r) => r.name === name);

describe("regras do desenhista do 1.13", () => {
  it("só grupos no topo, com chave única", () => {
    const gs = groupsOf(fakeUi({ isMobile: true }));
    expect(gs.every((g) => g.type === "group")).toBe(true);
    const keys = gs.map((g, i) => (g.heading ? `group:${g.heading}` : `group#${i}`));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("dentro de cada grupo, linhas com chave única", () => {
    for (const g of groupsOf(fakeUi({ isMobile: true }))) {
      const keys = g.items.map(rowKey);
      expect(new Set(keys).size, g.heading ?? g.cls).toBe(keys.length);
    }
  });

  it("todo nome é string (um que não é quebra a busca inteira)", () => {
    for (const r of all(fakeUi({ isMobile: true }))) {
      expect(typeof r.name).toBe("string");
    }
  });

  it("toda linha sem nome fica fora da busca", () => {
    for (const r of all(fakeUi({ isMobile: true }))) {
      if (r.name === "") expect(r.searchable).toBe(false);
    }
  });

  it("todo control é uma chave que values.ts sabe gravar — nenhuma chave de API", () => {
    for (const r of all(fakeUi({ isMobile: true }))) {
      if (!r.control) continue;
      expect(isControlKey(r.control.key), r.control.key).toBe(true);
      expect(r.control.key).not.toMatch(/ApiKey$/);
    }
  });
});

describe("o que a busca acha", () => {
  // Os nomes que a pessoa procura. Sumir um daqui é sumir uma setting.
  const NOMES = [
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
    "Language",
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
    "Instagram Reels transcription",
    "Keep screen on while writing",
    "Fullscreen",
    "Haptics",
  ];

  it("toda setting está na árvore", () => {
    const nomes = new Set(all(fakeUi({ isMobile: true })).map((r) => r.name));
    expect(NOMES.filter((n) => !nomes.has(n))).toEqual([]);
  });

  it("nenhum nome repetido na busca", () => {
    // A busca mostra só o nome. Os dois "Quality" (OpenAI e ElevenLabs) viraram
    // linhas `render` — chaveadas pelo nome —, então ganharam nome longo na
    // busca e o curto na tela; a busca não acha mais duas linhas iguais.
    const nomes = all(fakeUi({ isMobile: true }))
      .filter((r) => r.searchable !== false)
      .map((r) => r.name as string);
    const repetidos = [...new Set(nomes.filter((n, i) => nomes.indexOf(n) !== i))];
    expect(repetidos).toEqual([]);
  });

  it("cada qualidade de voz aparece só com quem lê", () => {
    for (const [provider, nome] of [
      ["openai", "OpenAI voice quality"],
      ["eleven", "ElevenLabs voice quality"],
    ] as const) {
      const ui = fakeUi({ settings: { ttsProvider: provider } });
      const vis = all(ui)
        .filter((r) => /voice quality$/.test(String(r.name)))
        .filter((r) => (r.visible ? r.visible() : true))
        .map((r) => r.name);
      expect(vis, provider).toEqual([nome]);
    }
  });

  it('"voice" acha os interruptores de voz mesmo com tudo desligado', () => {
    // A busca do 1.13 casa cada palavra no nome, na descrição ou num alias, e
    // pula linha com `visible` falso. Com ditado e leitura desligados, só os
    // dois interruptores estão à vista — e nenhum tem "voice" no nome.
    const ui = fakeUi({ settings: { voiceEnabled: false, ttsEnabled: false } });
    const casa = (r: Row) =>
      [r.name, r.desc, ...(r.aliases ?? [])].some(
        (t) => typeof t === "string" && t.toLowerCase().includes("voice")
      );
    const achados = all(ui)
      .filter((r) => r.searchable !== false && (r.visible ? r.visible() : true))
      .filter(casa)
      .map((r) => r.name);
    expect(achados).toEqual(
      expect.arrayContaining(["Talk instead of typing", "Read answers out loud"])
    );
  });

  it("uma linha que explode ao desenhar não derruba as outras", () => {
    const ui = { ...fakeUi(), index: (() => { throw new Error("boom"); }) as RowRender };
    const row = all(ui).find((r) => r.name === "Index");
    const descs: string[] = [];
    const fake = { setName() {}, setDesc: (d: string) => descs.push(d) };
    expect(() => row?.render?.(fake as never, {} as never)).not.toThrow();
    expect(descs[0]).toMatch(/failed to draw/);
  });

  it("a linha mostra o nome curto e a busca o longo", () => {
    const row = byName("Anthropic API key");
    const nomes: string[] = [];
    row?.render?.({ setName: (n: string) => nomes.push(n) } as never, {} as never);
    expect(nomes).toEqual(["API key"]);
  });
});

describe("abas", () => {
  it("Mobile só existe no celular", () => {
    const tem = (ui: SettingsUi) =>
      groupsOf(ui).some((g) => g.cls?.includes("corvus-set-tab-mobile"));
    expect(tem(fakeUi({ isMobile: false }))).toBe(false);
    expect(tem(fakeUi({ isMobile: true }))).toBe(true);
  });

  it("todo grupo (menos a barra de abas) sabe a sua aba, e toda linha também", () => {
    const tree = buildSettingsTree(fakeUi({ isMobile: true }));
    for (const g of tree.items as unknown as Group[]) {
      if (g.cls?.includes("corvus-set-navgroup")) continue;
      const tab = /corvus-set-tab-(\w+)/.exec(g.cls ?? "")?.[1];
      expect(tab, g.heading ?? g.cls).toBeTruthy();
      for (const r of g.items) expect(tree.places.get(r)?.tab).toBe(tab);
    }
  });

  it("a linha de um provider leva o provider (a busca acende o logo certo)", () => {
    const tree = buildSettingsTree(fakeUi());
    const row = (tree.items as unknown as Group[])
      .flatMap((g) => g.items)
      .find((r) => r.name === "Gemini API key");
    expect(row && tree.places.get(row)).toEqual({ tab: "providers", provider: "gemini" });
  });

  it("o CSS esconde cada aba e cada provider que a árvore usa", () => {
    // Uma aba ou provider novo sem a regra apareceria EMPILHADO com os outros.
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

describe("a aba Chat só tem menus de escolha com ícone", () => {
  // No Android, o <select> abre a caixa do sistema: rádio, letra enorme,
  // nenhum ícone. A aba Chat troca todos pelo balão do ⋯ das conversas.
  type Pego = { key: string; tab: string; itens: { value: string; label: string; icon?: string; glyph?: string }[] };
  const pegos: Pego[] = [];
  const ui = { ...fakeUi({ isMobile: true }) } as SettingsUi;
  ui.pick = (key, items, tab) => {
    pegos.push({ key, tab, itens: items() });
    return noop;
  };
  const tree = buildSettingsTree(ui);

  it("nenhum dropdown nativo em aba nenhuma", () => {
    const nativos = (tree.items as unknown as Group[])
      .flatMap((g) => g.items)
      .filter((r) => r.control?.type === "dropdown")
      .map((r) => r.name);
    expect(nativos).toEqual([]);
    // e o desenho à mão também não usa o <select> do Obsidian
    expect(readFileSync(resolve(__dirname, "../src/ui/SettingsTab.ts"), "utf8")).not.toContain(
      "addDropdown("
    );
  });

  it("fora da aba Chat: o tier da OpenAI e o nível de permissão do agente", () => {
    expect(pegos.filter((p) => p.tab === "providers").map((p) => p.key)).toEqual(["openaiTier"]);
    expect(pegos.filter((p) => p.tab === "agent").map((p) => p.key)).toEqual([
      "agentPermissionLevel",
    ]);
    const tier = pegos.find((p) => p.key === "openaiTier")!;
    expect(tier.itens.map((i) => i.glyph)).toEqual(["1", "2", "3", "4", "5"]);
    const perm = pegos.find((p) => p.key === "agentPermissionLevel")!;
    expect(perm.itens.map((i) => i.value)).toEqual(["ask", "vault", "yolo"]);
    // a interface é em inglês: o rótulo era metade português
    for (const i of perm.itens) expect(i.label, i.value).not.toMatch(/confirma |sem confirmações|pergunta/);
  });

  it("os menus que existiam viraram escolha, e moram na aba Chat", () => {
    // A precisão do índice também é escolha, mas mora no Q&A.
    expect(pegos.filter((p) => p.tab === "rag").map((p) => p.key)).toEqual(["ragQuantProfile"]);
    const daChat = pegos.filter((p) => p.tab === "chat");
    const chaves = daChat.map((p) => p.key).sort();
    expect(chaves).toEqual(
      [
        "defaultEffort",
        "defaultMode",
        "defaultProvider",
        "elevenModel",
        "language",
        "startupChatMode",
        "ttsModel",
        "ttsVoice",
        "voiceLanguage",
        "voiceModel",
      ].sort()
    );
    expect(new Set(pegos.map((p) => p.tab))).toEqual(new Set(["chat", "rag", "providers", "agent"]));
  });

  it("os níveis de esforço têm uma linha cada, num grupo da aba Chat", () => {
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

  it("a aba Q&A ganhou a precisão e os pedaços do índice", () => {
    const rag = (tree.items as unknown as Group[])
      .filter((x) => tree.places.get(x as object)?.tab === "rag")
      .flatMap((x) => x.items);
    const nomes = rag.map((r) => r.name);
    expect(nomes).toContain("Index precision");
    expect(rag.find((r) => r.name === "Search the index in pieces")?.control?.key).toBe("ragStreamShards");
  });

  it("toda opção tem ícone ou código, e um rótulo", () => {
    for (const p of pegos) {
      expect(p.itens.length, p.key).toBeGreaterThan(0);
      for (const i of p.itens) {
        expect(i.label, `${p.key}:${i.value}`).toBeTruthy();
        expect(!!(i.icon || i.glyph), `${p.key}:${i.value} sem ícone`).toBe(true);
      }
    }
  });

  it("o modo mostra o NOME do módulo, não o id cru", () => {
    const modo = pegos.find((p) => p.key === "defaultMode")!;
    expect(modo.itens.map((i) => i.label)).toEqual(["Chat", "Vault Q&A", "Agent"]);
  });

  it("idiomas usam o código no lugar do ícone (o Auto, o desenho de idiomas)", () => {
    const lang = pegos.find((p) => p.key === "language")!;
    expect(lang.itens.map((i) => i.glyph)).toEqual([undefined, "EN", "PT"]);
    expect(lang.itens[0].icon).toBe("languages");
  });
});

describe("visibilidade (o que some junto do interruptor)", () => {
  const vis = (name: string, ui: SettingsUi) => {
    const r = all(ui).find((x) => x.name === name);
    return r?.visible ? r.visible() : true;
  };

  it("o tier da cota só aparece com o interruptor de compartilhar ligado", () => {
    expect(vis("Usage tier", fakeUi({ settings: { openaiDataSharing: false } }))).toBe(false);
    expect(vis("Usage tier", fakeUi({ settings: { openaiDataSharing: true } }))).toBe(true);
  });

  it('"tier" na busca acha o interruptor mesmo com ele desligado', () => {
    const ui = fakeUi({ settings: { openaiDataSharing: false } });
    const achados = all(ui)
      .filter((r) => r.searchable !== false && (r.visible ? r.visible() : true))
      .filter((r) => [r.name, r.desc, ...(r.aliases ?? [])].some((t) => typeof t === "string" && /tier/i.test(t)))
      .map((r) => r.name);
    expect(achados).toContain("I share API data with OpenAI");
  });

  it("ditado desligado esconde o que é do ditado", () => {
    expect(vis("Ears", fakeUi({ settings: { voiceEnabled: false } }))).toBe(false);
    expect(vis("Ears", fakeUi({ settings: { voiceEnabled: true } }))).toBe(true);
  });

  it("quem lê decide quais linhas aparecem", () => {
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

  it("a voz da ElevenLabs só aparece depois de buscar as vozes", () => {
    const sem = fakeUi({ settings: { ttsProvider: "eleven", elevenVoices: [] } });
    expect(vis("ElevenLabs voice", sem)).toBe(false);
    const com = fakeUi({
      settings: { ttsProvider: "eleven", elevenVoices: [{ id: "v", name: "V" }] },
    });
    expect(vis("ElevenLabs voice", com)).toBe(true);
  });
});
