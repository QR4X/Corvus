import {
  App,
  Notice,
  Platform,
  getLinkpath,
  type HoverParent,
  type PaneType,
} from "obsidian";
import { tr } from "../i18n/tr";

export const FONTE_DO_HOVER = "corvus";

export function linkInterno(
  alvo: EventTarget | null,
  raiz: HTMLElement
): HTMLAnchorElement | null {
  const el = alvo as HTMLElement | null;
  const a = el?.closest?.<HTMLAnchorElement>("a.internal-link") ?? null;
  return a && raiz.contains(a) ? a : null;
}

export function textoDoLink(a: HTMLElement): string {
  return a.getAttribute("data-href") || a.getAttribute("href") || a.textContent || "";
}

export function abrirLinkDaResposta(
  app: App,
  texto: string,
  aba: PaneType | boolean,
  dentro: Element
): boolean {
  const caminho = getLinkpath(texto);
  if (!app.metadataCache.getFirstLinkpathDest(caminho, "")) {
    new Notice(tr("Not found: {path}", { path: caminho || texto }));
    return false;
  }
  void app.workspace.openLinkText(texto, "", aba);
  if (Platform.isMobile) fecharGavetaDa(app, dentro);
  return true;
}

function fecharGavetaDa(app: App, dentro: Element): void {
  const ws = app.workspace;
  const folha = ws
    .getLeavesOfType(FONTE_DO_HOVER)
    .find((l) => l.view.containerEl.contains(dentro));
  const raiz = folha?.getRoot();
  if (raiz === ws.rightSplit) ws.rightSplit.collapse();
  else if (raiz === ws.leftSplit) ws.leftSplit.collapse();
}

export function previaDoLink(
  app: App,
  ev: MouseEvent,
  a: HTMLElement,
  pai: HoverParent
): void {
  app.workspace.trigger("hover-link", {
    event: ev,
    source: FONTE_DO_HOVER,
    hoverParent: pai,
    targetEl: a,
    linktext: textoDoLink(a),
    sourcePath: "",
  });
}
