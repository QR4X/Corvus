// src/ui/sheetStrip.ts
// A faixa da barra de gestos atrás de uma folha aberta.
//
// No celular, a gaveta do Obsidian guarda uma reserva embaixo
// (`.workspace-drawer-inner`, padding-bottom = max(safe-area, 16px)) pintada
// com a cor da gaveta. A folha não consegue descer até lá — o `.workspace-leaf`
// tem `contain: strict`, que prende o nosso `position: fixed` dentro da folha —
// e a reserva aparecia como uma barra de outra cor grudada no fim dela. O CSS
// pinta essa reserva com a cor da folha enquanto há folha aberta (ver
// `.workspace-drawer-inner.corvus-sheet-open` em styles/main.css).
//
// Quem sabe que há folha aberta é a nossa árvore; a caixa a pintar é do
// Obsidian, alguns andares acima. Até a 0.9.15 o CSS ligava as duas pontas com
// `:has()`, e a revisão do Obsidian avisa contra ele: cada nó com classe
// inserido na gaveta — o streaming de uma resposta incluído — fazia o
// navegador reavaliar o seletor varrendo a gaveta inteira. Agora a ponte é uma
// classe na caixa do Obsidian.
//
// A classe é RECALCULADA do DOM, não ligada por quem abre e desligada por quem
// fecha: há várias folhas montadas ao mesmo tempo (o chat sozinho tem quatro),
// pode haver duas views na mesma gaveta, e uma folha pode ser desmontada aberta.
// Perguntar ao DOM "tem alguma aberta aqui?" acerta em todos esses casos, em
// qualquer ordem.

/** A classe que o CSS da faixa espera na `.workspace-drawer-inner`. */
export const SHEET_OPEN_CLASS = "corvus-sheet-open";

/** A caixa do Obsidian que guarda a reserva da barra de gestos, se houver
 *  (fora da gaveta do celular, não há). */
export function drawerInnerOf(el: Element | null | undefined): Element | null {
  return el?.closest(".workspace-drawer-inner") ?? null;
}

/** Recalcula a classe pelo que ESTÁ no DOM agora. */
export function syncSheetStrip(inner: Element | null | undefined): void {
  if (!inner) return;
  inner.classList.toggle(
    SHEET_OPEN_CLASS,
    inner.querySelector(".corvus-root .corvus-sheet-layer.is-open") !== null
  );
}
