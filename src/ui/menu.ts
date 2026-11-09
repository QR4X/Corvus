// src/ui/menu.ts
// O menu de AÇÕES — o que abre no ⋯ de uma conversa, de um projeto, de um
// skill.
//
// Era o `Menu` do Obsidian. No celular ele sobe como folha colada na base da
// tela, e aí o menu de um item que está no TOPO da lista aparece a quinze
// centímetros dele, embaixo de tudo: você toca em cima, olha em cima, e a
// resposta acontece embaixo. Num aparelho de 6 polegadas isso é perder o fio
// da ação — e com quatro conversas na tela, nada diz de qual delas é o menu.
//
// Aqui ele é um balão ancorado NO BOTÃO: desce logo abaixo dele, alinhado à
// direita, e sobe pra cima quando não há espaço embaixo. A origem do menu é a
// origem do toque, que é a única coisa que ele precisa dizer.
//
// Ele tem DOIS níveis quando precisa (escolher um projeto, por exemplo), e o
// segundo acontece no mesmo balão, no mesmo lugar: a escolha continua ancorada
// no item de onde ela saiu. Folha por cima do menu seria a terceira camada
// empilhada pra decidir uma coisa só.
//
// Imperativo de propósito: ele é chamado de dentro de `onClick` em cinco telas
// diferentes, e virar estado de React em todas elas seria cinco `useState`
// para uma coisa que vive 400ms.

import { setIcon } from "obsidian";
import { screen } from "./haptics";
import { tr } from "../i18n/tr";

/** Menu de ações (⋯ de um chat, de um projeto). */
export interface MenuAction {
  label: string;
  icon?: string;
  /** Um texto curto no LUGAR do ícone (o código de um idioma: "EN", "PT").
   *  Bandeira não existe no set de ícones, e o mesmo desenho de "idioma"
   *  repetido em todas as linhas não diria qual é qual. */
  glyph?: string;
  /** Cor própria do item (a de um projeto). Com ela, o ícone vira BRASÃO: o
   *  mesmo quadrado squircle da lista de projetos, no tom dele. Um menu de
   *  projetos com ícones cinzas perde justamente o que faz um projeto ser
   *  reconhecido de relance. */
  color?: string;
  danger?: boolean;
  /** Opção ATUAL de uma escolha (o filtro de período da home do Agent). */
  checked?: boolean;
  /** Abre um SEGUNDO nível no mesmo balão. Com `children`, o `run` não roda:
   *  quem tem filhos navega. */
  children?: MenuAction[];
  /** Um SEGUNDO botão na ponta da linha (o ▶ de cada voz): age sem escolher
   *  a linha e sem fechar o balão. Recebe o próprio botão, pra quem chama
   *  trocar o desenho dele (▶ → buscando → ■). */
  extra?: { icon: string; label: string; run: (botao: HTMLButtonElement) => void };
  run?: () => void;
}

/** O que basta pra achar a âncora: o alvo do clique e onde ele foi. */
export interface MenuEvent {
  clientX?: number;
  clientY?: number;
  currentTarget?: EventTarget | null;
}

/** Respiro entre o botão e o balão, e entre o balão e a beirada da tela. */
const VAO = 6;
const MARGEM = 10;

/** Um retângulo, do jeito que `getBoundingClientRect` entrega. */
export interface Caixa {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/**
 * Onde o balão pousa — a conta, separada do DOM pra poder ser conferida.
 *
 * As coordenadas de SAÍDA são da camada, que é `absolute` dentro da
 * `.corvus-root`: por isso tudo desconta `raiz`.
 *
 * Mas quem decide se CABE é a TELA, não a raiz — e essa distinção é o bug que
 * esta função existe pra não deixar voltar. No celular a folha vira `fixed` e
 * vai até o fundo do viewport, que é mais alto que a raiz; um ⋯ na parte de
 * baixo da folha está numa altura que a raiz nem alcança. Medindo pela raiz, o
 * balão "cabia" na conta e nascia fora da tela na prática.
 */
export function posicaoDoBalao(params: {
  /** O botão que abriu (coordenadas de viewport). */
  ancora: Pick<Caixa, "left" | "top" | "right" | "bottom">;
  /** A `.corvus-root`, que é a origem das coordenadas da camada. */
  raiz: Caixa;
  /** A tela. */
  tela: { width: number; height: number };
  /** O tamanho do balão já montado. */
  balao: { width: number; height: number };
}): { x: number; y: number; origem: "top right" | "bottom right" } {
  const { ancora, raiz, tela, balao } = params;
  // A faixa visível, em coordenadas da CAMADA. Quando a raiz cabe inteira na
  // tela, isto é simplesmente 0 → raiz.height, e nada muda.
  const topoVis = Math.max(0, -raiz.top);
  const fundoVis = Math.min(raiz.height, tela.height - raiz.top);
  const esqVis = Math.max(0, -raiz.left);
  const dirVis = Math.min(raiz.width, tela.width - raiz.left);

  // Alinhado à DIREITA do botão: o ⋯ mora na ponta direita das listas, e um
  // balão que abre pra dentro segue a leitura em vez de cruzá-la.
  let x = ancora.right - raiz.left - balao.width;
  x = Math.min(
    Math.max(x, esqVis + MARGEM),
    Math.max(esqVis + MARGEM, dirVis - balao.width - MARGEM)
  );

  const abaixo = ancora.bottom - raiz.top + VAO;
  const acima = ancora.top - raiz.top - balao.height - VAO;
  // Sem espaço embaixo, ele sobe: melhor cobrir o que está acima do botão do
  // que nascer fora da tela.
  let y = abaixo + balao.height > fundoVis - MARGEM ? acima : abaixo;
  // E se não couber de nenhum lado (balão alto, tela curta), encosta no topo
  // visível — o começo da lista é o que mais importa ver.
  y = Math.min(
    Math.max(y, topoVis + MARGEM),
    Math.max(topoVis + MARGEM, fundoVis - balao.height - MARGEM)
  );

  return {
    x: Math.round(x),
    y: Math.round(y),
    // A âncora também é o ponto de origem da animação: ele cresce de onde foi
    // tocado.
    origem: y > ancora.top - raiz.top ? "top right" : "bottom right",
  };
}

export interface MenuOptions {
  /** O balão com a largura do botão que o abriu, e rolando quando a lista
   *  passa da tela: é o menu de ESCOLHA das settings, que substitui um
   *  <select> de largura cheia. Sem isto, um balão de 168px pendurado na
   *  ponta direita de um botão de 330 parecia de outro controle. */
  escolha?: boolean;
  /** Roda quando o balão fecha, por qualquer caminho (escolheu, tocou fora,
   *  Esc, rolou a tela): a amostra de uma voz para junto, em vez de seguir
   *  falando sem a lista na tela. */
  aoFechar?: () => void;
}

/**
 * Pra que lado a ESCOLHA das settings abre, e até que altura. Ela sai de
 * dentro do botão que a abriu (pedido do Rafael: "como se todos estivessem na
 * mesma lista"): mesma largura, colada nele, sem vão — o vão é o que fazia
 * parecer outro controle. Abre pra baixo se couber inteira; senão, pro lado
 * com mais espaço, e rola por dentro.
 *
 * Só o lado e o teto: a borda que encosta no botão fica presa na dele (`top`
 * abrindo pra baixo, `bottom` pra cima), então a altura da lista nunca mexe
 * no encaixe. Coordenadas de TELA (as do getBoundingClientRect).
 */
export function ladoDaEscolha(params: {
  ancora: Pick<Caixa, "top" | "bottom">;
  alturaDaTela: number;
  /** A altura que a lista teria inteira. */
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
  // O elemento âncora é guardado AGORA: `currentTarget` de um evento do React
  // é zerado quando o handler termina, e o segundo nível do menu se
  // reposiciona depois disso — sem esta cópia, ele perdia o botão e caía no
  // ponto do toque.
  const ancoraEl = (ev.currentTarget as HTMLElement | null) ?? null;
  // O documento do BOTÃO que abriu o menu, não o global: numa janela
  // destacada do Obsidian (pop-out), `document` é o da janela principal — o
  // balão nasceria na janela errada, longe do item que o pediu. Vale também
  // pras settings do desktop, que no 1.13 abrem em janela própria.
  const doc = ancoraEl?.ownerDocument ?? document;
  const win = doc.defaultView ?? window;

  // ONDE o balão mora. Aberto de dentro do app, na `.corvus-root` dele — a
  // mesma de sempre. Aberto de FORA (as settings são um modal do Obsidian),
  // ele não pode ir pra raiz do painel: ela fica atrás do modal, e o balão
  // abriria escondido. Aí ele mora no próprio modal (some junto quando o
  // modal fecha — o "voltar" do Android fecha o modal sem passar por aqui) ou,
  // sem modal, no body; e a camada vira `fixed`, com a tela como referência.
  const raizApp = ancoraEl
    ? ancoraEl.closest<HTMLElement>(".corvus-root")
    : doc.querySelector<HTMLElement>(".corvus-root");
  const solto = !raizApp;
  const raiz =
    raizApp ??
    ancoraEl?.closest<HTMLElement>(".modal-container") ??
    doc.body;

  // createDiv do Obsidian já ANEXA ao nó — por isso a camada nasce dentro da
  // raiz e o balão dentro dela, em vez de serem anexados no fim. Não há
  // diferença visível: nada pinta até esta tarefa terminar, e a medição do
  // balão (offsetWidth, em `posicionar`) exige estar na árvore de qualquer jeito.
  const camada = raiz.createDiv({
    cls: solto ? "corvus-pop-layer is-loose" : "corvus-pop-layer",
  });
  const balao = camada.createDiv({
    cls: opts.escolha ? "corvus-pop is-pick" : "corvus-pop",
    attr: { role: "menu" },
  });
  let fechar = () => {};

  /** Cria o botão JÁ dentro de `pai` — o createEl do Obsidian anexa. */
  const item = (
    pai: HTMLElement,
    a: MenuAction,
    aoTocar: () => void
  ): HTMLButtonElement => {
    // Com um segundo botão, os dois dividem uma LINHA: botão dentro de botão
    // não existe em HTML (e o leitor de tela leria os dois como um só).
    const linha = a.extra ? pai.createDiv({ cls: "corvus-pop-row", attr: { role: "none" } }) : pai;
    const b = linha.createEl("button", {
      cls:
        "corvus-pop-item" +
        (a.danger ? " is-danger" : "") +
        (a.checked ? " is-checked" : ""),
      // Item de escolha (tem `checked`, mesmo falso) diz pro leitor de tela
      // qual é a opção de agora.
      attr:
        a.checked === undefined
          ? { type: "button", role: "menuitem" }
          : { type: "button", role: "menuitemradio", "aria-checked": String(a.checked) },
    });
    if (a.glyph) {
      b.createSpan({ cls: "corvus-pop-ico corvus-pop-glyph", text: a.glyph });
    } else if (a.icon) {
      // Com cor, o ícone ganha a MESMA plaquinha da lista de projetos
      // (`corvus-thing-mark`): mesma forma, mesmo jeito de tingir — o fundo sai
      // do `currentColor`. Reusar a classe é o que garante que as duas telas
      // não comecem a divergir na terceira mudança.
      const ico = b.createSpan({
        cls: a.color ? "corvus-pop-ico corvus-thing-mark" : "corvus-pop-ico",
      });
      if (a.color) ico.style.color = a.color;
      // O mesmo `setIcon` do resto do app (ver Icon.tsx): o set de ícones é o
      // do Obsidian, então o menu não traz um segundo vocabulário de desenho.
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
        // Nem sobe pra camada (que fecharia o balão), nem escolhe a linha.
        e.stopPropagation();
        run(x);
      });
    }
    return b;
  };

  /** Redesenha o balão num nível. `voltar` existe do segundo em diante. */
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


  /**
   * Onde ele pousa. Medido DEPOIS de estar na árvore — antes disso o balão não
   * tem tamanho, e posição calculada com tamanho zero é chute. Roda de novo a
   * cada nível: o segundo tem outra altura, e um balão ancorado só pelo topo
   * cresceria pra dentro da barra de baixo.
   */
  function posicionar(): void {
    const r = ancoraEl?.getBoundingClientRect?.();
    // A origem das coordenadas do balão é a CAMADA. Dentro do app ela tem a
    // caixa da raiz (inset 0); solta, é `fixed` e cobre a tela — e medir a
    // própria camada vale até se um ancestral do modal mudar a referência do
    // `fixed`.
    const base = camada.getBoundingClientRect();
    // A ESCOLHA sai de dentro do botão: mesma largura, colada nele, pro lado
    // com espaço (ver ladoDaEscolha). O botão ganha a classe do lado em que a
    // lista abriu, pra os cantos dos dois se juntarem num cartão só.
    if (opts.escolha && r && ancoraEl) {
      // Mede já na largura final e com o fio de 1px do encontro (os dois
      // lados põem o mesmo), pra a altura medida ser a que ela vai ter.
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
      // A borda do encontro fica PRESA na do botão: `top` abrindo pra baixo,
      // `bottom` pra cima — aí a altura da lista não mexe no encaixe. E nada
      // de arredondar: no celular as caixas têm fração de pixel, e meio pixel
      // de vão já desenha um risco entre os dois.
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
      // `offsetWidth/Height`, e não o retângulo: o balão nasce com
      // `scale(0.94)` pra crescer, e o retângulo mede o TRANSFORMADO — a conta
      // saía 6% menor e ele pousava 10px pra fora da borda do botão.
      balao: { width: balao.offsetWidth, height: balao.offsetHeight },
    });

    balao.style.left = `${x}px`;
    balao.style.top = `${y}px`;
    balao.style.transformOrigin = origem;
  }

  desenhar(actions, null);
  // Lista que rola (uma escolha longa): abre com a opção de agora à vista,
  // no meio — não no topo, onde ela pode nem estar.
  const marcado = balao.querySelector<HTMLElement>(".corvus-pop-item.is-checked");
  if (marcado && balao.scrollHeight > balao.clientHeight) {
    balao.scrollTop = Math.max(
      0,
      marcado.offsetTop - (balao.clientHeight - marcado.offsetHeight) / 2
    );
  }
  camada.classList.add("is-open");
  screen();

  // ── como ele sai ──────────────────────────────────────────────────────
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      // Solto num modal, o Esc fecha SÓ o balão — não o modal junto.
      if (solto) e.stopPropagation();
      fechar();
    }
  };
  // Rolou a lista atrás: o balão perde a âncora e some, em vez de ficar
  // pairando sobre outro item. Rolar DENTRO dele (uma escolha longa) não conta.
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
