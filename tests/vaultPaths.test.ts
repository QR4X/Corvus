import { describe, it, expect } from "vitest";

import {
  CORVUS_HIDDEN,
  CHATS_FOLDER,
  HIDDEN_MOVES,
  legacyModeMoves,
  shouldMigrate,
} from "../src/core/vaultPaths";

const isHidden = (path: string) => path.split("/").some((part) => part.startsWith("."));

describe("migration targets", () => {
  it("moves chats to a visible folder and the index to a hidden one", () => {
    const chats = HIDDEN_MOVES.filter((m) => m.field === "chatsPath");
    const index = HIDDEN_MOVES.filter((m) => m.field === "ragIndexPath");
    expect(chats.length).toBeGreaterThan(0);
    expect(index.length).toBeGreaterThan(0);
    for (const m of chats) {
      expect(m.target).toBe(CHATS_FOLDER);
      expect(isHidden(m.target)).toBe(false);
    }
    for (const m of index) {
      expect(m.target.startsWith(`${CORVUS_HIDDEN}/`)).toBe(true);
      expect(isHidden(m.target)).toBe(true);
    }
  });

  it("migrates legacy corvus-ai folders and the hidden .corvus/chats default, but not skills or generated files", () => {
    const legacyPaths = HIDDEN_MOVES.map((m) => m.legacy);
    expect(legacyPaths).toContain("corvus-ai/chats");
    expect(legacyPaths).toContain(`${CORVUS_HIDDEN}/chats`);
    expect(legacyPaths).toContain("corvus-ai/index");
    expect(legacyPaths).not.toContain("corvus-ai/skills");
    expect(legacyPaths).not.toContain("corvus-ai/generation");
    expect(legacyPaths).not.toContain("corvus-ai/reports");
  });
});

describe("legacyModeMoves", () => {
  it("moves mode folders at the app root into corvus/chats", () => {
    const moves = legacyModeMoves("corvus", "corvus/chats", ["chat", "vault-qa", "agent"]);
    expect(moves).toContainEqual({ from: "corvus/agent", to: "corvus/chats/agent" });
    expect(moves).toContainEqual({ from: "corvus/chat", to: "corvus/chats/chat" });
    expect(moves).toContainEqual({ from: "corvus/vault-qa", to: "corvus/chats/vault-qa" });
  });

  it("returns no moves when the root is already the chats folder", () => {
    expect(legacyModeMoves("corvus/chats", "corvus/chats", ["chat"])).toEqual([]);
  });
});

describe("shouldMigrate", () => {
  const base = {
    currentPath: "corvus-ai/chats",
    legacy: "corvus-ai/chats",
    target: ".corvus/chats",
    sourceExists: true,
    targetExists: false,
  };

  it("moves an old default path with files to a free target", () => {
    expect(shouldMigrate(base)).toBe(true);
  });

  it("leaves a user-chosen path alone", () => {
    expect(
      shouldMigrate({ ...base, currentPath: "Archive/my-chats" })
    ).toBe(false);
  });

  it("does nothing on a fresh install already on the new path", () => {
    expect(shouldMigrate({ ...base, currentPath: ".corvus/chats" })).toBe(false);
  });

  it("does nothing when the source does not exist", () => {
    expect(shouldMigrate({ ...base, sourceExists: false })).toBe(false);
  });

  it("does not overwrite an existing target", () => {
    expect(shouldMigrate({ ...base, targetExists: true })).toBe(false);
  });

  it("any single blocking condition prevents the move", () => {
    expect(
      shouldMigrate({ ...base, sourceExists: false, targetExists: true })
    ).toBe(false);
  });
});
