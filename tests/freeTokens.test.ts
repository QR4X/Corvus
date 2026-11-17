import { describe, it, expect } from "vitest";
import {
  openaiFreeAllowance,
  openaiFreeTierForModel,
} from "../src/usage/freeTokens";

describe("openaiFreeAllowance", () => {
  it("tier 1 with data sharing gets 250k big and 2.5M mini tokens, without images", () => {
    const a = openaiFreeAllowance(1, true);
    expect(a.eligible).toBe(true);
    expect(a.bigPerDay).toBe(250_000);
    expect(a.miniPerDay).toBe(2_500_000);
    expect(a.imageEligible).toBe(false);
  });

  it("tier 3 and up with data sharing gets 1M big and 10M mini tokens", () => {
    const a = openaiFreeAllowance(3, true);
    expect(a.bigPerDay).toBe(1_000_000);
    expect(a.miniPerDay).toBe(10_000_000);
    expect(a.imageEligible).toBe(false);
  });

  it("is not eligible without data sharing or below tier 1", () => {
    expect(openaiFreeAllowance(1, false).eligible).toBe(false);
    expect(openaiFreeAllowance(0, true).eligible).toBe(false);
    expect(openaiFreeAllowance(1, false).bigPerDay).toBe(0);
  });
});

describe("openaiFreeTierForModel", () => {
  it("classifies mini before big when prefixes overlap", () => {
    expect(openaiFreeTierForModel("gpt-4o-mini")).toBe("mini");
    expect(openaiFreeTierForModel("gpt-4o")).toBe("big");
    expect(openaiFreeTierForModel("gpt-5-nano")).toBe("mini");
    expect(openaiFreeTierForModel("gpt-5")).toBe("big");
    expect(openaiFreeTierForModel("o3-mini")).toBe("mini");
    expect(openaiFreeTierForModel("o3")).toBe("big");
  });

  it("returns null for image models", () => {
    expect(openaiFreeTierForModel("dall-e-3")).toBeNull();
    expect(openaiFreeTierForModel("gpt-image-1")).toBeNull();
  });
});
