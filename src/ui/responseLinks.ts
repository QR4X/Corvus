import {
  App,
  Notice,
  Platform,
  getLinkpath,
  type HoverParent,
  type PaneType,
} from "obsidian";
import { tr } from "../i18n/tr";

export const HOVER_SOURCE = "corvus";

export function internalLink(
  target: EventTarget | null,
  root: HTMLElement
): HTMLAnchorElement | null {
  const el = target as HTMLElement | null;
  const a = el?.closest?.<HTMLAnchorElement>("a.internal-link") ?? null;
  return a && root.contains(a) ? a : null;
}

export function linkText(a: HTMLElement): string {
  return a.getAttribute("data-href") || a.getAttribute("href") || a.textContent || "";
}

export function openResponseLink(
  app: App,
  link: string,
  newLeaf: PaneType | boolean,
  container: Element
): boolean {
  const linkPath = getLinkpath(link);
  if (!app.metadataCache.getFirstLinkpathDest(linkPath, "")) {
    new Notice(tr("Not found: {path}", { path: linkPath || link }));
    return false;
  }
  void app.workspace.openLinkText(link, "", newLeaf);
  if (Platform.isMobile) collapseDrawerOf(app, container);
  return true;
}

function collapseDrawerOf(app: App, container: Element): void {
  const ws = app.workspace;
  const leaf = ws
    .getLeavesOfType(HOVER_SOURCE)
    .find((l) => l.view.containerEl.contains(container));
  const root = leaf?.getRoot();
  if (root === ws.rightSplit) ws.rightSplit.collapse();
  else if (root === ws.leftSplit) ws.leftSplit.collapse();
}

export function previewLink(
  app: App,
  ev: MouseEvent,
  a: HTMLElement,
  parent: HoverParent
): void {
  app.workspace.trigger("hover-link", {
    event: ev,
    source: HOVER_SOURCE,
    hoverParent: parent,
    targetEl: a,
    linktext: linkText(a),
    sourcePath: "",
  });
}
