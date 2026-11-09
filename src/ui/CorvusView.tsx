import { ItemView, Platform, WorkspaceLeaf } from "obsidian";
import { createRoot, type Root } from "react-dom/client";
import type CorvusPlugin from "../main";
import { ChatSession } from "../core/session";
import { App } from "./App";
import { fullscreenOn, isChatScreen, isDrawerOnScreen, isRightDrawer } from "./fullscreenScope";
import { hapticsOn, setHapticsEnabled } from "./haptics";
import { syncSheetStrip } from "./sheetStrip";

export const VIEW_TYPE_CORVUS = "corvus";

const DRAWER_SETTLE_MS = 260;

export class CorvusView extends ItemView {
  private root: Root | null = null;
  private session: ChatSession | null = null;
  private keyboardObserver: MutationObserver | null = null;
  private drawerObserver: MutationObserver | null = null;
  private drawerCheckTimer: number | null = null;

  private lastKeyboardHeight = -1;
  private settingsUnsub: (() => void) | null = null;

  private folhaMarcada: HTMLElement | null = null;

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

    this.folhaMarcada = this.containerEl.parentElement;
    this.folhaMarcada?.addClass("corvus-leaf");

    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    this.session = new ChatSession(this.plugin);
    this.root = createRoot(container);
    this.root.render(
      <App
        plugin={this.plugin}
        session={this.session}

        onScreenChange={() => this.applyFullscreen()}
      />
    );

    setHapticsEnabled(this.plugin.settings.hapticsEnabled !== false);
    this.hapticsOff = hapticsOn(container);

    this.setupKeyboardObserver();

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

    this.folhaMarcada?.removeClass("corvus-leaf");
    this.folhaMarcada = null;
    this.hapticsOff?.();
    this.hapticsOff = null;
    this.teardownKeyboardObserver();
    this.teardownDrawerObserver();
    this.settingsUnsub?.();
    this.settingsUnsub = null;

    this.clearFullscreen();
    this.root?.unmount();
    this.root = null;

    await this.session?.flushBackground();
    this.session?.dispose();
    this.session = null;
  }

  private syncKeyboard = (): void => {

    const docEl = this.containerEl.doc.documentElement;
    const keyboardHeight = parseFloat(
      docEl.style.getPropertyValue("--keyboard-height") || "0"
    );
    if (keyboardHeight === this.lastKeyboardHeight) return;
    this.lastKeyboardHeight = keyboardHeight;

    const drawer = this.containerEl.closest(".workspace-drawer");
    if (!drawer) return;

    const active = !!this.containerEl.closest(
      ".workspace-drawer-active-tab-content"
    );
    const isOpen = active && keyboardHeight > 0;
    drawer.classList.toggle("corvus-keyboard-open", isOpen);

    this.containerEl.doc.body.classList.toggle("corvus-keyboard-open", isOpen);
  };

  private setupKeyboardObserver(): void {
    if (!Platform.isMobile) return;
    const docEl = this.containerEl.doc.documentElement;

    this.syncKeyboard();

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

    const drawer = this.containerEl.closest(".workspace-drawer") ?? this.gaveta;
    drawer?.classList.remove("corvus-keyboard-open");
    this.containerEl.doc.body.classList.remove("corvus-keyboard-open");
  }

  applyFullscreen(): void {
    if (!Platform.isMobile) return;
    const atual = this.containerEl.closest(".workspace-drawer");

    if (this.gaveta && this.gaveta !== atual) this.recomputeDrawer(this.gaveta);
    if (atual) this.gaveta = atual;
    this.recomputeDrawer(atual);
  }

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

    if (isRightDrawer(drawer)) {
      this.containerEl.doc.body.classList.toggle(
        "corvus-fullscreen",
        on && this.hostDrawerVisible(drawer)
      );
    }
  }

  private clearFullscreen(): void {
    this.recomputeDrawer(this.gaveta);
    this.gaveta = null;
  }

  private hostDrawerVisible(host: Element | null): boolean {
    if (!host) return false;
    const win = this.containerEl.doc.defaultView;
    if (!win) return true;
    const style = win.getComputedStyle(host);
    if (style.display === "none" || style.visibility === "hidden") return false;
    return isDrawerOnScreen(host.getBoundingClientRect(), win.innerWidth);
  }

  private setupDrawerObserver(): void {
    if (!Platform.isMobile) return;
    const host = this.containerEl.closest(".workspace-drawer")?.parentElement;
    if (!host) return;
    this.drawerObserver = new MutationObserver(() => {
      if (this.drawerCheckTimer !== null) {
        window.clearTimeout(this.drawerCheckTimer);
      }

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
