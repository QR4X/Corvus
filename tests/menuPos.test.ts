import { describe, it, expect } from "vitest";
import { pickSide, popoverPosition, type Box } from "../src/ui/menu";

const box = (
  left: number,
  top: number,
  width: number,
  height: number
): Box => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

const ROOT = box(0, 0, 400, 770);
const SCREEN = { width: 400, height: 900 };
const POPOVER = { width: 160, height: 273 };

describe("popoverPosition", () => {
  it("opens below the button when it fits", () => {
    const r = popoverPosition({
      anchor: { left: 360, right: 390, top: 100, bottom: 130 },
      root: ROOT,
      viewport: SCREEN,
      popover: POPOVER,
    });
    expect(r.y).toBe(136);
    expect(r.origin).toBe("top right");
  });

  it("aligns with the right edge of the button", () => {
    const r = popoverPosition({
      anchor: { left: 360, right: 390, top: 100, bottom: 130 },
      root: ROOT,
      viewport: SCREEN,
      popover: POPOVER,
    });
    expect(r.x).toBe(390 - 160);
  });

  it("opens upward when it does not fit below", () => {
    const r = popoverPosition({
      anchor: { left: 360, right: 390, top: 800, bottom: 830 },
      root: ROOT,
      viewport: SCREEN,
      popover: POPOVER,
    });
    expect(r.y + POPOVER.height).toBeLessThanOrEqual(SCREEN.height);
    expect(r.origin).toBe("bottom right");
  });

  it("stays on screen for a button below the root", () => {
    const r = popoverPosition({
      anchor: { left: 360, right: 390, top: 845, bottom: 873 },
      root: ROOT,
      viewport: SCREEN,
      popover: POPOVER,
    });
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.y + POPOVER.height).toBeLessThanOrEqual(SCREEN.height);
  });

  it("never passes the bottom of the screen at any button height", () => {
    for (let t = 0; t <= 880; t += 20) {
      const r = popoverPosition({
        anchor: { left: 360, right: 390, top: t, bottom: t + 28 },
        root: ROOT,
        viewport: SCREEN,
        popover: POPOVER,
      });
      expect(r.y, `button at ${t}`).toBeGreaterThanOrEqual(0);
      expect(r.y + POPOVER.height, `button at ${t}`).toBeLessThanOrEqual(
        SCREEN.height
      );
    }
  });

  it("pins a popover taller than the screen to the top", () => {
    const r = popoverPosition({
      anchor: { left: 360, right: 390, top: 400, bottom: 430 },
      root: ROOT,
      viewport: { width: 400, height: 200 },
      popover: { width: 160, height: 500 },
    });
    expect(r.y).toBe(10);
  });

  it("keeps a margin from the left edge for a narrow button on the left", () => {
    const r = popoverPosition({
      anchor: { left: 0, right: 30, top: 100, bottom: 130 },
      root: ROOT,
      viewport: SCREEN,
      popover: POPOVER,
    });
    expect(r.x).toBe(10);
  });

  it("keeps the usual position when the root fits on screen", () => {
    const root = box(0, 0, 400, 600);
    const r = popoverPosition({
      anchor: { left: 360, right: 390, top: 100, bottom: 130 },
      root,
      viewport: { width: 400, height: 600 },
      popover: POPOVER,
    });
    expect(r).toEqual({ x: 230, y: 136, origin: "top right" });
  });
});

describe("pickSide", () => {
  const HEIGHT = 900;

  it("opens down with a cap at the screen bottom when it fits below", () => {
    expect(pickSide({ anchor: { top: 300, bottom: 344 }, viewportHeight: HEIGHT, popoverHeight: 200 })).toEqual({
      direction: "down",
      maxHeight: 546,
    });
  });

  it("opens down when it fits below even with more room above", () => {
    const r = pickSide({ anchor: { top: 600, bottom: 644 }, viewportHeight: HEIGHT, popoverHeight: 200 });
    expect(r.direction).toBe("down");
  });

  it("opens up with a cap at the screen top when there is more room above", () => {
    const r = pickSide({ anchor: { top: 700, bottom: 744 }, viewportHeight: HEIGHT, popoverHeight: 494 });
    expect(r).toEqual({ direction: "up", maxHeight: 690 });
  });

  it("picks the larger side and scrolls when it fits nowhere", () => {
    const r = pickSide({ anchor: { top: 430, bottom: 474 }, viewportHeight: HEIGHT, popoverHeight: 2000 });
    expect(r).toEqual({ direction: "up", maxHeight: 420 });
  });

  it("never caps above the available space with fractional pixels", () => {
    const r = pickSide({ anchor: { top: 798.6, bottom: 842.6 }, viewportHeight: HEIGHT, popoverHeight: 485 });
    expect(r.direction).toBe("up");
    expect(r.maxHeight).toBe(788);
  });
});
