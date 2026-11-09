// src/ui/fullscreenScope.ts
// Regras PURAS de escopo do fullscreen mobile (v0.1.250). Ficam fora do
// CorvusView de propósito: são a decisão de "onde o modo vale" e de "quando a
// navbar global some" — as duas coisas que, erradas, deixam o Obsidian sem
// chrome. Puras = testáveis sem DOM nem árvore React.

/**
 * O drawer que hospeda a Corvus é o DIREITO? O Obsidian marca as gavetas com
 * `mod-right`/`mod-left`. Se nenhuma das duas existir (versão que renomeou as
 * classes), NÃO travamos o modo — a Corvus só é montada no drawer direito —, mas
 * um `mod-left` explícito é sempre um "não".
 */
export function isRightDrawer(drawer: Element | null): boolean {
  if (!drawer) return false;
  if (drawer.classList.contains("mod-left")) return false;
  return true;
}

/** Retângulo mínimo (subset do DOMRect) pra decidir visibilidade do drawer. */
export interface DrawerRect {
  width: number;
  height: number;
  left: number;
  right: number;
}

/**
 * O retângulo do drawer ocupa a tela? Metade da largura dentro da viewport
 * conta como "aberto"; no meio da animação de sair, já não conta.
 *
 * Pergunta geométrica de propósito: nome de classe de ESTADO do drawer muda
 * entre versões do Obsidian, "o retângulo intersecta a viewport" não.
 */
export function isDrawerOnScreen(
  r: DrawerRect,
  viewportWidth: number
): boolean {
  if (r.width <= 0 || r.height <= 0) return false;
  const visibleWidth = Math.min(r.right, viewportWidth) - Math.max(r.left, 0);
  return visibleWidth >= r.width / 2;
}

/**
 * O modo tela cheia deve valer AGORA?
 *
 * É um OU de duas fontes:
 *  - a setting (`mobileFullscreen`), ligada à mão no painel;
 *  - a CONVERSA aberta — qualquer modo (Chat, Vault Q&A, Agent) — que liga o
 *    modo sozinha, sem tocar na setting.
 *
 * Nada é gravado: ao SAIR da conversa a resposta volta a ser exatamente a da
 * setting, então quem deixou a tela cheia desligada continua com ela desligada
 * fora do chat.
 */
export function fullscreenOn(settingOn: boolean, chatOpen: boolean): boolean {
  return settingOn || chatOpen;
}

/**
 * A Corvus está mostrando uma CONVERSA? A casca marca o `.corvus-root` com
 * `corvus-chat-open` quando a tela é a conversa (`view === "chat"`, App.tsx) e
 * tira a marca ao trocar de tela. Perguntar ao DOM (em vez de guardar estado
 * aqui) é o que mantém a decisão certa em troca de aba, view fechada e duas
 * views na mesma gaveta — mesma razão do `corvusNaFrente`.
 */
export function isChatScreen(root: Element | null): boolean {
  return !!root?.classList.contains("corvus-chat-open");
}
