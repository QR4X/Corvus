import { describe, it, expect } from "vitest";
import { CAMPOS_MORTOS, limparCamposMortos } from "../src/core/legacySettings";
import { DEFAULT_SETTINGS } from "../src/settings";

describe("faxina dos campos que nada lia", () => {
  it("saem das settings em memória (a próxima gravação já vai sem)", () => {
    const s: Record<string, unknown> = {
      roleModels: { chat: {} },
      modelProvider: {},
      uiFontFamily: "Arial",
      uiFontSize: "20",
      chatsPath: "corvus/chats",
    };
    limparCamposMortos(s);
    expect(s).toEqual({ chatsPath: "corvus/chats" });
    expect([...CAMPOS_MORTOS]).toEqual([
      "roleModels",
      "modelProvider",
      "uiFontFamily",
      "uiFontSize",
      "language",
    ]);
  });

  it("nem o tipo nem o padrão de fábrica têm mais esses campos", () => {
    for (const key of CAMPOS_MORTOS) expect(DEFAULT_SETTINGS).not.toHaveProperty(key);
  });
});
