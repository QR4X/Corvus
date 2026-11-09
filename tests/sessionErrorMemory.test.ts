import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatSession } from "../src/core/session";
import { useChatStore } from "../src/store/chat";
import * as persistence from "../src/core/chatPersistence";
import { keepConversationMessage, storeMessagesToProvider } from "../src/agent/conversation";
import type CorvusPlugin from "../src/main";

const initial = useChatStore.getState();
const error = {
  type: "ai-response" as const, content: "[Error] output limit", isError: true,
  agentSteps: [{ id: "read-1", name: "vault_read", arguments: { path: "a.md" }, result: "read once", ok: true }],
};
let session: ChatSession | undefined;

beforeEach(() => {
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  useChatStore.setState({ ...initial, messages: [], background: null, currentChatId: null });
});
afterEach(() => {
  session?.dispose();
  session = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setup() {
  const saved: persistence.ChatData[] = [];
  const save = vi.spyOn(persistence, "saveChat").mockImplementation(async (_app, _path, chat) => {
    saved.push(persistence.parseChatMarkdown(persistence.renderChatMarkdown(chat)));
    return "chat.md";
  });
  const plugin = {
    app: {},
    settings: {
      defaultProvider: "openrouter", openrouterModel: "deepseek/deepseek-v4-flash-0731",
      defaultMode: "agent", defaultEffort: "low", language: "en", chatsPath: ".corvus/chats",
    },
    onSettingsChange: () => () => {},
    loadChatSummaries: async () => [],
    upsertChatSummary: vi.fn(), markChatUnread: vi.fn(), clearChatUnread: vi.fn(),
    unreadSet: () => new Set<string>(),
  };
  session = new ChatSession(plugin as unknown as CorvusPlugin);
  return { saved, save, session };
}

describe("actual session save paths preserve error tool memory", () => {
  it("normal save and reload retain the error flag and actions", async () => {
    const { saved, save, session } = setup();
    const st = useChatStore.getState();
    st.setCurrentChatId("chat-1");
    st.addMessage({ type: "user", content: "Question" });
    st.addMessage(error);
    session.flushSave();
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(saved[0].messages.at(-1)).toMatchObject(error);
    vi.spyOn(persistence, "loadChat").mockResolvedValue(saved[0]);
    await session.load({ id: "chat-1", mode: "agent" });
    const messages = useChatStore.getState().messages;
    expect(messages.at(-1)).toMatchObject(error);
    const history = storeMessagesToProvider(messages, undefined, true);
    expect(history).toContainEqual({ role: "tool", toolCallId: "read-1", content: "read once" });
    expect(history.some((m) => m.content.includes("[Error]"))).toBe(false);
  });

  it("background flush retains the same metadata and excludes errors without actions", async () => {
    const { saved, session } = setup();
    const st = useChatStore.getState();
    st.addMessage({ type: "user", content: "Question" });
    st.addMessage(error);
    st.addMessage({ type: "ai-response", content: "Unrelated API error", isError: true });
    st.detachTurn({
      chatId: "chat-1", title: "Question", mode: "agent", provider: "openrouter",
      model: "deepseek/deepseek-v4-flash-0731", effort: "low", messages: useChatStore.getState().messages,
      tokensIn: 0, tokensOut: 0, scrollTop: 0,
    });
    st.setMessages([]);
    await session.flushBackground();
    expect(saved).toHaveLength(1);
    expect(saved[0].messages).toHaveLength(2);
    expect(saved[0].messages.at(-1)).toMatchObject(error);
    expect(saved[0].messages.every(keepConversationMessage)).toBe(true);
    expect(useChatStore.getState().background).toBeNull();
  });
});
