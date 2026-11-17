import { describe, it, expect } from "vitest";
import { isGeminiBillingError } from "../src/providers/gemini";

describe("isGeminiBillingError", () => {
  it("detects strong billing phrases in any context", () => {
    const cases = [
      "Imagen API is only accessible to billed users at this time.",
      "This model is only available on the paid tier.",
      "Billing account not configured for this project.",
      "FAILED_PRECONDITION: project not allowed.",
      "You must enable a paid tier to use this model.",
      "Free tier does not support image generation.",
    ];
    for (const m of cases) {
      expect(isGeminiBillingError(400, m, "chat")).toBe(true);
      expect(isGeminiBillingError(400, m, "image")).toBe(true);
    }
  });

  it("treats a 429 quota or credit error on image as billing", () => {
    expect(isGeminiBillingError(429, "You exceeded your current quota", "image")).toBe(true);
    expect(isGeminiBillingError(429, "out of credits", "image")).toBe(true);
  });

  it("does not treat a generic 429 quota error on chat as billing", () => {
    expect(isGeminiBillingError(429, "You exceeded your current quota", "chat")).toBe(false);
  });

  it("ignores unrelated errors", () => {
    expect(isGeminiBillingError(400, "Invalid argument: contents is required", "image")).toBe(false);
    expect(isGeminiBillingError(404, "model not found", "chat")).toBe(false);
    expect(isGeminiBillingError(500, "internal error", "image")).toBe(false);
    expect(isGeminiBillingError(429, "", "chat")).toBe(false);
  });

  it("is case-insensitive and tolerates empty or missing messages", () => {
    expect(isGeminiBillingError(400, "PAID TIER required", "chat")).toBe(true);
    expect(isGeminiBillingError(400, "", "chat")).toBe(false);

    expect(isGeminiBillingError(400, undefined, "chat")).toBe(false);
  });
});
