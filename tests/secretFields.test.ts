import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS, SECRET_FIELDS } from "../src/settings";

describe("secret fields", () => {
  it("every *ApiKey setting is stored in the keychain, never in data.json", () => {
    const apiKeys = Object.keys(DEFAULT_SETTINGS).filter((k) => k.endsWith("ApiKey"));
    expect(apiKeys).toEqual(expect.arrayContaining(["openaiApiKey", "elevenApiKey"]));
    const plain = apiKeys.filter((k) => !(SECRET_FIELDS as readonly string[]).includes(k));
    expect(plain).toEqual([]);
  });
});
