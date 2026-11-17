import { describe, it, expect } from "vitest";
import { EN_US } from "../src/i18n/en-us";
import { mark, tr, uiLocale } from "../src/i18n/tr";

describe("English dictionary", () => {
  it("keeps main sections and typed functions", () => {
    expect(typeof EN_US.agent).toBe("object");
    expect(typeof EN_US.vault).toBe("object");
    expect(typeof EN_US.ai.err.noKey).toBe("function");
    expect(EN_US.ai.err.noKey("OpenAI")).toContain("OpenAI");
  });

  it("interpolates variables in tr() and preserves mark()", () => {
    expect(tr("{n} chats", { n: 3 })).toBe("3 chats");
    expect(mark("All time")).toBe("All time");
    expect(uiLocale()).toBe("en-US");
  });
});
