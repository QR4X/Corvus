export function normalizePath(path: string): string {

  return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
}

export function parseYaml(_input: string): unknown {

  return {};
}

export const __avisos: string[] = [];
export class Notice {
  constructor(public message?: string) {
    __avisos.push(message ?? "");
  }
  setMessage() {}
  hide() {}
}

let __requestUrlImpl: ((opts: unknown) => Promise<unknown>) | null = null;
export function __setRequestUrl(
  fn: ((opts: unknown) => Promise<unknown>) | null
): void {
  __requestUrlImpl = fn;
}
export async function requestUrl(opts: unknown): Promise<unknown> {
  if (__requestUrlImpl) return __requestUrlImpl(opts);
  throw new Error("requestUrl não mockado — use __setRequestUrl no teste.");
}

export class Plugin {}
export class PluginSettingTab {}
export class ItemView {}
export class Modal {}

export class SuggestModal<T> {
  modalEl = {
    classes: new Set<string>(),
    addClass(...classes: string[]): void {
      for (const cls of classes) this.classes.add(cls);
    },
    hasClass(cls: string): boolean {
      return this.classes.has(cls);
    },
  };
  constructor(public app?: unknown) {}
  setPlaceholder(_p: string): void {}
  open(): void {}
  close(): void {}
  getSuggestions(_q: string): T[] {
    return [];
  }
}
export class MarkdownView {}
export class Setting {}
export class ToggleComponent {}
export class TFile {}
export class TFolder {}
export class Component {}
export const MarkdownRenderer = { render: async () => {} };
export function setIcon(): void {}

export function getLanguage(): string {
  return "en";
}

export const Platform = { isMobile: false };

export function getLinkpath(linktext: string): string {
  return linktext.replace(/#.*$/, "");
}
