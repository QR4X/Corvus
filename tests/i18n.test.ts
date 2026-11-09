import { describe, it, expect } from "vitest";
import { getTranslations, LOCALES, resolveLocale } from "../src/i18n";
import { EN_US } from "../src/i18n/en-us";
import { mark, tr, uiLocale } from "../src/i18n/tr";

describe("i18n — English dictionary", () => {
  it("returns EN_US for all locales", () => {
    expect(getTranslations("en-us")).toBe(EN_US);
    expect(getTranslations("auto")).toBe(EN_US);
    expect(resolveLocale("auto")).toBe("en-us");
    expect(LOCALES.map((l) => l.id)).toEqual(["auto", "en-us"]);
  });

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
