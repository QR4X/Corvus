import { describe, it, expect } from "vitest";
import {
  DEFAULT_EFFORT_CONFIGS,
  EFFORT_LEVELS,
  describeEffort,
} from "../src/core/effort";
import {
  EFFORT_FIELDS,
  withField,
  isLevelEdited,
  stopsWith,
  levelSummary,
} from "../src/ui/settings/effortEditor";

const field = (key: string) => EFFORT_FIELDS.find((c) => c.key === key)!;

const inRange = (v: number, c: (typeof EFFORT_FIELDS)[number]) =>
  v >= (c.min ?? -Infinity) && v <= (c.max ?? Infinity);

describe("the level editor sliders", () => {
  it("every factory default is a slider stop, so it lands exactly without rounding", () => {
    for (const l of EFFORT_LEVELS) {
      for (const c of EFFORT_FIELDS.filter((x) => x.kind === "number")) {
        expect(c.stops, `${l}.${c.key}`).toContain(DEFAULT_EFFORT_CONFIGS[l][c.key]);
      }
    }
  });

  it("every stop fits the field range and none repeats", () => {
    for (const c of EFFORT_FIELDS.filter((x) => x.kind === "number")) {
      for (const p of c.stops!) expect(inRange(p, c), `${c.key} ${p}`).toBe(true);
      expect(new Set(c.stops).size, c.key).toBe(c.stops!.length);
    }
  });

  it("special values sit at the slider ends and have names", () => {
    const tokens = field("maxTokens");
    expect(tokens.stops!.at(-1)).toBe(0);
    expect(tokens.format!(0)).toBe("No cap");
    expect(tokens.format!(2048)).toBe("2k tokens");
    expect(field("agentMaxTurns")).toBeUndefined();
    const temp = field("temperature");
    expect(temp.stops![0]).toBe(-1);
    expect(temp.format!(-1)).toBe("Provider default");
    expect(temp.stops).toContain(0.7);
    expect(field("loopDetectionWindow").format!(0)).toBe("Off");
    expect(field("toolRetryOnError").format!(0)).toBe("None");
    expect(field("vaultExcerptChars").format!(1200)).toBe("1,200 chars");
  });

  it("a legacy value outside the stops gets its own stop in the right place", () => {
    const tokens = field("maxTokens");
    const with900 = stopsWith(tokens, 900);
    expect(with900.slice(1, 4)).toEqual([512, 900, 1000]);
    expect(with900.at(-1)).toBe(0);
    expect(stopsWith(tokens, 250000).slice(-2)).toEqual([250000, 0]);
    expect(stopsWith(field("temperature"), 0.25).slice(3, 6)).toEqual([0.2, 0.25, 0.3]);

    expect(stopsWith(tokens, 512)).toBe(tokens.stops);
  });

  it("each setting's info text is a full sentence that stands on its own", () => {
    for (const c of EFFORT_FIELDS) {
      expect(c.desc.length, c.key).toBeGreaterThan(60);
      expect(c.desc, c.key).toMatch(/\.$/);

      expect(c.desc, c.key).not.toMatch(/\bthose notes\b/);
    }
  });

  it("each setting has its own icon and none repeats", () => {
    const icons = EFFORT_FIELDS.map((c) => c.icon);
    for (const c of EFFORT_FIELDS) expect(c.icon, c.key).toMatch(/^[a-z0-9-]+$/);
    expect(new Set(icons).size).toBe(icons.length);

    expect(icons).not.toContain("rotate-ccw");
  });

  it("the context share only shows with an uncapped reply, right below it", () => {
    const reserve = field("contextReservePercent");
    expect(reserve.when!({ ...DEFAULT_EFFORT_CONFIGS.max })).toBe(true);
    expect(reserve.when!({ ...DEFAULT_EFFORT_CONFIGS.low })).toBe(false);
    const order = EFFORT_FIELDS.map((c) => c.key);
    expect(order.indexOf("contextReservePercent")).toBe(order.indexOf("maxTokens") + 1);
  });
});

describe("effort per level", () => {
  it("legacy turn overrides do not count as edits and do not come back when editing", () => {
    const old = { low: { agentMaxTurns: 5, maxTokens: 900 } };
    const onlyOld = { low: { agentMaxTurns: 5, maxTokens: undefined } };
    expect(isLevelEdited(onlyOld, "low")).toBe(false);
    expect(withField(old, "low", "maxTokens", 1000)).toEqual({ low: { maxTokens: 1000 } });
    expect(describeEffort("low", old)).toBe("Fast and economical (≤900 tok)");
  });
  it("factory descriptions stay exactly as before", () => {
    expect(EFFORT_LEVELS.map((l) => describeEffort(l))).toEqual([
      "Fast and economical (≤512 tok)",
      "Balanced (≤2k tok)",
      "Detailed (≤6k tok)",
      "Deep (≤16k tok)",
      "Relentless (up to 80% of context)",
    ]);
  });

  it("an edited level shows the effective number in the composer description", () => {
    expect(describeEffort("med", { med: { maxTokens: 3000 } })).toBe(
      "Balanced (≤3k tok)"
    );
    expect(describeEffort("max", { max: { contextReservePercent: 60 } })).toContain(
      "up to 60% of context"
    );
  });

  it("the editor covers exactly the nine settings", () => {
    const keys = EFFORT_FIELDS.map((c) => c.key).sort();
    expect(keys).toEqual(Object.keys(DEFAULT_EFFORT_CONFIGS.med).sort());

    for (const l of EFFORT_LEVELS) {
      for (const c of EFFORT_FIELDS.filter((x) => x.kind === "number")) {
        const v = DEFAULT_EFFORT_CONFIGS[l][c.key] as number;
        expect(inRange(v, c), `${l}.${c.key}`).toBe(true);
      }
    }
  });

  it("saving the factory value or empty removes the key; an empty level disappears", () => {
    let o = withField({}, "low", "maxTokens", 900);
    expect(o).toEqual({ low: { maxTokens: 900 } });
    o = withField(o, "low", "temperature", 0.1);
    expect(o.low).toEqual({ maxTokens: 900, temperature: 0.1 });
    o = withField(o, "low", "maxTokens", DEFAULT_EFFORT_CONFIGS.low.maxTokens);
    expect(o.low).toEqual({ temperature: 0.1 });
    o = withField(o, "low", "temperature", undefined);
    expect(o).toEqual({});
    expect(isLevelEdited(o, "low")).toBe(false);
  });

  it("a toggle equal to the factory value is not saved either", () => {
    const o = withField({}, "high", "parallelToolCalls", false);
    expect(o).toEqual({ high: { parallelToolCalls: false } });
    expect(withField(o, "high", "parallelToolCalls", true)).toEqual({});
  });

  it("the level row summarizes the current numbers", () => {
    expect(levelSummary({}, "med")).toBe("≤2k tok · temperature 0.7 · 5 notes");
    expect(levelSummary({ med: { temperature: -1 } }, "med")).toContain("provider temperature");
  });
});
