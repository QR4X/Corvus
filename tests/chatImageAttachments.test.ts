// tests/chatImageAttachments.test.ts
// Imagem anexada a uma mensagem: sobrevive dentro da MENSAGEM (referência de
// que imagem você mandou), sem inflar o .md do chat com os bytes.
//
//   envio      → bytes gravados UMA vez no vault (path no anexo)
//   save .md   → só o descritor pequeno (type/name/path) — nunca a data URL
//   reload     → relê o arquivo do vault e reconstroi a data URL de exibição

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatSession } from "../src/core/session";
import { useChatStore } from "../src/store/chat";
import * as persistence from "../src/core/chatPersistence";
import {
  fromStoredAttachments,
  toStoredAttachments,
  type ChatData,
} from "../src/core/chatPersistence";
import {
  GENERATION_DIR,
  persistLocalImage,
} from "../src/ui/attachSources";
import type AxxaPlugin from "../src/main";

// O envio chama streamReply (rede); aqui ele é no-op pra testar o caminho que
// vai do composer até a mensagem no store.
vi.mock("../src/core/chatEngine", () => ({
  streamReply: vi.fn(async () => ({ content: "" })),
}));

const initial = useChatStore.getState();
let session: ChatSession | undefined;

const ADAPTER = {
  exists: vi.fn(async () => false),
  mkdir: vi.fn(async () => undefined),
  writeBinary: vi.fn(async () => undefined),
  readBinary: vi.fn(async () => new ArrayBuffer(0)),
};

function setup() {
  const plugin = {
    app: { vault: { adapter: ADAPTER } },
    settings: {
      defaultProvider: "openai",
      defaultModel: "gpt-4o",
      defaultMode: "chat",
      defaultEffort: "med",
      language: "en",
      chatsPath: ".axxa/chats",
      instagramReelsEnabled: false,
    },
    onSettingsChange: () => () => {},
    loadChatSummaries: async () => [],
    providerCredential: () => "test-key",
    saveSettings: async () => {},
    upsertChatSummary: vi.fn(),
    markChatUnread: vi.fn(),
    clearChatUnread: vi.fn(),
    unreadSet: () => new Set<string>(),
  };
  session = new ChatSession(plugin as unknown as AxxaPlugin);
  return { plugin };
}

const IMAGEM = {
  type: "image" as const,
  dataUrl: "data:image/png;base64,QUJD",
  mimeType: "image/png",
  name: "print.png",
};

beforeEach(() => {
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  useChatStore.setState({
    ...initial,
    messages: [],
    attachments: [],
    background: null,
    currentChatId: null,
  });
  vi.spyOn(persistence, "saveChat").mockResolvedValue("chat.md");
  ADAPTER.writeBinary.mockClear();
  ADAPTER.readBinary.mockReset();
  ADAPTER.readBinary.mockResolvedValue(new ArrayBuffer(0));
});

afterEach(() => {
  session?.dispose();
  session = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("enviar guarda os anexos na mensagem", () => {
  it("imagem `data:` vira anexo da mensagem com path no vault (bytes uma vez)", async () => {
    const { plugin } = setup();
    useChatStore.getState().addAttachment(IMAGEM);
    expect(await session!.send("olha isso")).toBe(true);

    const msg = useChatStore
      .getState()
      .messages.find((m) => m.type === "user");
    if (msg?.type !== "user") throw new Error("mensagem do user não existe");
    expect(msg.attachments).toHaveLength(1);
    expect(msg.attachments?.[0]).toMatchObject({
      type: "image",
      name: "print.png",
      mimeType: "image/png",
      dataUrl: IMAGEM.dataUrl, // o provider continua recebendo como antes
    });
    expect(msg.attachments?.[0].path).toMatch(
      new RegExp(`^${GENERATION_DIR}/images/.+\\.png$`)
    );
    // bytes no vault UMA vez, descritor pequeno no store
    expect(plugin.app.vault.adapter.writeBinary).toHaveBeenCalledTimes(1);
    expect(useChatStore.getState().attachments).toEqual([]);
  });

  it("URL externa passa sem gravar — persiste a própria URL", async () => {
    const { plugin } = setup();
    const externa = {
      type: "image" as const,
      dataUrl: "https://exemplo.com/foto.png",
      name: "foto.png",
    };
    useChatStore.getState().addAttachment(externa);
    expect(await session!.send("olha o link")).toBe(true);

    const msg = useChatStore
      .getState()
      .messages.find((m) => m.type === "user");
    if (msg?.type !== "user") throw new Error("mensagem do user não existe");
    expect(msg.attachments?.[0]).toEqual(externa);
    expect(plugin.app.vault.adapter.writeBinary).not.toHaveBeenCalled();
  });

  it("save do chat persiste só o descritor — nunca a data URL", async () => {
    const { plugin } = setup();
    const saved: persistence.ChatData[] = [];
    vi.spyOn(persistence, "saveChat").mockImplementation(
      async (_app, _path, chat) => {
        saved.push(
          persistence.parseChatMarkdown(persistence.renderChatMarkdown(chat))
        );
        return "chat.md";
      }
    );
    useChatStore.getState().addAttachment(IMAGEM);
    expect(await session!.send("olha isso")).toBe(true);
    session!.flushSave();
    await vi.waitFor(() => expect(saved).toHaveLength(1));

    const atts = saved[0].messages[0].attachments;
    expect(atts).toEqual([
      expect.objectContaining({
        type: "image",
        name: "print.png",
        mimeType: "image/png",
        path: expect.stringMatching(new RegExp(`^${GENERATION_DIR}/images/`)),
      }),
    ]);
    expect(JSON.stringify(saved)).not.toContain("data:");
    expect(plugin.app.vault.adapter.writeBinary).toHaveBeenCalledTimes(1);
  });
});

describe("persistLocalImage (novo helper)", () => {
  it("grava a imagem no vault e devolve o anexo com path", async () => {
    const writes: string[] = [];
    const app = {
      vault: {
        adapter: {
          exists: vi.fn(async () => false),
          mkdir: vi.fn(async () => undefined),
          writeBinary: vi.fn(async (p: string) => writes.push(p)),
        },
      },
    } as unknown as AxxaPlugin["app"];
    const out = await persistLocalImage(app, {
      ...IMAGEM,
      mimeType: "image/jpeg",
      dataUrl: "data:image/jpeg;base64,QUJD",
    });
    expect(out.path).toMatch(/^axxa-ai\/generation\/images\/.+\.jpg$/);
    expect(writes).toHaveLength(1);
  });

  it("URL externa não grava nada (passa igual)", async () => {
    const app = {
      vault: { adapter: { writeBinary: vi.fn(async () => undefined) } },
    } as unknown as AxxaPlugin["app"];
    const externa = { type: "image" as const, dataUrl: "https://x.com/a.png" };
    await expect(persistLocalImage(app, externa)).resolves.toBe(externa);
  });

  it("falha de escrita não derruba o envio (anexo fica sem path)", async () => {
    const app = {
      vault: { adapter: { writeBinary: vi.fn(async () => { throw new Error("cheio"); }) } },
    } as unknown as AxxaPlugin["app"];
    const out = await persistLocalImage(app, IMAGEM);
    expect(out.path).toBeUndefined();
  });
});

describe("descritores do .md ↔ anexos (persistência)", () => {
  it("toStoredAttachments descarta os bytes, mantém só o descritor", () => {
    expect(
      toStoredAttachments([
        { ...IMAGEM, dataUrl: "data:image/png;base64,BASE64 GIGANTE", path: `${GENERATION_DIR}/images/1-p.png` },
        { type: "image", dataUrl: "https://exemplo.com/foto.png", name: "foto.png" },
        { type: "note", path: "PROJECTS/FRAMEWORKS.md", content: "conteúdo longo…" },
      ])
    ).toEqual([
      { type: "image", path: `${GENERATION_DIR}/images/1-p.png`, name: "print.png", mimeType: "image/png" },
      { type: "image", path: "https://exemplo.com/foto.png", name: "foto.png" },
      { type: "note", path: "PROJECTS/FRAMEWORKS.md" },
    ]);
  });

  it("fromStoredAttachments relê o path e reconstroi a data URL de exibição", async () => {
    const app = {
      vault: {
        adapter: {
          readBinary: vi.fn(async () => new TextEncoder().encode("XYZ").buffer),
        },
      },
    } as unknown as AxxaPlugin["app"];
    const out = await fromStoredAttachments(app, [
      { type: "image", path: `${GENERATION_DIR}/images/1-p.png`, name: "p.png", mimeType: "image/png" },
      { type: "image", path: "https://exemplo.com/foto.png", name: "foto.png" },
      { type: "note", path: "PROJECTS/FRAMEWORKS.md" },
      { type: "audio", path: `${GENERATION_DIR}/audio/x.webm`, durationMs: 500 },
    ]);
    expect(out[0]).toMatchObject({
      type: "image",
      path: `${GENERATION_DIR}/images/1-p.png`,
      dataUrl: "data:image/png;base64,WFla",
      name: "p.png",
    });
    expect(out[1]).toEqual({ type: "image", dataUrl: "https://exemplo.com/foto.png", name: "foto.png" });
    expect(out[2]).toEqual({ type: "note", path: "PROJECTS/FRAMEWORKS.md", content: "" });
    expect(out[3]).toEqual({ type: "audio", path: `${GENERATION_DIR}/audio/x.webm`, durationMs: 500 });
  });

  it("imagem apagada do vault não quebra o load (vira vazio, chip de emoji)", async () => {
    const app = {
      vault: {
        adapter: {
          readBinary: vi.fn(async () => {
            throw new Error("arquivo sumiu");
          }),
        },
      },
    } as unknown as AxxaPlugin["app"];
    const out = await fromStoredAttachments(app, [
      { type: "image", path: `${GENERATION_DIR}/images/1-p.png`, name: "p.png" },
    ]);
    expect(out[0]).toEqual({
      type: "image",
      dataUrl: "",
      name: "p.png",
      path: `${GENERATION_DIR}/images/1-p.png`,
    });
  });
});

describe("reload do chat", () => {
  it("load() reconstrói a data URL a partir do path gravado", async () => {
    setup();
    const chat: ChatData = {
      id: "chat-1",
      title: "t",
      date: new Date().toISOString(),
      mode: "chat",
      provider: "openai",
      model: "gpt-4o",
      effort: "med",
      tokensIn: 0,
      tokensOut: 0,
      messages: [
        {
          type: "user",
          content: "olha",
          timestamp: 1,
          attachments: [
            { type: "image", path: `${GENERATION_DIR}/images/1-p.png`, name: "p.png", mimeType: "image/png" },
          ],
        },
      ],
    };
    vi.spyOn(persistence, "loadChat").mockResolvedValue(chat);
    ADAPTER.readBinary.mockResolvedValue(
      new TextEncoder().encode("XYZ").buffer
    );
    await session!.load({ id: "chat-1", mode: "chat" });

    const msg = useChatStore
      .getState()
      .messages.find((m) => m.type === "user");
    if (msg?.type !== "user") throw new Error("mensagem do user não existe");
    expect(msg.attachments?.[0]).toMatchObject({
      type: "image",
      path: `${GENERATION_DIR}/images/1-p.png`,
      dataUrl: "data:image/png;base64,WFla",
      name: "p.png",
    });
  });
});
