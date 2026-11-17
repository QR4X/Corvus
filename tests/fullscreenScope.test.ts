import { describe, it, expect } from "vitest";

import { fullscreenOn, isChatScreen, isDrawerOnScreen, isRightDrawer } from "../src/ui/fullscreenScope";

const drawerEl = (...classes: string[]) =>
  ({ classList: { contains: (c: string) => classes.includes(c) } }) as Element;

const rect = (left: number, width: number, height = 800) => ({
  left,
  width,
  height,
  right: left + width,
});

describe("isRightDrawer", () => {
  it("accepts the right drawer", () => {
    expect(isRightDrawer(drawerEl("workspace-drawer", "mod-right"))).toBe(true);
  });

  it("never accepts the left drawer", () => {
    expect(isRightDrawer(drawerEl("workspace-drawer", "mod-left"))).toBe(false);
  });

  it("accepts a drawer without a side class, since Corvus only mounts on the right", () => {
    expect(isRightDrawer(drawerEl("workspace-drawer"))).toBe(true);
  });

  it("rejects a missing drawer", () => {
    expect(isRightDrawer(null)).toBe(false);
  });
});

describe("isDrawerOnScreen", () => {
  const VW = 400;

  it("counts a drawer covering the whole screen as open", () => {
    expect(isDrawerOnScreen(rect(0, 400), VW)).toBe(true);
  });

  it("does not count a drawer translated off screen", () => {
    expect(isDrawerOnScreen(rect(400, 400), VW)).toBe(false);
    expect(isDrawerOnScreen(rect(-400, 400), VW)).toBe(false);
  });

  it("stops counting a closing drawer once only 40% is visible", () => {
    expect(isDrawerOnScreen(rect(240, 400), VW)).toBe(false);
  });

  it("still counts a drawer 60% visible so the navbar does not flicker while opening", () => {
    expect(isDrawerOnScreen(rect(160, 400), VW)).toBe(true);
  });

  it("does not count an empty box", () => {
    expect(isDrawerOnScreen(rect(0, 0), VW)).toBe(false);
    expect(isDrawerOnScreen(rect(0, 400, 0), VW)).toBe(false);
  });

  it("counts the partial non-fullscreen drawer at 85% width as open", () => {
    expect(isDrawerOnScreen(rect(60, 340), VW)).toBe(true);
  });
});

describe("fullscreenOn", () => {
  it("turns on in an open chat even with the setting off", () => {
    expect(fullscreenOn(false, true)).toBe(true);
  });

  it("applies on every screen when the setting is on", () => {
    expect(fullscreenOn(true, false)).toBe(true);
    expect(fullscreenOn(true, true)).toBe(true);
  });

  it("stays off outside a chat with the setting off", () => {
    expect(fullscreenOn(false, false)).toBe(false);
  });
});

describe("isChatScreen", () => {
  const rootEl = (...classes: string[]) =>
    ({ classList: { contains: (c: string) => classes.includes(c) } }) as Element;

  it("is a chat when the root has corvus-chat-open", () => {
    expect(isChatScreen(rootEl("corvus-root", "corvus-chat-open"))).toBe(true);
  });

  it("is not a chat without that class", () => {
    expect(isChatScreen(rootEl("corvus-root"))).toBe(false);
  });

  it("is not a chat without a root", () => {
    expect(isChatScreen(null)).toBe(false);
  });
});
