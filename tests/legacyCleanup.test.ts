import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CAMPOS_MORTOS, limparCamposMortos } from "../src/core/legacySettings";

describe("faxina dos campos que nada lia", () => {
  it("saem das settings em memória (a próxima gravação já vai sem)", () => {
    const s: Record<string, unknown> = {
      roleModels: { chat: {} },
      modelProvider: {},
      uiFontFamily: "Arial",
      uiFontSize: "20",
      language: "en-us",
    };
    limparCamposMortos(s);
    expect(s).toEqual({ language: "en-us" });
    expect([...CAMPOS_MORTOS]).toEqual([
      "roleModels",
      "modelProvider",
      "uiFontFamily",
      "uiFontSize",
    ]);
  });

  it("nem o tipo nem o padrão de fábrica têm mais esses campos", () => {
    const main = readFileSync(resolve(__dirname, "../src/main.ts"), "utf8");
    expect(main).not.toMatch(/\broleModels\s*[:=]/);
    expect(main).not.toMatch(/\bmodelProvider\s*[:=]/);
    expect(main).not.toContain("roleModel(");
  });
});
