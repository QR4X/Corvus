import { describe, it, expect } from "vitest";
import {
  countModifications,
  nextBeta,
  nextStable,
  verdict,
  PER_BETA,
  PER_RELEASE,
} from "../scripts/batch.mjs";

describe("what counts as a modification", () => {
  it("fix, feat, and perf count — with or without scope", () => {
    expect(
      countModifications([
        "fix(composer): shadow with rounded corners (0.9.20)",
        "feat: new tab",
        "perf(rag): lighter index",
        "feat(ui)!: replace home",
      ]),
    ).toBe(4);
  });

  it("chore, docs, ci, test, refactor, and style do not count", () => {
    expect(
      countModifications([
        "chore(data): weekly hot ranking update",
        "docs(readme): document why streaming uses fetch",
        "ci(release): test builds as pre-release",
        "test: cover batch counter",
        "refactor(ui): extract component",
        "style: prettier",
      ]),
    ).toBe(0);
  });

  it("only the prefix decides — 'fix' in the middle of the message does not count", () => {
    expect(countModifications(["chore: fix: typo in comment", "Merge branch 'main'"])).toBe(0);
  });
});

describe("next version", () => {
  it("stable increments patch", () => {
    expect(nextStable("0.9.19")).toBe("0.9.20");
    expect(nextStable("1.0.9")).toBe("1.0.10");
  });

  it("beta continues the count of the same stable target", () => {
    const tags = ["0.9.19", "0.9.20-beta.1", "0.9.20-beta.2", "0.9.18"];
    expect(nextBeta("0.9.19", tags)).toBe("0.9.20-beta.3");
  });

  it("first beta of a new version is .1", () => {
    expect(nextBeta("0.9.20", ["0.9.20", "0.9.20-beta.4"])).toBe("0.9.21-beta.1");
  });

  it("beta.10 comes after beta.9 (numeric comparison)", () => {
    const tags = Array.from({ length: 10 }, (_, i) => `0.9.20-beta.${i + 1}`);
    expect(nextBeta("0.9.19", tags)).toBe("0.9.20-beta.11");
  });
});

describe("verdict", () => {
  it(`beta every ${PER_BETA}`, () => {
    expect(verdict(2, 2)).toBe("none");
    expect(verdict(3, 3)).toBe("beta");
  });

  it(`release at ${PER_RELEASE} since stable — wins over beta`, () => {
    expect(verdict(9, 0)).toBe("none");
    expect(verdict(10, 3)).toBe("release");
  });
});
