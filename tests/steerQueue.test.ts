import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatSession } from "../src/core/session";
import { useChatStore } from "../src/store/chat";
import * as persistence from "../src/core/chatPersistence";
import { runAgentTurn } from "../src/core/agentTurn";
import type CorvusPlugin from "../src/main";

vi.mock("../src/core/agentTurn", () => ({ runAgentTurn: vi.fn() }));

const initial = useChatStore.getState();
let session: ChatSession | undefined;

beforeEach(() => {
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  vi.spyOn(persistence, "saveChat").mockResolvedValue("chat.md");
  useChatStore.setState({ ...initial, messages: [], queued: [], drafts: {}, background: null, currentChatId: null });
});
afterEach(() => {
  session?.dispose();
  session = undefined;
  vi.mocked(runAgentTurn).mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setup(): ChatSession {
  const plugin = {
    app: {},
    settings: {
      defaultProvider: "openrouter", openrouterModel: "deepseek/deepseek-v4-flash-0731",
      defaultMode: "agent", defaultEffort: "low", language: "en", chatsPath: ".corvus/chats",
    },
    onSettingsChange: () => () => {},
    loadChatSummaries: async () => [],
    providerCredential: () => "key",
    upsertChatSummary: vi.fn(), markChatUnread: vi.fn(), clearChatUnread: vi.fn(),
    unreadSet: () => new Set<string>(),
  };
  session = new ChatSession(plugin as unknown as CorvusPlugin);
  return session;
}

describe("steering queue in the session", () => {
  it("sends messages left after the final answer as new turns exactly once", async () => {
    const s = setup();
    vi.mocked(runAgentTurn).mockImplementation(async (_ctx, text) => {
      const st = useChatStore.getState();
      st.setLoading(true);
      if (text === "First") {
        st.pushQueued("Second");
        st.pushQueued("Third");
      }
      st.addMessage({ type: "ai-response", content: `Re: ${text}` });
      st.setLoading(false);
    });
    await s.send("First");
    expect(vi.mocked(runAgentTurn).mock.calls.map((c) => c[1])).toEqual(["First", "Second", "Third"]);
    expect(useChatStore.getState().queued).toEqual([]);
    expect(useChatStore.getState().messages.filter((m) => m.type === "user").map((m) => m.content))
      .toEqual(["First", "Second", "Third"]);
  });

  it("Stop moves queued text back into the draft instead of dropping it", () => {
    const s = setup();
    const st = useChatStore.getState();
    st.setCurrentChatId("chat-1");
    st.setTurnChatId("chat-1");
    st.setDraft("chat-1", "Typing");
    st.pushQueued("Also B");
    st.pushQueued("Skip C");
    s.stop();
    expect(useChatStore.getState().queued).toEqual([]);
    expect(useChatStore.getState().drafts["chat-1"]).toBe("Typing\n\nAlso B\n\nSkip C");
  });
});
