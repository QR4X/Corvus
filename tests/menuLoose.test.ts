import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { openActions } from "../src/ui/menu";

const CSS = readFileSync(resolve(__dirname, "../styles/main.css"), "utf8");
const UNCOMMENTED = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

function block(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = UNCOMMENTED.match(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "m"));
  expect(m, `rule missing: ${selector}`).toBeTruthy();
  return m![1];
}

const token = (body: string, name: string) =>
  body.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();

describe("the popover does not depend on the root", () => {
  it("no popover rule starts with .corvus-root", () => {
    expect(UNCOMMENTED).not.toMatch(/\.corvus-root\s+(button)?\.corvus-pop/);
  });

  it("the layer carries the root tokens with the same values", () => {
    const root = block(".corvus-root");
    const layer = block(".corvus-pop-layer");
    for (const name of ["--corvus-1", "--corvus-2", "--corvus-3", "--corvus-s1", "--corvus-hairline"]) {
      expect(token(layer, name), name).toBeTruthy();
      expect(token(layer, name), name).toBe(token(root, name));
    }
  });

  it("a loose layer outside the root is positioned against the viewport", () => {
    expect(block(".corvus-pop-layer.is-loose")).toMatch(/position:\s*fixed/);
  });

  it("the pick popover continues the button: it scrolls and has no width of its own", () => {
    const body = block(".corvus-pop-layer .corvus-pop.is-pick");
    expect(body).toMatch(/overflow-y:\s*auto/);
    expect(body).toMatch(/max-width:\s*none/);
    expect(body).toMatch(/background-color:\s*var\(--dropdown-background\)/);
  });

  it("when open, button and list form one card with a square joining corner", () => {
    expect(block(".corvus-pop-layer .corvus-pop.is-pick.is-down")).toMatch(/border-top-left-radius:\s*0/);
    expect(block(".corvus-pop-layer .corvus-pop.is-pick.is-up")).toMatch(/border-bottom-left-radius:\s*0/);
    expect(block(".corvus-settings-root button.corvus-pick.is-open-down")).toMatch(
      /border-radius:\s*var\(--corvus-r\) var\(--corvus-r\) 0 0/
    );
    expect(block(".corvus-settings-root button.corvus-pick.is-open-up")).toMatch(
      /border-radius:\s*0 0 var\(--corvus-r\) var\(--corvus-r\)/
    );
  });

  it("a row with an extra button gives the item the row minus the button", () => {
    expect(block(".corvus-pop-layer .corvus-pop-row")).toMatch(/display:\s*flex/);
    const item = block(".corvus-pop-layer .corvus-pop-row > button.corvus-pop-item");
    expect(item).toMatch(/flex:\s*1 1 auto/);
    expect(item).toMatch(/min-width:\s*0/);
    const extra = block(".corvus-pop-layer button.corvus-pop-extra");
    expect(extra).toMatch(/width:\s*40px/);
    expect(extra).toMatch(/flex:\s*0 0 auto/);
  });

  it("list rows share the button's columns", () => {
    const row = block(".corvus-pop-layer .corvus-pop.is-pick button.corvus-pop-item");
    const button = block(".corvus-settings-root .setting-item-control button.corvus-pick");
    const pad = (c: string) => c.match(/padding:\s*([^;]+);/)?.[1].trim();
    expect(pad(row)).toBe(pad(button));
    expect(row).toMatch(/gap:\s*var\(--size-4-2\)/);
    expect(button).toMatch(/gap:\s*var\(--size-4-2\)/);
    expect(row).toMatch(/min-height:\s*var\(--input-height\)/);
  });
});

type Listener = (e: FakeEvent) => void;

interface FakeEvent {
  target: FakeEl;
  key?: string;
  stopped: boolean;
  stopPropagation(): void;
  preventDefault(): void;
}

class FakeEl {
  children: FakeEl[] = [];
  parent: FakeEl | null = null;
  classes = new Set<string>();
  attrs: Record<string, string> = {};
  style: Record<string, string> = {};
  text = "";
  listeners = new Map<string, Listener[]>();
  offsetHeight = 0;
  offsetWidth = 0;
  offsetTop = 0;
  scrollHeight = 0;
  clientHeight = 0;
  scrollTop = 0;
  classList = {
    add: (...c: string[]) => this.addClass(...c),
    contains: (c: string) => this.classes.has(c),
  };

  constructor(public ownerDocument: FakeDoc, public tag = "div") {}

  get firstChild(): FakeEl | null {
    return this.children[0] ?? null;
  }

  removeChild(child: FakeEl): void {
    this.children = this.children.filter((c) => c !== child);
    child.parent = null;
  }

  createEl(
    tag: string,
    o: { cls?: string; attr?: Record<string, string>; text?: string } = {}
  ): FakeEl {
    const el = new FakeEl(this.ownerDocument, tag);
    if (o.cls) el.addClass(...o.cls.split(" "));
    Object.assign(el.attrs, o.attr ?? {});
    el.text = o.text ?? "";
    el.parent = this;
    this.children.push(el);
    return el;
  }

  createDiv(o?: { cls?: string; attr?: Record<string, string> }): FakeEl {
    return this.createEl("div", o);
  }

  createSpan(o?: { cls?: string; text?: string }): FakeEl {
    return this.createEl("span", o);
  }

  addClass(...c: string[]): void {
    for (const x of c) this.classes.add(x);
  }

  removeClass(...c: string[]): void {
    for (const x of c) this.classes.delete(x);
  }

  toggleClass(c: string, on: boolean): void {
    if (on) this.classes.add(c);
    else this.classes.delete(c);
  }

  setCssStyles(s: Record<string, string>): void {
    Object.assign(this.style, s);
  }

  matches(selector: string): boolean {
    return selector
      .split(".")
      .filter(Boolean)
      .every((c) => this.classes.has(c));
  }

  closest(selector: string): FakeEl | null {
    for (let el: FakeEl | null = this; el; el = el.parent) {
      if (el.matches(selector)) return el;
    }
    return null;
  }

  querySelector(selector: string): FakeEl | null {
    for (const c of this.children) {
      if (c.matches(selector)) return c;
      const hit = c.querySelector(selector);
      if (hit) return hit;
    }
    return null;
  }

  contains(node: FakeEl | null): boolean {
    for (let el = node; el; el = el.parent) if (el === this) return true;
    return false;
  }

  remove(): void {
    this.parent?.removeChild(this);
  }

  addEventListener(type: string, fn: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }

  removeEventListener(type: string, fn: Listener): void {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((l) => l !== fn));
  }

  click(): void {
    const e: FakeEvent = {
      target: this,
      stopped: false,
      stopPropagation() {
        this.stopped = true;
      },
      preventDefault() {},
    };
    for (let el: FakeEl | null = this; el && !e.stopped; el = el.parent) {
      for (const fn of el.listeners.get("click") ?? []) fn(e);
    }
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20 };
  }
}

class FakeDoc {
  body: FakeEl = new FakeEl(this, "body");
  defaultView = { innerWidth: 800, innerHeight: 600 };
  querySelector(selector: string): FakeEl | null {
    return this.body.querySelector(selector);
  }
  addEventListener(): void {}
  removeEventListener(): void {}
}

const layerIn = (el: FakeEl) => el.children.find((c) => c.classes.has("corvus-pop-layer"));

function open(anchor: FakeEl, actions: Parameters<typeof openActions>[1], onClose?: () => void) {
  openActions(
    { currentTarget: anchor as unknown as EventTarget },
    actions,
    { onClose }
  );
}

describe("openActions picks where the popover lives from the anchor", () => {
  it("mounts in the anchor's own root, not the first root in the document", () => {
    const doc = new FakeDoc();
    const otherRoot = doc.body.createDiv({ cls: "corvus-root" });
    const ownRoot = doc.body.createDiv({ cls: "corvus-root" });
    const anchor = ownRoot.createEl("button");

    open(anchor, [{ label: "A", run: () => {} }]);

    const layer = layerIn(ownRoot);
    expect(layer).toBeTruthy();
    expect(layer!.classes.has("is-loose")).toBe(false);
    expect(layerIn(otherRoot)).toBeUndefined();
  });

  it("outside any root it mounts loose in the body, ignoring roots elsewhere", () => {
    const doc = new FakeDoc();
    const elsewhere = doc.body.createDiv({ cls: "corvus-root" });
    const anchor = doc.body.createEl("button");

    open(anchor, [{ label: "A", run: () => {} }]);

    const layer = layerIn(doc.body);
    expect(layer?.classes.has("is-loose")).toBe(true);
    expect(layerIn(elsewhere)).toBeUndefined();
  });

  it("outside any root but inside a modal it mounts loose in the modal", () => {
    const doc = new FakeDoc();
    const modal = doc.body.createDiv({ cls: "modal-container" });
    const anchor = modal.createDiv({ cls: "modal" }).createEl("button");

    open(anchor, [{ label: "A", run: () => {} }]);

    expect(layerIn(modal)?.classes.has("is-loose")).toBe(true);
    expect(layerIn(doc.body)).toBeUndefined();
  });
});

describe("openActions extra button and closing", () => {
  function setup() {
    const doc = new FakeDoc();
    const root = doc.body.createDiv({ cls: "corvus-root" });
    const anchor = root.createEl("button");
    const rowRun = vi.fn();
    const extraRun = vi.fn();
    const onClose = vi.fn();
    open(
      anchor,
      [{ label: "Voice", run: rowRun, extra: { icon: "play", label: "Preview", run: extraRun } }],
      onClose
    );
    const layer = layerIn(root)!;
    return { root, layer, rowRun, extraRun, onClose };
  }

  it("the extra button runs its own action without closing or picking the row", () => {
    const { root, layer, rowRun, extraRun, onClose } = setup();
    const extra = layer.querySelector(".corvus-pop-extra")!;

    extra.click();

    expect(extraRun).toHaveBeenCalledWith(extra);
    expect(rowRun).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(layerIn(root)).toBe(layer);
  });

  it("picking a row runs it, removes the layer and notifies the opener", () => {
    const { root, layer, rowRun, onClose } = setup();

    layer.querySelector(".corvus-pop-item")!.click();

    expect(rowRun).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    expect(layerIn(root)).toBeUndefined();
  });

  it("clicking outside the popover closes it and notifies the opener", () => {
    const { root, layer, rowRun, onClose } = setup();

    layer.click();

    expect(rowRun).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
    expect(layerIn(root)).toBeUndefined();
  });
});
