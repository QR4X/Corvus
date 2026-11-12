import { afterEach, describe, expect, it } from "vitest";
import { ChatSession } from "../src/core/session";
import { useChatStore } from "../src/store/chat";
import { storeMessagesToProvider } from "../src/agent/conversation";
import type { CorvusSettings } from "../src/main";

function build() {
  const settings = {
    defaultProvider: "openai",
    defaultModel: "gpt-4o",
    anthropicModel: "claude-sonnet-4-5",
    defaultMode: "chat",
    defaultEffort: "med",
    activeModels: {},
    favoriteModels: {},
  } as unknown as CorvusSettings;
  const plugin = {
    settings,
    onSettingsChange: () => () => undefined,
    loadChatSummaries: async () => [],
    saveSettings: async () => undefined,
    providerCredential: () => "k",
  };
  return new ChatSession(plugin as never);
}

afterEach(() => {
  useChatStore.getState().newChat();
});

describe("switching the model in a running chat", () => {
  it("changes provider and model while the chat stays locked to its mode", () => {
    const session = build();
    const st = useChatStore.getState();
    st.addMessage({ type: "user", content: "hi" });
    st.addMessage({ type: "ai-response", content: "hello" });
    st.lockSession("openai", "gpt-4o", "chat");

    session.selectModel("anthropic", "claude-opus-4-1");

    const cfg = session.config;
    expect(cfg.provider).toBe("anthropic");
    expect(cfg.model).toBe("claude-opus-4-1");
    expect(cfg.mode).toBe("chat");
    expect(useChatStore.getState().sessionProvider).toBe("anthropic");
    expect(useChatStore.getState().sessionModel).toBe("claude-opus-4-1");
    session.dispose();
  });

  it("keeps the history unchanged in the neutral format", () => {
    const session = build();
    const st = useChatStore.getState();
    st.addMessage({ type: "user", content: "hi" });
    st.addMessage({ type: "ai-response", content: "hello" });
    st.lockSession("openai", "gpt-4o", "chat");

    session.selectModel("openai", "gpt-5");

    const msgs = useChatStore.getState().messages;
    expect(msgs).toHaveLength(2);
    expect(session.config.model).toBe("gpt-5");
    expect(storeMessagesToProvider(msgs)).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
    session.dispose();
  });

  it("does nothing for the same model and does not lock a fresh chat", () => {
    const session = build();
    session.selectModel("openai", "gpt-4o");
    expect(useChatStore.getState().messages).toHaveLength(0);
    session.selectModel("anthropic", "claude-opus-4-1");
    expect(useChatStore.getState().messages).toHaveLength(0);
    expect(useChatStore.getState().sessionProvider).toBeNull();
    expect(session.config.model).toBe("claude-opus-4-1");
    session.dispose();
  });
});
