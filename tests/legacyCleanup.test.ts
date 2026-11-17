import { describe, it, expect } from "vitest";
import { DEAD_FIELDS, migrateLegacyFields } from "../src/core/legacySettings";
import { DEFAULT_SETTINGS } from "../src/settings";

describe("cleanup of fields nothing reads anymore", () => {
  it("drops dead fields from in-memory settings so the next save omits them", () => {
    const s: Record<string, unknown> = {
      roleModels: { chat: {} },
      modelProvider: {},
      uiFontFamily: "Arial",
      uiFontSize: "20",
      language: "pt-BR",
      chatsPath: "corvus/chats",
    };
    migrateLegacyFields(s);
    expect(s).toEqual({ chatsPath: "corvus/chats" });
  });

  it("keeps dead fields out of the factory defaults", () => {
    for (const key of DEAD_FIELDS) expect(DEFAULT_SETTINGS).not.toHaveProperty(key);
  });
});
