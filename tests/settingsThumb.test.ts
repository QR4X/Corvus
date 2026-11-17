import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { putThumb, seedThumb, thumbOf } from "../src/ui/settings/thumb";

function makeRow(active: { left: number; width: number } | null, vars: Record<string, string> = {}) {
  const log: string[] = [];
  const style = new Map(Object.entries(vars));
  const classes = new Set<string>();
  const row = {
    style: {
      getPropertyValue: (k: string) => style.get(k) ?? "",
      setProperty: (k: string, v: string) => {
        style.set(k, v);
        log.push(`${k}=${v}${classes.has("is-placing") ? " (no transition)" : ""}`);
      },
    },
    addClass: (c: string) => {
      classes.add(c);
      log.push(`+${c}`);
    },
    removeClass: (c: string) => {
      classes.delete(c);
      log.push(`-${c}`);
    },
    get offsetWidth() {
      log.push("measure");
      return 300;
    },
    querySelector: () =>
      active && { offsetLeft: active.left, offsetWidth: active.width },
  };
  return { row: row as unknown as HTMLElement, log, style };
}

describe("the first placement is instant", () => {
  it("a new row disables transitions, writes the position, forces a measure and restores transitions", () => {
    const { row, log } = makeRow({ left: 85, width: 77 });
    putThumb(row);
    expect(log).toEqual([
      "+is-placing",
      "--corvus-seg-x=85px (no transition)",
      "--corvus-seg-w=77px (no transition)",
      "measure",
      "-is-placing",
    ]);
  });

  it("a row that already has a thumb only writes, so CSS animates the slide", () => {
    const { row, log } = makeRow({ left: 85, width: 77 }, { "--corvus-seg-x": "161px", "--corvus-seg-w": "85px" });
    putThumb(row);
    expect(log).toEqual(["--corvus-seg-x=85px", "--corvus-seg-w=77px"]);
  });

  it("a hidden row measures zero and gets no position", () => {
    const { row, log, style } = makeRow({ left: 0, width: 0 });
    putThumb(row);
    expect(log).toEqual([]);
    expect(style.size).toBe(0);
  });

  it("does nothing without an active item", () => {
    const { row, log } = makeRow(null);
    putThumb(row);
    expect(log).toEqual([]);
  });
});

describe("a remounted row starts where the old one was", () => {
  it("the old thumb carries over and then slides to the new active item", () => {
    const oldRow = makeRow(null, { "--corvus-seg-x": "161px", "--corvus-seg-w": "85px" });
    const newRow = makeRow({ left: 85, width: 77 });
    seedThumb(newRow.row, thumbOf(oldRow.row));
    newRow.log.length = 0;
    putThumb(newRow.row);

    expect(newRow.log).toEqual(["--corvus-seg-x=85px", "--corvus-seg-w=77px"]);
  });

  it("without an old thumb the new row stays unplaced", () => {
    const newRow = makeRow({ left: 3, width: 67 });
    seedThumb(newRow.row, null);
    seedThumb(newRow.row, { x: "", w: "" });
    expect(newRow.style.size).toBe(0);
  });
});

describe("settings segment CSS", () => {
  const CSS = readFileSync(resolve(__dirname, "../styles/main.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  it("disables the transition on .corvus-seg.is-placing::before", () => {
    expect(CSS).toMatch(/\.corvus-settings-root \.corvus-seg\.is-placing::before\s*\{\s*transition:\s*none;\s*\}/);
  });

  it("the tab bar resets the right margin app.css gives the first child", () => {
    const body = CSS.match(/\.corvus-settings-root \.corvus-settings-nav\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(body).toMatch(/margin:\s*0 0 var\(--size-4-3\);/);
  });
});
