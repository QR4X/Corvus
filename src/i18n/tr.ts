export function setUiLocale(_locale: "en-us"): void {}

export function uiLocale(): "en-US" {
  return "en-US";
}

export function tr(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (full, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : full
  );
}

export function mark(text: string): string {
  return text;
}
