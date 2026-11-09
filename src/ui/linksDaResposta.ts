// src/ui/linksDaResposta.ts
// Os [[links]] de uma resposta (as citações do Vault Q&A e qualquer wikilink
// que a IA escreva) ABREM a nota no clique.
//
// O MarkdownRenderer desenha `<a class="internal-link" data-href="…">`, mas
// quem dá vida a esse link é a view de leitura do Obsidian, não o renderer:
// numa view nossa o clique não fazia nada. A 0.1.137 ligava isso; a casca
// nova (0.4.0) perdeu, e as citações viraram texto sublinhado.

import {
  App,
  Notice,
  Platform,
  getLinkpath,
  type HoverParent,
  type PaneType,
} from "obsidian";
import { tr } from "../i18n/tr";

/** A fonte do `hover-link` (o "Page preview" do Obsidian lista cada uma). É o
 *  tipo da view, `VIEW_TYPE_CORVUS` — repetido aqui pra este módulo não puxar a
 *  view inteira (e o React) pra dentro dos testes. */
export const FONTE_DO_HOVER = "corvus";

/** O link interno sob o evento, se ele está dentro de `raiz`. */
export function linkInterno(
  alvo: EventTarget | null,
  raiz: HTMLElement
): HTMLAnchorElement | null {
  const el = alvo as HTMLElement | null;
  const a = el?.closest?.<HTMLAnchorElement>("a.internal-link") ?? null;
  return a && raiz.contains(a) ? a : null;
}

/** O texto do link como o Obsidian o guarda: `Nota`, `Nota#Seção`, `Nota#^bloco`. */
export function textoDoLink(a: HTMLElement): string {
  return a.getAttribute("data-href") || a.getAttribute("href") || a.textContent || "";
}

/**
 * Abre a nota do link. A resposta não mora em nota nenhuma, então o caminho
 * de origem é vazio: o link resolve como no resto do vault (o nome mais
 * próximo da raiz ganha).
 *
 * Link que não leva a nota nenhuma vira um aviso, e não uma nota nova: o
 * Obsidian cria a nota no clique de um link sem destino, e aqui isso seria
 * uma nota vazia com o nome de uma citação que a IA inventou.
 *
 * No celular a conversa ocupa a gaveta, que fica NA FRENTE da nota aberta —
 * então a gaveta fecha. Só a que tem a conversa, e só se ela está numa
 * gaveta: com a view na área principal, a nota abre numa aba e aparece.
 */
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

/** A prévia da nota ao passar o mouse (o "Page preview" do Obsidian decide se
 *  mostra, e se pede Ctrl/Cmd — a fonte é registrada no main.ts). */
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
