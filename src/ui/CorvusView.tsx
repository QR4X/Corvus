// src/ui/CorvusView.tsx
// ItemView nativa do Obsidian que hospeda a casca (React/Preact). Cria uma
// ChatSession por view e a descarta ao fechar (flusha o save pendente).
//
// Além disso mora aqui tudo que precisa mexer em ancestrais da view — nunca em
// API interna do Obsidian, só em classes:
//   • observer do teclado mobile  → .corvus-keyboard-open
//   • fullscreen mobile (opt-in)  → .corvus-fullscreen
// Ambos são portados da casca anterior (0.3.0), onde já tinham rodado no
// aparelho; as regras de escopo do fullscreen vivem em fullscreenScope.ts
// (puras e testadas).

import { ItemView, Platform, WorkspaceLeaf } from "obsidian";
import { createRoot, type Root } from "react-dom/client";
import type CorvusPlugin from "../main";
import { ChatSession } from "../core/session";
import { App } from "./App";
import { fullscreenOn, isChatScreen, isDrawerOnScreen, isRightDrawer } from "./fullscreenScope";
import { hapticsOn, setHapticsEnabled } from "./haptics";
import { syncSheetStrip } from "./sheetStrip";

export const VIEW_TYPE_CORVUS = "corvus";

/** Espera a animação da gaveta terminar antes de reavaliar a geometria. */
const DRAWER_SETTLE_MS = 260;

export class CorvusView extends ItemView {
  private root: Root | null = null;
  private session: ChatSession | null = null;
  private keyboardObserver: MutationObserver | null = null;
  private drawerObserver: MutationObserver | null = null;
  private drawerCheckTimer: number | null = null;
  /** Último valor lido de --keyboard-height (early-return do observer). */
  private lastKeyboardHeight = -1;
  private settingsUnsub: (() => void) | null = null;
  /** A `.workspace-leaf` marcada com `corvus-leaf` — guardada, ver onClose. */
  private folhaMarcada: HTMLElement | null = null;
  /** A `.workspace-drawer` onde a view esteve por último. Guardada porque,
   *  com outra aba na frente (ou depois de fechada), a nossa folha sai do DOM
   *  e o `closest` já não acha a gaveta — e as classes que pusemos nela (tela
   *  cheia, faixa da folha, teclado) têm de sair mesmo assim. Até a 0.9.15
   *  não saíam: trocar de aba ou fechar a Corvus com a tela cheia ligada
   *  deixava a gaveta sem cabeçalho e sem o seletor de abas. */
  private gaveta: Element | null = null;
  private hapticsOff: (() => void) | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: CorvusPlugin
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_CORVUS;
  }

  getDisplayText(): string {
    return "Corvus";
  }

  getIcon(): string {
    return "bot";
  }

  async onOpen(): Promise<void> {
    // A folha que embrulha esta view (o pai do containerEl, que é o
    // `.workspace-leaf-content`) ganha uma classe nossa. Ela substitui um
    // `.workspace-leaf:has(.workspace-leaf-content[data-type="corvus"])` no
    // CSS: a folha é fixa durante a vida da view, e o `.workspace-drawer-active-
    // tab-container .corvus-leaf` continua dinâmico — quando outra aba da gaveta
    // vira a corrente, a nossa folha sai do DOM e o seletor para de casar.
    this.folhaMarcada = this.containerEl.parentElement;
    this.folhaMarcada?.addClass("corvus-leaf");
    // containerEl.children[1] é o miolo da view (o [0] é o header nativo).
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    this.session = new ChatSession(this.plugin);
    this.root = createRoot(container);
    this.root.render(
      <App
        plugin={this.plugin}
        session={this.session}
        // Trocar de tela muda o alvo do fullscreen (conversa × painel/histórico).
        // O App avisa na hora: esperar o observer da gaveta (260ms de settle)
        // faria a moldura aparecer/sumir atrasada ao entrar e sair da conversa.
        onScreenChange={() => this.applyFullscreen()}
      />
    );

    // Tato: um ouvinte só, na raiz, pega TODO clique da casca — botão novo
    // nasce com feedback sem ninguém precisar lembrar. Os momentos com
    // significado próprio (abrir, enviar, descartar) chamam o seu.
    setHapticsEnabled(this.plugin.settings.hapticsEnabled !== false);
    this.hapticsOff = hapticsOn(container);

    this.setupKeyboardObserver();

    // Fullscreen é opt-in e reativo: re-aplica a cada saveSettings (o toggle
    // vive no menu lateral) e a cada troca de aba/layout — senão a classe
    // ficaria na gaveta com OUTRA view ativa, escondendo o chrome dela.
    this.applyFullscreen();
    this.settingsUnsub = this.plugin.onSettingsChange(() => {
      setHapticsEnabled(this.plugin.settings.hapticsEnabled !== false);
      this.applyFullscreen();
    });
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => this.applyFullscreen())
    );
    this.registerEvent(
      this.app.workspace.on("layout-change", () => this.applyFullscreen())
    );
    this.registerEvent(
      this.app.workspace.on("resize", () => this.applyFullscreen())
    );
    this.setupDrawerObserver();
  }

  async onClose(): Promise<void> {
    // Pela referência guardada, e não por `containerEl.parentElement`: o
    // `View.close` do Obsidian faz `containerEl.detach()` ANTES de chamar o
    // onClose, então aqui o pai já é null. Sem isto a classe ficava na folha,
    // e a folha é reaproveitada pela próxima view que abrir nela.
    this.folhaMarcada?.removeClass("corvus-leaf");
    this.folhaMarcada = null;
    this.hapticsOff?.();
    this.hapticsOff = null;
    this.teardownKeyboardObserver();
    this.teardownDrawerObserver();
    this.settingsUnsub?.();
    this.settingsUnsub = null;
    // Fechar a view devolve o chrome do app mesmo se algo acima deu errado.
    // A esta altura a nossa folha já saiu do DOM (o View.close do Obsidian a
    // desanexa antes do onClose), então a gaveta é recalculada sem ela.
    this.clearFullscreen();
    this.root?.unmount();
    this.root = null;
    // ANTES do dispose e com await: se alguma conversa está respondendo fora
    // da tela, o arquivo dela ainda não existe — quem grava é o fim do turno,
    // e o turno vai morrer aqui.
    await this.session?.flushBackground();
    this.session?.dispose();
    this.session = null;
  }

  // ── teclado ───────────────────────────────────────────────────────────────

  /**
   * Observer do teclado — 1:1 com a casca 0.2.x (técnica do plugin Copilot).
   *
   * O Obsidian mobile publica `--keyboard-height` INLINE no `<html>` quando o
   * teclado abre/fecha; observamos o atributo `style` e reagimos. A classe
   * `corvus-keyboard-open` vai na gaveta (o CSS esconde o chrome dela) e no body
   * (modais vivem fora da gaveta, e é o body que aparece na faixa abaixo do
   * `.app-container` encolhido).
   *
   * O QUE ESTE OBSERVER NÃO FAZ — e é de propósito: mexer na altura da gaveta.
   * Quando o teclado abre, o próprio Obsidian já encolhe a gaveta até o topo
   * do teclado (documentado em docs/archive/MOBILE-FULLSCREEN.md, 0.1.255: é
   * o que mantém o composer correto sem fullscreen). Qualquer altura nossa
   * aqui briga com a dele ou conta o teclado duas vezes. A ÚNICA altura nossa
   * é a do fullscreen, onde a gaveta também ganha largura própria — e é lá,
   * no CSS, que o teclado é descontado.
   */
  private syncKeyboard = (): void => {
    // Verbatim da casca 0.2.37: o Obsidian mobile expõe `--keyboard-height` no
    // <html> quando o teclado abre/fecha; observamos o atributo `style` e
    // reagimos. Cacheia o último valor pra dar early-return nas mudanças de
    // style que não mexem no teclado.
    const docEl = this.containerEl.doc.documentElement;
    const keyboardHeight = parseFloat(
      docEl.style.getPropertyValue("--keyboard-height") || "0"
    );
    if (keyboardHeight === this.lastKeyboardHeight) return;
    this.lastKeyboardHeight = keyboardHeight;

    // Re-busca a gaveta a cada update — sobrevive a migração entre janelas.
    const drawer = this.containerEl.closest(".workspace-drawer");
    if (!drawer) return;
    // Multi-tab: a view precisa ser a aba ativa da gaveta.
    const active = !!this.containerEl.closest(
      ".workspace-drawer-active-tab-content"
    );
    const isOpen = active && keyboardHeight > 0;
    drawer.classList.toggle("corvus-keyboard-open", isOpen);
    // No body também, pros modais (que ficam FORA da gaveta) se reposicionarem.
    this.containerEl.doc.body.classList.toggle("corvus-keyboard-open", isOpen);
  };

  private setupKeyboardObserver(): void {
    if (!Platform.isMobile) return;
    const docEl = this.containerEl.doc.documentElement;

    // Check inicial: cobre o teclado já aberto quando a view monta.
    this.syncKeyboard();

    // Observa SÓ o atributo `style` do <html> — é lá que o Obsidian mexe na
    // --keyboard-height. Mais barato que observar o DOM inteiro.
    this.keyboardObserver = new MutationObserver(this.syncKeyboard);
    this.keyboardObserver.observe(docEl, {
      attributes: true,
      attributeFilter: ["style"],
    });
  }

  private teardownKeyboardObserver(): void {
    this.keyboardObserver?.disconnect();
    this.keyboardObserver = null;
    this.lastKeyboardHeight = -1;
    // Pela gaveta guardada: no onClose a folha já saiu do DOM e o `closest`
    // devolveria null — a gaveta ficava sem cabeçalho até o teclado abrir de
    // novo noutra view da Corvus.
    const drawer = this.containerEl.closest(".workspace-drawer") ?? this.gaveta;
    drawer?.classList.remove("corvus-keyboard-open");
    this.containerEl.doc.body.classList.remove("corvus-keyboard-open");
  }

  // ── fullscreen ────────────────────────────────────────────────────────────

  /**
   * Fullscreen mobile — mesma técnica do observer do teclado: só alterna
   * classes em ancestrais, sem tocar em API interna nem em variável nativa do
   * Obsidian.
   *
   * - `.workspace-drawer.corvus-fullscreen` esconde o header da gaveta, que é
   *   redundante quando a Corvus está ativa (temos topbar e menu próprios).
   * - `body.corvus-fullscreen` esconde a navbar global e desliga a reserva de
   *   espaço do composer (a regra `:not(.corvus-fullscreen)` no CSS).
   *
   * Vale por DUAS razões (ver fullscreenOn): a setting `mobileFullscreen`
   * ligada à mão, OU uma CONVERSA aberta — que liga o modo sozinha em qualquer
   * modo (Chat, Vault Q&A, Agent) sem gravar nada. Fora da conversa o valor
   * volta a ser exatamente o da setting.
   *
   * Garantias anti-armadilha: só mobile, só na aba ativa da gaveta DIREITA, só
   * enquanto essa gaveta está de fato na tela, saída sempre visível (a topbar
   * e o menu lateral são nossos e continuam lá) e classes removidas no
   * onClose.
   */
  applyFullscreen(): void {
    if (!Platform.isMobile) return;
    const atual = this.containerEl.closest(".workspace-drawer");
    // A gaveta de antes primeiro: com outra aba na frente, ou com a folha
    // movida, a nossa folha saiu dela — e ela tem de perder a tela cheia e a
    // faixa. Depois a de agora, que dá a palavra final no body.
    if (this.gaveta && this.gaveta !== atual) this.recomputeDrawer(this.gaveta);
    if (atual) this.gaveta = atual;
    this.recomputeDrawer(atual);
  }

  /**
   * Recalcula as classes de UMA gaveta pelo que está nela AGORA — não por qual
   * view chamou. A tela cheia vale quando a aba corrente da gaveta direita é
   * uma view da Corvus (esta ou outra) E a setting está ligada OU a casca está
   * mostrando uma CONVERSA (fullscreenOn); a faixa, quando há folha nossa
   * aberta nela (ui/sheetStrip.ts). Perguntar ao DOM é o que faz troca de aba,
   * folha movida, view fechada e duas views na mesma gaveta darem o mesmo
   * resultado em qualquer ordem de evento. (A gaveta só põe no
   * `.workspace-drawer-active-tab-content` a folha da aba corrente; as outras
   * saem do DOM.)
   */
  private recomputeDrawer(drawer: Element | null): void {
    if (!drawer) return;
    syncSheetStrip(drawer.querySelector(".workspace-drawer-inner"));
    const corvusNaFrente =
      drawer.querySelector(
        '.workspace-drawer-active-tab-content .workspace-leaf-content[data-type="corvus"]'
      ) !== null;
    const on =
      corvusNaFrente &&
      isRightDrawer(drawer) &&
      fullscreenOn(
        !!this.plugin.settings.mobileFullscreen,
        isChatScreen(drawer.querySelector(".corvus-root"))
      );
    drawer.classList.toggle("corvus-fullscreen", on);
    // A navbar global é IRMÃ das gavetas (mora no body). Some só ENQUANTO a
    // gaveta da Corvus está na tela: abrir a gaveta esquerda (ou fechar a nossa
    // no swipe) devolve a navegação global na hora, em vez de deixar o
    // Obsidian sem chrome. Só a gaveta DIREITA mexe no body — é a única que
    // liga a tela cheia.
    if (isRightDrawer(drawer)) {
      this.containerEl.doc.body.classList.toggle(
        "corvus-fullscreen",
        on && this.hostDrawerVisible(drawer)
      );
    }
  }

  /** No onClose a folha já saiu do DOM: a gaveta guardada é recalculada sem
   *  ela — se outra view da Corvus está na frente, a tela cheia continua. */
  private clearFullscreen(): void {
    this.recomputeDrawer(this.gaveta);
    this.gaveta = null;
  }

  /**
   * A gaveta que hospeda a Corvus está VISÍVEL agora? Pergunta geométrica de
   * propósito: nome de classe de ESTADO da gaveta muda entre versões do
   * Obsidian, "o retângulo intersecta a viewport" não. Falha pro lado seguro:
   * qualquer dúvida conta como visível, então o modo continua funcionando em
   * vez de virar um fullscreen que não liga.
   */
  private hostDrawerVisible(host: Element | null): boolean {
    if (!host) return false;
    const win = this.containerEl.doc.defaultView;
    if (!win) return true;
    const style = win.getComputedStyle(host);
    if (style.display === "none" || style.visibility === "hidden") return false;
    return isDrawerOnScreen(host.getBoundingClientRect(), win.innerWidth);
  }

  /**
   * Observa abrir/fechar das gavetas pra devolver a navbar assim que a gaveta
   * esquerda entra em cena (e tirá-la de novo quando ela sai). O Obsidian anima
   * as gavetas por transform/classe no próprio elemento — então observamos
   * atributos, a mesma técnica não-invasiva do observer do teclado.
   */
  private setupDrawerObserver(): void {
    if (!Platform.isMobile) return;
    const host = this.containerEl.closest(".workspace-drawer")?.parentElement;
    if (!host) return;
    this.drawerObserver = new MutationObserver(() => {
      if (this.drawerCheckTimer !== null) {
        window.clearTimeout(this.drawerCheckTimer);
      }
      // A checagem roda DEPOIS da animação: durante o transform a geometria
      // ainda diz "aberto" mesmo indo pra fora da tela.
      this.drawerCheckTimer = window.setTimeout(() => {
        this.drawerCheckTimer = null;
        this.applyFullscreen();
      }, DRAWER_SETTLE_MS);
    });
    this.drawerObserver.observe(host, {
      attributes: true,
      attributeFilter: ["class", "style"],
      subtree: true,
    });
  }

  private teardownDrawerObserver(): void {
    this.drawerObserver?.disconnect();
    this.drawerObserver = null;
    if (this.drawerCheckTimer !== null) {
      window.clearTimeout(this.drawerCheckTimer);
      this.drawerCheckTimer = null;
    }
  }
}
