import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatSession } from "../src/core/session";
import { useChatStore } from "../src/store/chat";
import { storeMessagesToProvider } from "../src/agent/conversation";
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
    anthropicModel: "claude-sonnet-4-5",
    defaultMode: "chat",
    defaultEffort: "med",
    activeModels: {},
    favoriteModels: {},
  } as unknown as CorvusSettings;
  const plugin = {
    settings,
    onSettingsChange: () => () => undefined,
    chats: { load: async () => [] },
    saveSettings: async () => undefined,
  };
  const s = new ChatSession(plugin as never);
  session = s;
  return s;
}

describe("switching the model in a running chat", () => {
  it("changes provider and model while the chat stays locked to its mode", () => {
    const s = build();
    const st = useChatStore.getState();
    st.addMessage({ type: "user", content: "hi" });
    st.addMessage({ type: "ai-response", content: "hello" });
    st.lockSession("openai", "gpt-4o", "chat");

    s.selectModel("anthropic", "claude-opus-4-1");

    const cfg = s.config;
    expect(cfg.provider).toBe("anthropic");
    expect(cfg.model).toBe("claude-opus-4-1");
    expect(cfg.mode).toBe("chat");
    expect(useChatStore.getState().sessionProvider).toBe("anthropic");
    expect(useChatStore.getState().sessionModel).toBe("claude-opus-4-1");
  });

  it("keeps the history unchanged in the neutral format", () => {
    const s = build();
    const st = useChatStore.getState();
    st.addMessage({ type: "user", content: "hi" });
    st.addMessage({ type: "ai-response", content: "hello" });
    st.lockSession("openai", "gpt-4o", "chat");

    s.selectModel("openai", "gpt-5");

    const msgs = useChatStore.getState().messages;
    expect(msgs).toHaveLength(2);
    expect(s.config.model).toBe("gpt-5");
    expect(storeMessagesToProvider(msgs)).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
  });

  it("does nothing for the same model and does not lock a fresh chat", () => {
    const s = build();
    s.selectModel("openai", "gpt-4o");
    expect(useChatStore.getState().messages).toHaveLength(0);
    s.selectModel("anthropic", "claude-opus-4-1");
    expect(useChatStore.getState().messages).toHaveLength(0);
    expect(useChatStore.getState().sessionProvider).toBeNull();
    expect(s.config.model).toBe("claude-opus-4-1");
  });
});
