import { describe, it, expect, beforeEach } from "vitest";
import { useChatStore, NEW_CHAT_DRAFT } from "../src/store/chat";

const st = () => useChatStore.getState();

describe("drafts", () => {
  beforeEach(() => {
    useChatStore.setState({ drafts: {} });
  });

  it("keeps a separate draft per chat", () => {
    st().setDraft("chat-a", "text for A");
    st().setDraft("chat-b", "text for B");
    expect(st().drafts["chat-a"]).toBe("text for A");
    expect(st().drafts["chat-b"]).toBe("text for B");
  });

  it("gives the new chat its own key", () => {
    st().setDraft(NEW_CHAT_DRAFT, "not sent yet");
    st().setDraft("chat-a", "something else");
    expect(st().drafts[NEW_CHAT_DRAFT]).toBe("not sent yet");
  });

  it("deletes the entry on empty text instead of storing an empty string", () => {
    st().setDraft("chat-a", "something");
    st().setDraft("chat-a", "");
    expect("chat-a" in st().drafts).toBe(false);
  });

  it("clearing one chat leaves the others alone", () => {
    st().setDraft("chat-a", "A");
    st().setDraft("chat-b", "B");
    st().setDraft("chat-a", "");
    expect(st().drafts).toEqual({ "chat-b": "B" });
  });

  it("writing the same text keeps the same object to avoid re-renders", () => {
    st().setDraft("chat-a", "same");
    const before = st().drafts;
    st().setDraft("chat-a", "same");
    expect(st().drafts).toBe(before);
  });

  it("newChat keeps drafts because the text predates the chat", () => {
    st().setDraft(NEW_CHAT_DRAFT, "was typing");
    st().newChat();
    expect(st().drafts[NEW_CHAT_DRAFT]).toBe("was typing");
  });
});

describe("message queue", () => {
  beforeEach(() => {
    useChatStore.setState({ queued: [] });
  });

  it("keeps both queued messages in order", () => {
    st().pushQueued("first");
    st().pushQueued("second");
    expect(st().queued).toEqual(["first", "second"]);
  });

  it("removing drops only that message", () => {
    st().pushQueued("a");
    st().pushQueued("b");
    st().removeQueued(0);
    expect(st().queued).toEqual(["b"]);
  });

  it("clearing empties the queue", () => {
    st().pushQueued("a");
    st().pushQueued("b");
    st().clearQueued();
    expect(st().queued).toEqual([]);
  });

  it("a new chat starts with an empty queue", () => {
    st().pushQueued("leftover?");
    st().newChat();
    expect(st().queued).toEqual([]);
  });
});
