import { setIcon } from "obsidian";
import { screen } from "./haptics";
import { tr } from "../i18n/tr";

export interface MenuAction {
  label: string;
  icon?: string;

  glyph?: string;

  color?: string;
  danger?: boolean;

  checked?: boolean;

  children?: MenuAction[];

  extra?: { icon: string; label: string; run: (botao: HTMLButtonElement) => void };
  run?: () => void;
}

export interface MenuEvent {
  clientX?: number;
  clientY?: number;
  currentTarget?: EventTarget | null;
}

const VAO = 6;
const MARGEM = 10;

export interface Caixa {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export function posicaoDoBalao(params: {

  ancora: Pick<Caixa, "left" | "top" | "right" | "bottom">;

  raiz: Caixa;

  tela: { width: number; height: number };

  balao: { width: number; height: number };
}): { x: number; y: number; origem: "top right" | "bottom right" } {
  const { ancora, raiz, tela, balao } = params;

  const topoVis = Math.max(0, -raiz.top);
  const fundoVis = Math.min(raiz.height, tela.height - raiz.top);
  const esqVis = Math.max(0, -raiz.left);
  const dirVis = Math.min(raiz.width, tela.width - raiz.left);

  let x = ancora.right - raiz.left - balao.width;
  x = Math.min(
    Math.max(x, esqVis + MARGEM),
    Math.max(esqVis + MARGEM, dirVis - balao.width - MARGEM)
  );

  const abaixo = ancora.bottom - raiz.top + VAO;
  const acima = ancora.top - raiz.top - balao.height - VAO;

  let y = abaixo + balao.height > fundoVis - MARGEM ? acima : abaixo;

  y = Math.min(
    Math.max(y, topoVis + MARGEM),
    Math.max(topoVis + MARGEM, fundoVis - balao.height - MARGEM)
  );

  return {
    x: Math.round(x),
    y: Math.round(y),

    origem: y > ancora.top - raiz.top ? "top right" : "bottom right",
  };
}

export interface MenuOptions {

  escolha?: boolean;

  aoFechar?: () => void;
}

export function ladoDaEscolha(params: {
  ancora: Pick<Caixa, "top" | "bottom">;
  alturaDaTela: number;

  altura: number;
}): { sentido: "baixo" | "cima"; maxHeight: number } {
  const { ancora, alturaDaTela, altura } = params;
  const embaixo = alturaDaTela - MARGEM - ancora.bottom;
  const emCima = ancora.top - MARGEM;
  const sentido = altura <= embaixo || embaixo >= emCima ? "baixo" : "cima";
  return {
    sentido,
    maxHeight: Math.max(0, Math.floor(sentido === "baixo" ? embaixo : emCima)),
  };
}

export function openActions(
  ev: MenuEvent,
  actions: MenuAction[],
  opts: MenuOptions = {}
): void {
  if (actions.length === 0) return;

  const ancoraEl = (ev.currentTarget as HTMLElement | null) ?? null;

  const doc = ancoraEl?.ownerDocument ?? document;
  const win = doc.defaultView ?? window;

  const raizApp = ancoraEl
    ? ancoraEl.closest<HTMLElement>(".corvus-root")
    : doc.querySelector<HTMLElement>(".corvus-root");
  const solto = !raizApp;
  const raiz =
    raizApp ??
    ancoraEl?.closest<HTMLElement>(".modal-container") ??
    doc.body;

  const camada = raiz.createDiv({
    cls: solto ? "corvus-pop-layer is-loose" : "corvus-pop-layer",
  });
  const balao = camada.createDiv({
    cls: opts.escolha ? "corvus-pop is-pick" : "corvus-pop",
    attr: { role: "menu" },
  });
  let fechar = () => {};

  const item = (
    pai: HTMLElement,
    a: MenuAction,
    aoTocar: () => void
  ): HTMLButtonElement => {

    const linha = a.extra ? pai.createDiv({ cls: "corvus-pop-row", attr: { role: "none" } }) : pai;
    const b = linha.createEl("button", {
      cls:
        "corvus-pop-item" +
        (a.danger ? " is-danger" : "") +
        (a.checked ? " is-checked" : ""),

      attr:
        a.checked === undefined
          ? { type: "button", role: "menuitem" }
          : { type: "button", role: "menuitemradio", "aria-checked": String(a.checked) },
    });
    if (a.glyph) {
      b.createSpan({ cls: "corvus-pop-ico corvus-pop-glyph", text: a.glyph });
    } else if (a.icon) {

      const ico = b.createSpan({
        cls: a.color ? "corvus-pop-ico corvus-thing-mark" : "corvus-pop-ico",
      });
      if (a.color) ico.style.color = a.color;

      setIcon(ico, a.icon);
    }
    b.createSpan({ cls: "corvus-pop-label", text: a.label });
    if (a.checked) {
      setIcon(b.createSpan({ cls: "corvus-pop-check" }), "check");
    }
    if (a.children) {
      setIcon(b.createSpan({ cls: "corvus-pop-chev" }), "chevron-right");
    }
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      aoTocar();
    });
    if (a.extra) {
      const { icon, label, run } = a.extra;
      const x = linha.createEl("button", {
        cls: "corvus-pop-extra",
        attr: { type: "button", role: "menuitem", "aria-label": label },
      });
      setIcon(x, icon);
      x.addEventListener("click", (e) => {

        e.stopPropagation();
        run(x);
      });
    }
    return b;
  };

  const desenhar = (itens: MenuAction[], voltar: (() => void) | null): void => {
    while (balao.firstChild) balao.removeChild(balao.firstChild);
    if (voltar) {
      const volta = item(balao, { label: tr("Back"), icon: "chevron-left" }, voltar);
      volta.classList.add("is-back");
    }
    for (const a of itens) {
      item(balao, a, () => {
        if (a.children) {
          desenhar(a.children, () => desenhar(itens, voltar));
          return;
        }
        fechar();
        a.run?.();
      });
    }
    posicionar();
  };

  function posicionar(): void {
    const r = ancoraEl?.getBoundingClientRect?.();

    const base = camada.getBoundingClientRect();

    if (opts.escolha && r && ancoraEl) {

      balao.addClass("is-down");
      balao.removeClass("is-up");
      balao.setCssStyles({ width: `${r.width}px`, maxHeight: "" });
      const { sentido, maxHeight } = ladoDaEscolha({
        ancora: r,
        alturaDaTela: win.innerHeight,
        altura: balao.offsetHeight,
      });
      const baixo = sentido === "baixo";
      balao.toggleClass("is-down", baixo);
      balao.toggleClass("is-up", !baixo);
      ancoraEl.toggleClass("is-open-down", baixo);
      ancoraEl.toggleClass("is-open-up", !baixo);

      balao.setCssStyles({
        left: `${r.left - base.left}px`,
        top: baixo ? `${r.bottom - base.top}px` : "auto",
        bottom: baixo ? "auto" : `${base.bottom - r.top}px`,
        maxHeight: `${maxHeight}px`,
        transformOrigin: baixo ? "top center" : "bottom center",
      });
      return;
    }
    const ancora = r ?? {
      left: (ev.clientX ?? 0) - 1,
      right: (ev.clientX ?? 0) + 1,
      top: (ev.clientY ?? 0) - 1,
      bottom: (ev.clientY ?? 0) + 1,
    };

    const { x, y, origem } = posicaoDoBalao({
      ancora,
      raiz: base,
      tela: { width: win.innerWidth, height: win.innerHeight },

      balao: { width: balao.offsetWidth, height: balao.offsetHeight },
    });

    balao.style.left = `${x}px`;
    balao.style.top = `${y}px`;
    balao.style.transformOrigin = origem;
  }

  desenhar(actions, null);

  const marcado = balao.querySelector<HTMLElement>(".corvus-pop-item.is-checked");
  if (marcado && balao.scrollHeight > balao.clientHeight) {
    balao.scrollTop = Math.max(
      0,
      marcado.offsetTop - (balao.clientHeight - marcado.offsetHeight) / 2
    );
  }
  camada.classList.add("is-open");
  screen();

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();

      if (solto) e.stopPropagation();
      fechar();
    }
  };

  const onScroll = (e: Event) => {
    if (balao.contains(e.target as Node | null)) return;
    fechar();
  };
  const ondeRola: Document | HTMLElement = solto ? doc : raiz;
  fechar = () => {
    doc.removeEventListener("keydown", onKey);
    ondeRola.removeEventListener("scroll", onScroll, { capture: true });
    ancoraEl?.removeClass("is-open-down", "is-open-up");
    camada.remove();
    opts.aoFechar?.();
  };
  camada.addEventListener("click", fechar);
  doc.addEventListener("keydown", onKey);
  ondeRola.addEventListener("scroll", onScroll, { capture: true });
}
