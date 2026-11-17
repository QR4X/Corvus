import { describe, it, expect } from "vitest";
import { compactTokens, freeTag } from "../src/usage/freeTag";

const cfg = (over: Partial<{ free: boolean; dataSharing: boolean; tier: number }> = {}) => ({
  free: false,
  dataSharing: false,
  tier: 1,
  ...over,
});

describe("compactTokens", () => {
  it("shortens without inventing decimals", () => {
    expect(compactTokens(250_000)).toBe("250k");
    expect(compactTokens(2_500_000)).toBe("2.5M");
    expect(compactTokens(1_000_000)).toBe("1M");
    expect(compactTokens(900)).toBe("900");
  });
});

describe("freeTag", () => {
  it("gives no tag to a model with no free offer", () => {
    expect(freeTag("anthropic", "claude-sonnet-5", cfg())).toBeNull();
  });

  it("labels built-in free models as 'free' without a number", () => {
    const t = freeTag("openrouter", "meta/llama-3.3-70b:free", cfg({ free: true }));
    expect(t?.kind).toBe("always");
    expect(t?.label).toBe("free");
    expect(t?.perDay).toBeUndefined();
  });

  it("shows the daily quota when data sharing is on", () => {
    expect(freeTag("openai", "gpt-5", cfg({ dataSharing: true })).label).toBe(
      "250k/day"
    );
    expect(
      freeTag("openai", "gpt-5-mini", cfg({ dataSharing: true })).label
    ).toBe("2.5M/day");
  });

  it("gives tier 3+ a larger quota", () => {
    const t = freeTag("openai", "gpt-5", cfg({ dataSharing: true, tier: 4 }));
    expect(t?.perDay).toBe(1_000_000);
    expect(t?.label).toBe("1M/day");
  });

  it("shows the quota as an offer when data sharing is off", () => {
    const t = freeTag("openai", "gpt-4o", cfg({ dataSharing: false }));
    expect(t?.kind).toBe("offer");
    expect(t?.label).toBe("+250k/day");
    expect(t?.detail).toMatch(/data sharing/i);
  });

  it("gives no quota to OpenAI models outside the eligible list", () => {
    expect(freeTag("openai", "gpt-image-1", cfg({ dataSharing: true }))).toBeNull();
  });

  it("prefers the daily quota over built-in free when both apply", () => {
    const t = freeTag("openai", "gpt-4o-mini", cfg({ free: true, dataSharing: true }));
    expect(t?.kind).toBe("daily");
  });

  it("does not apply the OpenAI program to other providers", () => {
    expect(freeTag("openrouter", "gpt-4o", cfg({ dataSharing: true }))).toBeNull();
  });
});
