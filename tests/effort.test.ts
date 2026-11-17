import { describe, it, expect } from "vitest";
import {
  resolveEffortConfig,
  effortToMaxTokensSmart,
  effortToVaultLookup,
  isEffortLevel,
  DEFAULT_EFFORT_CONFIGS,
} from "../src/core/effort";

describe("isEffortLevel", () => {
  it("accepts the five valid levels", () => {
    for (const lvl of ["low", "med", "high", "xhigh", "max"]) {
      expect(isEffortLevel(lvl)).toBe(true);
    }
  });
  it("rejects anything else", () => {
    expect(isEffortLevel("ultra")).toBe(false);
    expect(isEffortLevel("")).toBe(false);
  });
});

describe("resolveEffortConfig", () => {
  it("falls back to med for an unknown level", () => {
    expect(resolveEffortConfig("bogus")).toEqual(DEFAULT_EFFORT_CONFIGS.med);
  });

  it("returns the level default without overrides", () => {
    expect(resolveEffortConfig("low")).toEqual(DEFAULT_EFFORT_CONFIGS.low);
  });

  it("merges only the fields present in a partial override", () => {
    const cfg = resolveEffortConfig("low", { low: { maxTokens: 999 } });
    expect(cfg.maxTokens).toBe(999);

    expect(cfg).not.toHaveProperty("agentMaxTurns");
    expect(cfg.vaultTopK).toBe(DEFAULT_EFFORT_CONFIGS.low.vaultTopK);
  });

  it("respects 0 and false overrides instead of falling back to defaults", () => {
    const cfg = resolveEffortConfig("high", {
      high: { temperature: 0, toolRetryOnError: 0, parallelToolCalls: false },
    });
    expect(cfg.temperature).toBe(0);
    expect(cfg.toolRetryOnError).toBe(0);
    expect(cfg.parallelToolCalls).toBe(false);
  });
});

describe("effortToMaxTokensSmart", () => {
  it("fixed-cap levels ignore the context window", () => {
    expect(effortToMaxTokensSmart("low", 200_000)).toBe(512);
    expect(effortToMaxTokensSmart("high", 200_000)).toBe(6000);
  });

  it("max uses about 80% of the context window minus a 1k reserve", () => {
    expect(effortToMaxTokensSmart("max", 200_000)).toBe(159_000);
  });

  it("max never returns less than the 2048 floor", () => {
    expect(effortToMaxTokensSmart("max", 1000)).toBe(2048);
  });

  it("clamps a contextReservePercent override to [10, 95]", () => {
    const v = effortToMaxTokensSmart("max", 100_000, {
      max: { contextReservePercent: 200 },
    });
    expect(v).toBe(94_000);
  });
});

describe("effortToVaultLookup", () => {
  it("reads topK and excerptChars from the level config", () => {
    expect(effortToVaultLookup("low")).toEqual({ topK: 3, excerptChars: 300 });
    expect(effortToVaultLookup("max")).toEqual({ topK: 12, excerptChars: 2000 });
  });
});
