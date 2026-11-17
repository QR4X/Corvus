import { describe, it, expect } from "vitest";
import {
  getContextWindow,
} from "../src/core/contextWindows";

describe("getContextWindow", () => {
  it("matches known models exactly", () => {
    expect(getContextWindow("gpt-4o")).toBe(128_000);
    expect(getContextWindow("claude-opus-4-8")).toBe(200_000);
    expect(getContextWindow("gpt-5")).toBe(256_000);
  });

  it("matches dated versions by prefix", () => {
    expect(getContextWindow("gpt-4o-2024-08-06")).toBe(128_000);
    expect(getContextWindow("claude-opus-4-8-20260101")).toBe(200_000);
  });

  it("falls back to 128k for unknown models", () => {
    expect(getContextWindow("random-model-xyz")).toBe(128_000);
    expect(getContextWindow("")).toBe(128_000);
  });
});
