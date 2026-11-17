import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import fs from "fs";
import { randomBytes } from "node:crypto";
import { __notices } from "obsidian";
import { ChatSession } from "../src/core/session";
import { useChatStore } from "../src/store/chat";
import type { ChatMessage } from "../src/store/chat";
import { report } from "../scripts/size-report.mjs";

const NOT_ON_DISK = /not on disk yet/;

function setup() {
  const disk = { failing: true };
  const write = vi.fn(async () => {
    if (disk.failing) throw new Error("disk full");
  });
  const plugin = {
    settings: {
      defaultProvider: "openai",
      defaultModel: "gpt-4o",
      defaultMode: "chat",
      defaultEffort: "med",
      chatsPath: "corvus/chats",
      activeModels: {},
      favoriteModels: {},
    },
    app: { vault: { adapter: { exists: async () => true, mkdir: async () => {}, write } } },
    onSettingsChange: () => () => {},
    saveSettings: async () => {},
    chats: {
      load: async () => [],
      upsert: vi.fn(),
      markUnread: vi.fn(),
      unread: () => new Set<string>(),
    },
  };
  const session = new ChatSession(plugin as never);
  let n = 0;
  const saveCurrent = async () => {
    n += 1;
    const msg = { id: `m${n}`, type: "user", content: `message ${n}`, timestamp: n };
    useChatStore.getState().setMessages([
      ...useChatStore.getState().messages,
      msg as unknown as ChatMessage,
    ]);
    session.flushSave();
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(n));
    await Promise.resolve();
  };
  return { session, disk, write, saveCurrent };
}

const saveNotices = () => __notices.filter((m) => NOT_ON_DISK.test(m));

describe("saving the chat", () => {
  beforeEach(() => {
    __notices.length = 0;
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    vi.spyOn(console, "error").mockImplementation(() => {});
    useChatStore.getState().newChat();
    useChatStore.getState().setCurrentChatId("c1");
  });

  afterEach(() => {
    useChatStore.getState().newChat();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("warns the user when the chat could not be written to disk", async () => {
    const { session, saveCurrent } = setup();
    await saveCurrent();
    expect(saveNotices()).toHaveLength(1);
    session.dispose();
  });

  it("warns once per failure streak and re-arms after a successful save", async () => {
    const { session, disk, saveCurrent } = setup();
    await saveCurrent();
    await saveCurrent();
    expect(saveNotices()).toHaveLength(1);

    disk.failing = false;
    await saveCurrent();
    expect(saveNotices()).toHaveLength(1);

    disk.failing = true;
    await saveCurrent();
    expect(saveNotices()).toHaveLength(2);
    session.dispose();
  });

  it("warns when saving a background run fails too", async () => {
    const { session, write } = setup();
    useChatStore.setState({
      background: {
        chatId: "bg1",
        scrollTop: 0,
        title: "Background",
        mode: "chat",
        provider: "openai",
        model: "gpt-4o",
        effort: "med",
        tokensIn: 0,
        tokensOut: 0,
        messages: [{ id: "b1", type: "user", content: "hi", timestamp: 1 } as unknown as ChatMessage],
      },
    });
    await session.flushBackground();
    expect(write).toHaveBeenCalledTimes(1);
    expect(saveNotices()).toHaveLength(1);
    session.dispose();
  });
});

describe("the bundle size report", () => {
  function withOutput(files: Record<string, Buffer>): boolean {
    const realRead = fs.readFileSync;
    vi.spyOn(fs, "existsSync").mockImplementation((p) =>
      String(p).startsWith("output") ? String(p).replace(/\\/g, "/").slice(7) in files : false
    );
    vi.spyOn(fs, "readFileSync").mockImplementation(((p: fs.PathOrFileDescriptor, o?: unknown) => {
      const key = String(p).replace(/\\/g, "/").slice(7);
      if (String(p).startsWith("output") && key in files) return files[key];
      return (realRead as (p: fs.PathOrFileDescriptor, o?: unknown) => unknown)(p, o);
    }) as typeof fs.readFileSync);
    vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      return report();
    } finally {
      vi.restoreAllMocks();
    }
  }

  const KB = 1024;

  it("passes when every file is within both budgets", () => {
    expect(withOutput({ "main.js": Buffer.alloc(100 * KB, "a"), "styles.css": Buffer.alloc(10 * KB, "a") })).toBe(true);
  });

  it("fails when only the raw size of main.js is over budget", () => {
    expect(withOutput({ "main.js": Buffer.alloc(600 * KB, "a") })).toBe(false);
  });

  it("fails when only the gzip size of main.js is over budget", () => {
    expect(withOutput({ "main.js": randomBytes(300 * KB) })).toBe(false);
  });

  it("fails when styles.css is over budget", () => {
    expect(withOutput({ "styles.css": randomBytes(60 * KB) })).toBe(false);
  });
});
