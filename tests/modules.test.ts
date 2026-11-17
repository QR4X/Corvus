import { describe, it, expect } from "vitest";
import {
  MODULES,
  MODULE_LIST,
  SEGMENT_ALL,
  chatsOfModule,
  defaultSegment,
  filterSegment,
  moduleSegments,
  moduleHint,
  moduleIcon,
  moduleEmptyLine,
  moduleFabLabel,
  moduleLabel,
  modulePlaceholder,
  modulesInUse,
  moduleStats,
  relativeDay,
  relativeShort,
  searchChats,
  startupMode,
  startupOpensPanel,
} from "../src/ui/modules";
import { CHAT_MODES } from "../src/core/session";
import type { ChatSummary } from "../src/core/chatPersistence";

const chat = (over: Partial<ChatSummary>): ChatSummary =>
  ({
    id: "x",
    title: "t",
    date: "2026-09-10T10:00:00.000Z",
    mode: "chat",
    provider: "openai",
    model: "gpt-5",
    effort: "medium",
    tokensIn: 0,
    tokensOut: 0,
    messageCount: 2,
    toolCount: 0,
    filePath: "corvus-ai/chats/chat/x.md",
    starred: false,
    ...over,
  }) as ChatSummary;

describe("MODULES", () => {
  it("describes every engine mode with a label, icon and copy", () => {
    for (const m of CHAT_MODES) {
      expect(MODULES[m]).toBeTruthy();
      expect(MODULES[m].label.length).toBeGreaterThan(0);
      expect(MODULES[m].icon.length).toBeGreaterThan(0);
      expect(MODULES[m].placeholder.length).toBeGreaterThan(0);
      expect(MODULES[m].emptyLine.length).toBeGreaterThan(0);
    }
    expect(MODULE_LIST.map((m) => m.id)).toEqual(CHAT_MODES);
  });

  it("never returns the raw id for a known mode", () => {
    expect(moduleLabel("vault-qa")).toBe("Vault Q&A");
    expect(moduleLabel("agent")).toBe("Agent");
  });

  it("shows the id of an unknown mode instead of hiding it", () => {
    expect(moduleLabel("survey")).toBe("survey");
    expect(moduleIcon("survey")).toBe("message-square");
    expect(modulePlaceholder("survey")).toBe(MODULES.chat.placeholder);
  });

  it("gives each module its own empty-state line", () => {
    const lines = CHAT_MODES.map((m) => MODULES[m].emptyLine);
    expect(new Set(lines).size).toBe(CHAT_MODES.length);
    expect(moduleEmptyLine("agent")).toBe(MODULES.agent.emptyLine);
  });

  it("explains why an unknown module cannot start chats", () => {
    const line = moduleEmptyLine("research");
    expect(line).not.toBe(MODULES.chat.emptyLine);
    expect(line).toMatch(/can't start new ones/i);
  });

  it("modulesInUse lists a module that only exists on disk", () => {
    const seen = modulesInUse([
      chat({ mode: "chat" }),
      chat({ mode: "research" }),
      chat({ mode: "research" }),
    ]).map((m) => m.id);
    expect(seen).toEqual([...CHAT_MODES, "research"]);
  });

  it("lists only engine modes when no chat uses an unknown one", () => {
    expect(modulesInUse([chat({ mode: "agent" })]).map((m) => m.id)).toEqual([
      ...CHAT_MODES,
    ]);
    expect(modulesInUse([]).map((m) => m.id)).toEqual([...CHAT_MODES]);
  });

  it("falls back to Chat for empty and null modes", () => {
    expect(moduleLabel("")).toBe("Chat");
    expect(moduleLabel(undefined)).toBe("Chat");
    expect(moduleLabel(null)).toBe("Chat");
  });
});

describe("chatsOfModule", () => {
  const all = [
    chat({ id: "a", mode: "chat" }),
    chat({ id: "b", mode: "agent" }),
    chat({ id: "c", mode: "vault-qa" }),
    chat({ id: "d", mode: "agent" }),
  ];

  it("filters by module preserving the input order", () => {
    expect(chatsOfModule(all, "agent").map((c) => c.id)).toEqual(["b", "d"]);
    expect(chatsOfModule(all, "chat").map((c) => c.id)).toEqual(["a"]);
  });

  it("returns an empty list for a module without chats", () => {
    expect(chatsOfModule(all, "survey")).toEqual([]);
    expect(chatsOfModule([], "chat")).toEqual([]);
  });
});

describe("moduleStats", () => {
  it("counts chats and finds the latest even when unsorted", () => {
    const st = moduleStats(
      [
        chat({ mode: "agent", date: "2026-09-01T00:00:00.000Z" }),
        chat({ mode: "agent", date: "2026-09-09T00:00:00.000Z" }),
        chat({ mode: "agent", date: "2026-09-05T00:00:00.000Z" }),
        chat({ mode: "chat", date: "2026-09-30T00:00:00.000Z" }),
      ],
      "agent"
    );
    expect(st.count).toBe(3);
    expect(st.last).toBe("2026-09-09T00:00:00.000Z");
  });

  it("does not invent a date without chats", () => {
    expect(moduleStats([], "chat")).toEqual({ count: 0 });
  });
});

describe("relativeDay", () => {
  const local = (y: number, m: number, d: number, h = 10, min = 0) =>
    new Date(y, m - 1, d, h, min).toISOString();
  const at = (y: number, m: number, d: number, h = 10, min = 0) =>
    new Date(y, m - 1, d, h, min).getTime();
  const now = at(2026, 9, 15, 9);

  it("labels today, yesterday and recent days", () => {
    expect(relativeDay(local(2026, 9, 15, 1), now)).toBe("Today");
    expect(relativeDay(local(2026, 9, 14, 23, 50), now)).toBe("Yesterday");
    expect(relativeDay(local(2026, 9, 12), now)).toBe("3 days ago");
  });

  it("counts calendar days, not 24-hour spans", () => {
    const halfPastMidnight = at(2026, 9, 15, 0, 30);
    expect(relativeDay(local(2026, 9, 14, 23, 50), halfPastMidnight)).toBe(
      "Yesterday"
    );
  });

  it("shows the date from one week on", () => {
    expect(relativeDay(local(2026, 9, 8), now)).toBe(
      local(2026, 9, 8).slice(0, 10)
    );
  });

  it("does not show negative days for a future date", () => {
    expect(relativeDay(local(2026, 9, 20), now)).toBe("Today");
  });

  it("returns empty instead of Invalid Date for a broken date", () => {
    expect(relativeDay("not a date", now)).toBe("");
  });
});

describe("searchChats", () => {
  const list = [
    chat({ id: "a", title: "Rewrite the plugin README", model: "gpt-5" }),
    chat({ id: "b", title: "Draft the changelog", model: "claude-sonnet-4-6" }),
    chat({ id: "c", title: "Clean up the inbox", model: "gemini-2.5-flash" }),
    chat({ id: "d", title: "", model: "gpt-4o" }),
  ];
  const ids = (q: string) => searchChats(list, q).hits.map((c) => c.id);

  it("returns everything for an empty query without flagging regex", () => {
    const r = searchChats(list, "   ");
    expect(r.hits).toHaveLength(4);
    expect(r.regex).toBe(false);
    expect(r.invalid).toBe(false);
  });

  it("matches a plain word, which is also a valid regex", () => {
    expect(ids("readme")).toEqual(["a"]);
    expect(ids("INBOX")).toEqual(["c"]);
  });

  it("supports anchors, alternation and classes", () => {
    expect(ids("^Draft")).toEqual(["b"]);
    expect(ids("readme|inbox")).toEqual(["a", "c"]);
    expect(ids("chang[e]log")).toEqual(["b"]);
  });

  it("also searches the model shown on the card", () => {
    expect(ids("gemini")).toEqual(["c"]);
    expect(ids("^gpt-5$")).toEqual([]);
    expect(ids("gpt-")).toEqual(["a", "d"]);
  });

  it("finds an untitled chat by the Untitled label", () => {
    expect(ids("untitled")).toEqual(["d"]);
  });

  it("falls back to a literal search and flags an invalid regex", () => {
    const r = searchChats(list, "Draft (");
    expect(r.invalid).toBe(true);
    expect(r.regex).toBe(false);
    expect(r.hits).toEqual([]);
    const r2 = searchChats(list, "README (");
    expect(r2.invalid).toBe(true);
    expect(r2.hits).toEqual([]);
  });

  it("matches raw text literally when the regex does not compile", () => {
    const withParens = [chat({ id: "z", title: "Fix the (weird) title" })];
    const r = searchChats(withParens, "(weird");
    expect(r.invalid).toBe(true);
    expect(r.hits.map((c) => c.id)).toEqual(["z"]);
  });
});

describe("relativeShort", () => {
  const now = new Date(2026, 8, 15, 12, 0).getTime();
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it("formats minutes, hours and days", () => {
    expect(relativeShort(ago(53 * 60000), now)).toBe("53m");
    expect(relativeShort(ago(10 * 3600000), now)).toBe("10h");
    expect(relativeShort(ago(3 * 86400000), now)).toBe("3d");
  });

  it("shows now instead of 0m", () => {
    expect(relativeShort(ago(5000), now)).toBe("now");
  });

  it("does not skip a unit at boundaries", () => {
    expect(relativeShort(ago(59 * 60000), now)).toBe("59m");
    expect(relativeShort(ago(60 * 60000), now)).toBe("1h");
    expect(relativeShort(ago(23 * 3600000), now)).toBe("23h");
    expect(relativeShort(ago(24 * 3600000), now)).toBe("1d");
  });

  it("shows the date after a month", () => {
    const old = ago(60 * 86400000);
    expect(relativeShort(old, now)).toBe(old.slice(0, 10));
  });

  it("shows now for a future date from a skewed clock", () => {
    expect(relativeShort(ago(-90 * 60000), now)).toBe("now");
  });

  it("returns empty for a broken date", () => {
    expect(relativeShort("not a date", now)).toBe("");
  });
});

describe("moduleFabLabel", () => {
  it("labels the agent button as a session and others as chats", () => {
    expect(moduleFabLabel("agent")).toBe("New session");
    expect(moduleFabLabel("chat")).toBe("New chat");
    expect(moduleFabLabel("vault-qa")).toBe("New question");
  });
});

describe("moduleHint", () => {
  const local = (y: number, m: number, d: number, h = 10) =>
    new Date(y, m - 1, d, h).toISOString();
  const now = new Date(2026, 8, 15, 9).getTime();

  it("handles singular and plural", () => {
    expect(moduleHint({ count: 1, last: local(2026, 9, 15, 8) }, now)).toBe(
      "1 chat · Today"
    );
    expect(moduleHint({ count: 4, last: local(2026, 9, 14, 8) }, now)).toBe(
      "4 chats · Yesterday"
    );
  });

  it("invites instead of showing zero for an empty module", () => {
    expect(moduleHint({ count: 0 }, now)).toBe("No chats yet");
  });

  it("shows only the count without a usable date", () => {
    expect(moduleHint({ count: 2, last: "broken" }, now)).toBe("2 chats");
  });
});

describe("moduleSegments", () => {
  const used = [
    chat({ id: "a", mode: "chat" }),
    chat({ id: "b", mode: "chat" }),
    chat({ id: "c", mode: "agent" }),
  ];

  it("has no all-in-one tab", () => {
    const ids = moduleSegments(used).map((s) => s.id);
    expect(ids).not.toContain(SEGMENT_ALL);
    expect(ids).toEqual(["chat", "agent"]);
  });

  it("counts the chats of each tab", () => {
    const segs = moduleSegments(used);
    expect(segs.find((s) => s.id === "chat")?.count).toBe(2);
    expect(segs.find((s) => s.id === "agent")?.count).toBe(1);
  });

  it("skips modules without chats", () => {
    expect(moduleSegments(used).map((s) => s.id)).not.toContain("vault-qa");
  });

  it("uses the short label for tabs", () => {
    const segs = moduleSegments([chat({ mode: "vault-qa" })]);
    expect(segs.map((s) => s.label)).toEqual(["Vault"]);
  });

  it("adds a tab for a mode that only exists on disk", () => {
    const segs = moduleSegments([...used, chat({ id: "d", mode: "research" })]);
    expect(segs.map((s) => s.id)).toContain("research");
  });

  it("returns no tabs without chats", () => {
    expect(moduleSegments([])).toEqual([]);
  });
});

describe("filterSegment", () => {
  const used = [
    chat({ id: "a", mode: "chat" }),
    chat({ id: "c", mode: "agent" }),
  ];

  it("returns everything in order for the all sentinel", () => {
    expect(filterSegment(used, SEGMENT_ALL).map((c) => c.id)).toEqual([
      "a",
      "c",
    ]);
  });

  it("returns only the chats of the tab module", () => {
    expect(filterSegment(used, "agent").map((c) => c.id)).toEqual(["c"]);
  });

  it("returns a new array", () => {
    expect(filterSegment(used, SEGMENT_ALL)).not.toBe(used);
  });
});

describe("defaultSegment", () => {
  it("opens on the mode of the most recent chat", () => {
    const chats = [
      chat({ id: "a", mode: "chat", date: "2026-09-10T10:00:00.000Z" }),
      chat({ id: "b", mode: "agent", date: "2026-09-12T10:00:00.000Z" }),
      chat({ id: "c", mode: "vault-qa", date: "2026-09-11T10:00:00.000Z" }),
    ];
    expect(defaultSegment(chats, "chat")).toBe("agent");
  });

  it("does not rely on list order", () => {
    const chats = [
      chat({ id: "a", mode: "chat", date: "2026-09-01T10:00:00.000Z" }),
      chat({ id: "b", mode: "agent", date: "2026-09-20T10:00:00.000Z" }),
    ];
    expect(defaultSegment(chats, "vault-qa")).toBe("agent");
  });

  it("ignores chats from unknown modules", () => {
    const chats = [
      chat({ id: "a", mode: "vault-qa", date: "2026-09-10T10:00:00.000Z" }),
      chat({ id: "z", mode: "research", date: "2026-09-30T10:00:00.000Z" }),
    ];
    expect(defaultSegment(chats, "chat")).toBe("vault-qa");
  });

  it("uses the settings default without chats", () => {
    expect(defaultSegment([], "agent")).toBe("agent");
  });

  it("falls back to chat for a missing or invalid default", () => {
    expect(defaultSegment([], undefined)).toBe("chat");
    expect(defaultSegment([], "mode-that-does-not-exist")).toBe("chat");
  });
});

describe("startupMode", () => {
  it("returns a mode the engine knows", () => {
    expect(startupMode("agent")).toBe("agent");
    expect(startupMode("chat")).toBe("chat");
    expect(startupMode("vault-qa")).toBe("vault-qa");
  });

  it("returns null for empty, missing or unknown modes", () => {
    expect(startupMode("")).toBeNull();
    expect(startupMode(undefined)).toBeNull();
    expect(startupMode(null)).toBeNull();
    expect(startupMode("survey")).toBeNull();
  });

  it("does not start a chat for the dashboard", () => {
    expect(startupMode("dashboard")).toBeNull();
  });
});

describe("startupOpensPanel", () => {
  it("opens the panel for the dashboard and every chat mode", () => {
    expect(startupOpensPanel("dashboard")).toBe(true);
    expect(startupOpensPanel("chat")).toBe(true);
    expect(startupOpensPanel("vault-qa")).toBe(true);
    expect(startupOpensPanel("agent")).toBe(true);
  });

  it("does not open for empty, missing or unknown values", () => {
    expect(startupOpensPanel("")).toBe(false);
    expect(startupOpensPanel(undefined)).toBe(false);
    expect(startupOpensPanel(null)).toBe(false);
    expect(startupOpensPanel("survey")).toBe(false);
  });
});
