import { describe, it, expect, beforeEach } from "vitest";
import { useChatStore, type BackgroundRun } from "../src/store/chat";

const initial = useChatStore.getState();

const run = (over: Partial<BackgroundRun> = {}): BackgroundRun => ({
  chatId: "chat-A",
  title: "The one that is answering",
  mode: "chat",
  provider: "openai",
  model: "gpt-5",
  effort: "medium",
  messages: [],
  tokensIn: 0,
  tokensOut: 0,
  ...over,
});

beforeEach(() => {
  useChatStore.setState({
    ...initial,
    messages: [],
    background: null,
    turnChatId: null,
    tokensIn: 0,
    tokensOut: 0,
    queued: [],
    currentChatId: null,
  });
});

describe("turn writes while its chat is on screen", () => {
  it("go to the visible messages", () => {
    const st = useChatStore.getState();
    const id = st.addMessage({ type: "ai-response", content: "hi" });
    st.appendToMessage(id, " world");
    const s = useChatStore.getState();
    expect(s.background).toBeNull();
    expect(s.messages).toHaveLength(1);
    expect((s.messages[0] as { content: string }).content).toBe("hi world");
  });
});

describe("turn writes while its chat is off screen", () => {
  beforeEach(() => {
    const st = useChatStore.getState();
    const id = st.addMessage({ type: "user", content: "question" });
    expect(id).toBeTruthy();
    st.detachTurn(run({ messages: useChatStore.getState().messages }));

    useChatStore.getState().setMessages([]);
    useChatStore.getState().setCurrentChatId("chat-B");
  });

  it("a new message does not show up in the open chat", () => {
    useChatStore.getState().addMessage({
      type: "ai-response",
      content: "answer for A",
    });
    const s = useChatStore.getState();
    expect(s.messages).toHaveLength(0);
    expect(s.background?.messages).toHaveLength(2);
  });

  it("streamed tokens also go to the background chat", () => {
    const id = useChatStore
      .getState()
      .addMessage({ type: "ai-response", content: "" });
    useChatStore.getState().appendToMessage(id, "abc");
    useChatStore.getState().appendToMessage(id, "def");
    const s = useChatStore.getState();
    expect(s.messages).toHaveLength(0);
    const last = s.background?.messages.at(-1) as { content: string };
    expect(last.content).toBe("abcdef");
  });

  it("agent steps do not leak into the open chat", () => {
    const id = useChatStore
      .getState()
      .addMessage({ type: "ai-response", content: "Interrupted" });
    useChatStore
      .getState()
      .setAgentSteps(id, [
        { id: "t1", name: "vault_list", arguments: {}, result: "7", ok: true },
      ]);
    const s = useChatStore.getState();
    expect(s.messages).toHaveLength(0);
    const last = s.background?.messages.at(-1) as {
      agentSteps?: unknown[];
    };
    expect(last.agentSteps).toHaveLength(1);
  });

  it("tokens are billed to the chat that spent them", () => {
    useChatStore.getState().addUsage(120, 340);
    const s = useChatStore.getState();
    expect(s.tokensIn).toBe(0);
    expect(s.tokensOut).toBe(0);
    expect(s.background?.tokensIn).toBe(120);
    expect(s.background?.tokensOut).toBe(340);
  });

  it("reactions still apply to the chat on screen", () => {
    const background = useChatStore
      .getState()
      .background;
    expect(background).toBeTruthy();
    useChatStore.getState().setMessages([
      { id: "m1", type: "ai-response", content: "from B", timestamp: 1 },
    ] as never);
    useChatStore.getState().setReaction("m1", "like");
    const s = useChatStore.getState();
    expect((s.messages[0] as { reaction?: string }).reaction).toBe("like");
    expect(s.background?.messages.some((m) => m.id === "m1")).toBe(false);
  });

  it("clearing the screen does not stop the background turn", () => {
    useChatStore.setState({ isLoading: true, streamingMessageId: "m9" });
    useChatStore.getState().clearMessages();
    const s = useChatStore.getState();
    expect(s.isLoading).toBe(true);
    expect(s.streamingMessageId).toBe("m9");
    expect(s.background).not.toBeNull();
  });

  it("starting a new chat does not stop the background turn", () => {
    useChatStore.setState({ isLoading: true, streamingMessageId: "m9" });
    useChatStore.getState().newChat();
    const s = useChatStore.getState();
    expect(s.isLoading).toBe(true);
    expect(s.currentChatId).toBeNull();
    expect(s.background).not.toBeNull();
  });

  it("without a background turn, clearing the screen resets loading state", () => {
    useChatStore.getState().clearBackground();
    useChatStore.setState({ isLoading: true, streamingMessageId: "m9" });
    useChatStore.getState().clearMessages();
    const s = useChatStore.getState();
    expect(s.isLoading).toBe(false);
    expect(s.streamingMessageId).toBeNull();
  });
});

describe("returning to the chat that is answering", () => {
  it("hands the turn back and clears the background", () => {
    const st = useChatStore.getState();
    st.detachTurn(
      run({
        messages: [
          { id: "m1", type: "user", content: "hi", timestamp: 1 },
        ] as never,
        tokensIn: 7,
      })
    );
    const returned = useChatStore.getState().attachTurn();
    expect(returned?.chatId).toBe("chat-A");
    expect(returned?.messages).toHaveLength(1);
    expect(returned?.tokensIn).toBe(7);
    expect(useChatStore.getState().background).toBeNull();
  });

  it("returns null when nothing runs in the background", () => {
    expect(useChatStore.getState().attachTurn()).toBeNull();
  });
});
