import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatSession } from "../src/core/session";
import { useChatStore } from "../src/store/chat";
import * as persistence from "../src/core/chatPersistence";
import {
  fromStoredAttachments,
  toStoredAttachments,
  type ChatData,
} from "../src/core/chatPersistence";
import { persistLocalImage } from "../src/core/imageStore";
import { GENERATION_FOLDER } from "../src/core/vaultPaths";
import type CorvusPlugin from "../src/main";

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
      chatsPath: ".corvus/chats",
      openaiApiKey: "test-key",
    },
    onSettingsChange: () => () => {},
    chats: {
      load: async () => [],
      upsert: vi.fn(),
      markUnread: vi.fn(),
      clearUnread: vi.fn(),
      unread: () => new Set<string>(),
    },
    saveSettings: async () => {},
  };
  session = new ChatSession(plugin as unknown as CorvusPlugin);
  return { plugin };
}

const IMAGE = {
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

describe("sending keeps attachments on the message", () => {
  it("stores a data: image in the vault once and attaches it with its path", async () => {
    const { plugin } = setup();
    useChatStore.getState().addAttachment(IMAGE);
    expect(await session!.send("look at this")).toBe(true);

    const msg = useChatStore
      .getState()
      .messages.find((m) => m.type === "user");
    if (msg?.type !== "user") throw new Error("user message missing");
    expect(msg.attachments).toHaveLength(1);
    expect(msg.attachments?.[0]).toMatchObject({
      type: "image",
      name: "print.png",
      mimeType: "image/png",
      dataUrl: IMAGE.dataUrl,
    });
    expect(msg.attachments?.[0].path).toMatch(
      new RegExp(`^${GENERATION_FOLDER}/images/.+\\.png$`)
    );

    expect(plugin.app.vault.adapter.writeBinary).toHaveBeenCalledTimes(1);
    expect(useChatStore.getState().attachments).toEqual([]);
  });

  it("passes an external URL through without writing and persists the URL itself", async () => {
    const { plugin } = setup();
    const external = {
      type: "image" as const,
      dataUrl: "https://example.com/photo.png",
      name: "photo.png",
    };
    useChatStore.getState().addAttachment(external);
    expect(await session!.send("look at the link")).toBe(true);

    const msg = useChatStore
      .getState()
      .messages.find((m) => m.type === "user");
    if (msg?.type !== "user") throw new Error("user message missing");
    expect(msg.attachments?.[0]).toEqual(external);
    expect(plugin.app.vault.adapter.writeBinary).not.toHaveBeenCalled();
  });

  it("saves only the descriptor, never the data URL", async () => {
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
    useChatStore.getState().addAttachment(IMAGE);
    expect(await session!.send("look at this")).toBe(true);
    session!.flushSave();
    await vi.waitFor(() => expect(saved).toHaveLength(1));

    const atts = saved[0].messages[0].attachments;
    expect(atts).toEqual([
      expect.objectContaining({
        type: "image",
        name: "print.png",
        mimeType: "image/png",
        path: expect.stringMatching(new RegExp(`^${GENERATION_FOLDER}/images/`)),
      }),
    ]);
    expect(JSON.stringify(saved)).not.toContain("data:");
    expect(plugin.app.vault.adapter.writeBinary).toHaveBeenCalledTimes(1);
  });
});

describe("persistLocalImage", () => {
  it("writes the image to the vault and returns the attachment with its path", async () => {
    const writes: string[] = [];
    const app = {
      vault: {
        adapter: {
          exists: vi.fn(async () => false),
          mkdir: vi.fn(async () => undefined),
          writeBinary: vi.fn(async (p: string) => writes.push(p)),
        },
      },
    } as unknown as CorvusPlugin["app"];
    const out = await persistLocalImage(app, {
      ...IMAGE,
      mimeType: "image/jpeg",
      dataUrl: "data:image/jpeg;base64,QUJD",
    });
    expect(out.path).toMatch(/^corvus-ai\/generation\/images\/.+\.jpg$/);
    expect(writes).toHaveLength(1);
  });

  it("writes nothing for an external URL and returns it unchanged", async () => {
    const app = {
      vault: { adapter: { writeBinary: vi.fn(async () => undefined) } },
    } as unknown as CorvusPlugin["app"];
    const external = { type: "image" as const, dataUrl: "https://x.com/a.png" };
    await expect(persistLocalImage(app, external)).resolves.toBe(external);
  });

  it("keeps sending without a path when the write fails", async () => {
    const app = {
      vault: { adapter: { writeBinary: vi.fn(async () => { throw new Error("disk full"); }) } },
    } as unknown as CorvusPlugin["app"];
    const out = await persistLocalImage(app, IMAGE);
    expect(out.path).toBeUndefined();
  });
});

describe("stored attachment descriptors", () => {
  it("toStoredAttachments drops the bytes and keeps only the descriptor", () => {
    expect(
      toStoredAttachments([
        { ...IMAGE, dataUrl: "data:image/png;base64,HUGE BASE64", path: `${GENERATION_FOLDER}/images/1-p.png` },
        { type: "image", dataUrl: "https://example.com/photo.png", name: "photo.png" },
        { type: "note", path: "PROJECTS/FRAMEWORKS.md", content: "long content…" },
      ])
    ).toEqual([
      { type: "image", path: `${GENERATION_FOLDER}/images/1-p.png`, name: "print.png", mimeType: "image/png" },
      { type: "image", path: "https://example.com/photo.png", name: "photo.png" },
      { type: "note", path: "PROJECTS/FRAMEWORKS.md" },
    ]);
  });

  it("fromStoredAttachments rereads the path and rebuilds the display data URL", async () => {
    const app = {
      vault: {
        adapter: {
          readBinary: vi.fn(async () => new TextEncoder().encode("XYZ").buffer),
        },
      },
    } as unknown as CorvusPlugin["app"];
    const out = await fromStoredAttachments(app, [
      { type: "image", path: `${GENERATION_FOLDER}/images/1-p.png`, name: "p.png", mimeType: "image/png" },
      { type: "image", path: "https://example.com/photo.png", name: "photo.png" },
      { type: "note", path: "PROJECTS/FRAMEWORKS.md" },
      { type: "audio", path: `${GENERATION_FOLDER}/audio/x.webm`, durationMs: 500 },
    ]);
    expect(out[0]).toMatchObject({
      type: "image",
      path: `${GENERATION_FOLDER}/images/1-p.png`,
      dataUrl: "data:image/png;base64,WFla",
      name: "p.png",
    });
    expect(out[1]).toEqual({ type: "image", dataUrl: "https://example.com/photo.png", name: "photo.png" });
    expect(out[2]).toEqual({ type: "note", path: "PROJECTS/FRAMEWORKS.md", content: "" });
    expect(out[3]).toEqual({ type: "audio", path: `${GENERATION_FOLDER}/audio/x.webm`, durationMs: 500 });
  });

  it("loads an image deleted from the vault as empty instead of failing", async () => {
    const app = {
      vault: {
        adapter: {
          readBinary: vi.fn(async () => {
            throw new Error("file gone");
          }),
        },
      },
    } as unknown as CorvusPlugin["app"];
    const out = await fromStoredAttachments(app, [
      { type: "image", path: `${GENERATION_FOLDER}/images/1-p.png`, name: "p.png" },
    ]);
    expect(out[0]).toEqual({
      type: "image",
      dataUrl: "",
      name: "p.png",
      path: `${GENERATION_FOLDER}/images/1-p.png`,
    });
  });
});

describe("chat reload", () => {
  it("load() rebuilds the data URL from the stored path", async () => {
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
          content: "look",
          timestamp: 1,
          attachments: [
            { type: "image", path: `${GENERATION_FOLDER}/images/1-p.png`, name: "p.png", mimeType: "image/png" },
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
    if (msg?.type !== "user") throw new Error("user message missing");
    expect(msg.attachments?.[0]).toMatchObject({
      type: "image",
      path: `${GENERATION_FOLDER}/images/1-p.png`,
      dataUrl: "data:image/png;base64,WFla",
      name: "p.png",
    });
  });
});
