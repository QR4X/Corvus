import { describe, it, expect } from "vitest";
import { alertCount, chatAlert } from "../src/ui/chatAlert";

describe("chatAlert", () => {
  const idle = { waiting: false, running: false, unread: false };

  it("shows nothing for a quiet chat", () => {
    expect(chatAlert(idle)).toBeNull();
  });

  it("reports each state on its own", () => {
    expect(chatAlert({ ...idle, running: true })).toBe("running");
    expect(chatAlert({ ...idle, unread: true })).toBe("unread");
    expect(chatAlert({ ...idle, waiting: true })).toBe("waiting");
  });

  it("gives priority to a chat waiting on you", () => {
    expect(chatAlert({ waiting: true, running: true, unread: true })).toBe(
      "waiting"
    );
    expect(chatAlert({ waiting: true, running: true, unread: false })).toBe(
      "waiting"
    );
  });

  it("ranks responding above unread", () => {
    expect(chatAlert({ waiting: false, running: true, unread: true })).toBe(
      "running"
    );
  });
});

describe("alertCount", () => {
  const chats = [
    { id: "a", mode: "agent" },
    { id: "b", mode: "agent" },
    { id: "c", mode: "chat" },
    { id: "d", mode: "agent" },
  ];

  it("counts unread chats of that mode only", () => {
    const n = alertCount(chats, "agent", {
      waitingId: null,
      unread: new Set(["a", "d", "c"]),
    });
    expect(n).toBe(2);
    expect(
      alertCount(chats, "chat", { waitingId: null, unread: new Set(["c"]) })
    ).toBe(1);
  });

  it("counts the chat waiting for approval", () => {
    expect(
      alertCount(chats, "agent", { waitingId: "b", unread: new Set() })
    ).toBe(1);
  });

  it("does not count the same chat twice", () => {
    expect(
      alertCount(chats, "agent", { waitingId: "a", unread: new Set(["a"]) })
    ).toBe(1);
  });

  it("does not count chats that are only responding", () => {
    expect(
      alertCount(chats, "agent", { waitingId: null, unread: new Set() })
    ).toBe(0);
  });

  it("returns zero, not undefined, for a mode with no chats", () => {
    expect(
      alertCount([], "agent", { waitingId: null, unread: new Set(["a"]) })
    ).toBe(0);
  });
});
