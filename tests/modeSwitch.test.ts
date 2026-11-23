import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatSession } from "../src/core/session";
import { useChatStore } from "../src/store/chat";
import type { CorvusSettings } from "../src/settings";

const initial = useChatStore.getState();
let session: ChatSession | undefined;

beforeEach(() => {
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  useChatStore.setState({
    ...initial,
    messages: [],
    background: null,
    currentChatId: null,
  });
});

afterEach(() => {
  session?.dispose();
  session = undefined;
  vi.unstubAllGlobals();
});

function build() {
  const settings = {
    defaultProvider: "openai",
    defaultModel: "gpt-4o",
    openaiModel: "gpt-4o",
    defaultMode: "chat",
    defaultEffort: "med",
    chatsPath: "corvus/chats",
    activeModels: {},
    favoriteModels: {},
  } as unknown as CorvusSettings;
  const plugin = {
    settings,
    app: {
      vault: {
        adapter: {
          exists: async () => false,
          remove: async () => undefined,
        },
      },
    },
    onSettingsChange: () => () => undefined,
    chats: { load: async () => [], upsert: () => undefined },
    saveSettings: async () => undefined,
  };
  const s = new ChatSession(plugin as never);
  session = s;
  return { session: s, settings };
}

describe("switching chat mode", () => {
  it("switches mode in a fresh chat and saves defaultMode", () => {
    const { session: s, settings } = build();
    expect(s.config.mode).toBe("chat");

    s.setMode("vault-qa");
    expect(s.config.mode).toBe("vault-qa");
    expect(s.config.vault).toBe(true);
    expect(settings.defaultMode).toBe("vault-qa");
  });

  it("switches mode in an active running chat and updates store sessionMode", () => {
    const { session: s } = build();
    const st = useChatStore.getState();
    st.addMessage({ type: "user", content: "hello" });
    st.lockSession("openai", "gpt-4o", "chat");

    expect(s.config.mode).toBe("chat");
    expect(s.config.vault).toBe(false);

    s.setMode("agent");

    expect(s.config.mode).toBe("agent");
    expect(s.config.vault).toBe(true);
    expect(useChatStore.getState().sessionMode).toBe("agent");

    s.setMode("vault-qa");
    expect(s.config.mode).toBe("vault-qa");
    expect(useChatStore.getState().sessionMode).toBe("vault-qa");

    s.setMode("chat");
    expect(s.config.mode).toBe("chat");
    expect(s.config.vault).toBe(false);
    expect(useChatStore.getState().sessionMode).toBe("chat");
  });
});
