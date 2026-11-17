import { describe, it, expect } from "vitest";
import { FOLLOW_SLACK, decideScroll, shouldShowJump } from "../src/ui/follow";

const VIEW = 600;

const settle = (previousHeight: number, scrollTop: number, currentHeight = previousHeight) =>
  decideScroll({ gesture: false, previousHeight, currentHeight, scrollTop, clientHeight: VIEW });

describe("shouldShowJump", () => {
  it("shows nothing while following, even when streaming", () => {
    expect(shouldShowJump(true, true, false)).toBe(false);
    expect(shouldShowJump(true, false, true)).toBe(false);
  });

  it("offers the way back while away and streaming", () => {
    expect(shouldShowJump(false, true, false)).toBe(true);
  });

  it("signals a finished reply while away", () => {
    expect(shouldShowJump(false, false, true)).toBe(true);
  });

  it("stays quiet while away with nothing new", () => {
    expect(shouldShowJump(false, false, false)).toBe(false);
  });
});

describe("decideScroll without a gesture", () => {
  it("keeps following when new text arrives while at the bottom", () => {
    expect(settle(2000, 1400, 2400)).toEqual({ pin: true, following: true });
  });

  it("does not follow after the user scrolled up to reread", () => {
    expect(settle(2000, 300, 2400)).toEqual({ pin: false, following: false });
  });

  it("counts anything within the slack as the bottom", () => {
    expect(settle(2000, 1400 - FOLLOW_SLACK).following).toBe(true);
    expect(settle(2000, 1400 - FOLLOW_SLACK - 1).following).toBe(false);
  });

  it("treats overscroll past the end as the bottom", () => {
    expect(settle(2000, 1600).following).toBe(true);
  });

  it("does not lock the view on the first measurement", () => {
    expect(settle(0, 0, 2000).following).toBe(false);
    expect(settle(0, 1400, 2000).following).toBe(true);
  });

  it("treats a conversation shorter than the view as the bottom", () => {
    expect(settle(400, 0).following).toBe(true);
  });

  it("resumes following when the finger lifts near the bottom", () => {
    expect(settle(2400, 1760)).toEqual({ pin: true, following: true });
  });

  it("stays put when the finger lifts far away", () => {
    expect(settle(2400, 900)).toEqual({ pin: false, following: false });
  });
});

describe("decideScroll during a gesture", () => {
  const drag = (scrollTop: number) =>
    decideScroll({ gesture: true, previousHeight: 2000, currentHeight: 2400, scrollTop, clientHeight: VIEW });

  it("never pins while the finger is working, even at the bottom", () => {
    expect(drag(1800)).toEqual({ pin: false, following: true });
  });

  it("lets go as soon as a short drag passes the slack", () => {
    expect(drag(1760)).toEqual({ pin: false, following: true });
    expect(drag(1700)).toEqual({ pin: false, following: false });
  });

  it("accumulates small steps instead of snapping back to the bottom", () => {
    let scrollTop = 1400;
    let previousHeight = 2000;
    let currentHeight = 2000;
    for (let i = 0; i < 8; i++) {
      scrollTop -= 35;
      currentHeight += 60;
      const { pin } = decideScroll({ gesture: true, previousHeight, currentHeight, scrollTop, clientHeight: VIEW });
      expect(pin).toBe(false);
      previousHeight = currentHeight;
    }
  });
});
