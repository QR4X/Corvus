// src/ui/Sheet.tsx
// Bottom sheet do composer — a folha que sobe de baixo pra escolher provider,
// modelo e effort. Substitui o Menu nativo do Obsidian nesses três seletores
// (o Menu continua servindo pras ações do histórico, que são um menu mesmo).
//
// Anatomia (na referência do app da Claude): puxador, X à esquerda com o
// título centralizado, e o conteúdo em CARDS agrupados — linhas com título +
// legenda, divisória entre elas, a selecionada em accent com um check.
//
// Fecha no scrim, no X e no Esc. Renderiza dentro da .corvus-root (que é
// position: relative), então cobre só o painel da Corvus — nunca o app inteiro.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import { SearchField } from "./SearchField";
import { screen, tap, warn } from "./haptics";
import { drawerInnerOf, syncSheetStrip } from "./sheetStrip";
import { tr } from "../i18n/tr";

/**
 * O jeito de o CONTEÚDO pedir a folha grande.
 *
 * A folha já cresce sozinha quando um campo pega o foco ou quando a pessoa
 * rola — os dois sinais de "o que estou fazendo não cabe nisto". Mas há
 * conteúdo que não dá nenhum dos dois e mesmo assim precisa da tela inteira: o
 * catálogo de ícones é uma grade de vinte, e numa folha do tamanho do conteúdo
 * aparecem duas fileiras. Procurar ali seria rolar às cegas.
 *
 * Contexto, e não uma prop: quem sabe que precisa crescer está três níveis
 * abaixo (folha → formulário → catálogo), e uma prop pra isso seria um
 * `pedeTelaCheia` atravessando dois componentes que não têm nada com o
 * assunto.
 */
const SheetSizeCtx = createContext<{
  expandir: () => void;
  ajustar: () => void;
  restaurar: () => void;
}>({
  expandir: () => {},
  ajustar: () => {},
  restaurar: () => {},
});

/** Pede a folha no tamanho grande, uma vez, ao montar. */
export function useSheetFull(): void {
  const { expandir } = useContext(SheetSizeCtx);
  useEffect(() => {
    expandir();
  }, [expandir]);
}

/**
 * Pede a folha do TAMANHO DO CONTEÚDO — até o tamanho grande, se o conteúdo
 * precisar — enquanto `ativo`.
 *
 * É o tamanho de um formulário. Com o teclado aberto a folha ocupa o que
 * sobra acima dele de qualquer jeito (regra do teclado no CSS); o que muda é
 * quando a pessoa FECHA o teclado. Na folha cheia, o formulário ficava com o
 * campo lá em cima, o botão lá embaixo e um vão vazio no meio. Aqui a folha
 * encolhe até o conteúdo e o botão fica logo depois do campo.
 *
 * `ativo` é dependência, e não uma leitura só na montagem: o formulário tem um
 * nível que pede a folha cheia (o catálogo de ícones, ver useSheetFull) e,
 * quando ele fecha, é aqui que a folha volta a encolher.
 */
export function useSheetFit(ativo: boolean): void {
  const { ajustar } = useContext(SheetSizeCtx);
  useEffect(() => {
    if (ativo) ajustar();
  }, [ativo, ajustar]);
}

/**
 * Devolve a folha ao tamanho com que ela NASCEU (o `startFull` dela), ao
 * montar.
 *
 * A folha não desmonta entre os níveis, então o tamanho que um formulário
 * pediu (useSheetFit) fica pra quem vem depois. Quem não é formulário — a
 * lista, a página de um projeto — chama isto pra voltar ao tamanho da casa.
 */
export function useSheetDefault(): void {
  const { restaurar } = useContext(SheetSizeCtx);
  useEffect(() => {
    restaurar();
  }, [restaurar]);
}

/**
 * Um NÍVEL declarado pelo conteúdo.
 *
 * A folha já tem níveis — lista → projeto → notas —, mas quem os conhece é
 * quem monta a folha. O catálogo de ícones é um nível que nasce três andares
 * abaixo, dentro de um formulário, e a barra de cima não sabia dele: o título
 * continuava dizendo "New skill" enquanto a tela mostrava ícones, e a seta de
 * voltar pulava o formulário inteiro e caía na lista de skills. Voltar
 * desfazia dois toques em vez de um.
 *
 * Com isto o conteúdo EMPRESTA seu título e seu voltar à barra enquanto está
 * na tela, e devolve ao sair. A regra da casa continua de pé: a seta desfaz o
 * toque que trouxe você.
 */
const SheetLevelCtx = createContext<{
  push: (titulo: string, voltar: () => void) => void;
  pop: () => void;
}>({ push: () => {}, pop: () => {} });

export function useSheetLevel(titulo: string, voltar: () => void): void {
  const { push, pop } = useContext(SheetLevelCtx);
  // O callback vive numa ref e o efeito depende só do TÍTULO: `voltar` ganha
  // identidade nova a cada render do filho, e como dependência faria o nível
  // ser desmontado e remontado a cada tecla digitada na tela.
  const ref = useRef(voltar);
  ref.current = voltar;
  useEffect(() => {
    push(titulo, () => ref.current());
    return () => pop();
  }, [titulo, push, pop]);
}

/** Quanto puxar além da borda pra o gesto valer. Menos que isso é solavanco
 *  de rolagem, não intenção. */
const PULL_THRESHOLD = 72;

export function Sheet({
  title,
  mark,
  footer,
  progress,
  action,
  open,
  onClose,
  onBack,
  startFull,
  minSize,
  focusOnOpen = true,
  children,
}: {
  title: string;
  /** Brasão ao lado do título (o ícone e a cor de um projeto). Só onde a coisa
   *  TEM identidade própria — folha de modelo não tem. */
  mark?: { icon: string; color?: string };
  /**
   * A barra de ação da folha, FORA da área que rola.
   *
   * Ela já morou dentro do conteúdo, grudada com `position: sticky`. Sticky
   * com `bottom: 0` não prende o elemento no fim da lista: prende na base da
   * ÁREA VISÍVEL — e quando o teclado abre, a área visível encolhe pra um
   * terço, então o botão era puxado pra cima e pousava no meio do formulário,
   * por cima dos campos. Aqui ele é um irmão do scroller: não tem como
   * cobrir nada, e não depende do tamanho que sobrou.
   */
  footer?: ReactNode;
  /**
   * A fita de progresso, entre o cabeçalho e o que rola.
   *
   * Aqui em cima e não lá embaixo com os botões: progresso é o ENDEREÇO da
   * tela, e endereço se lê junto do título — é a mesma pergunta ("onde eu
   * estou?"), e ela se responde no topo, antes de olhar o campo. No pé ela
   * dividia lugar com o que a tela quer que você FAÇA, que é outra coisa.
   *
   * Fora do scroller, como o rodapé: dentro dele a fita rolava pra fora na
   * primeira arrastada e o progresso sumia justamente em quem está rolando
   * atrás do que falta.
   */
  progress?: ReactNode;
  /**
   * A ação da BARRA — o "+" que cria mais um do que a folha lista.
   *
   * Ela mora em cima porque é o que a folha OFERECE, não o que ela conclui: o
   * rodapé é de quem termina alguma coisa (salvar, começar a conversa deste
   * projeto), e um "criar" ali embaixo disputava o lugar com o fim do assunto.
   */
  action?: {
    icon: string;
    /** O nome inteiro, pro leitor de tela e pro toque longo. */
    label: string;
    /** O que aparece ESCRITO ao lado do ícone ("New"). Sem ele, um "+" na
     *  ponta de uma barra que começa com um "X" é o mesmo desenho girado 45° —
     *  e a pessoa fecha a folha achando que está criando. */
    text?: string;
    onClick: () => void;
  };
  open: boolean;
  onClose: () => void;
  /** Quando existe, a folha está num nível interno: o X vira seta de voltar
   *  (e o X migra pra direita, pra fechar continuar a um toque). */
  onBack?: () => void;
  /** Nasce no tamanho grande. É o caso da busca: ela abre com o teclado, e o
   *  teclado já come metade — abrir pequena deixaria dois resultados à vista
   *  e obrigaria a um arrasto antes de ler qualquer coisa. */
  startFull?: boolean;
  /**
   * Um PISO pro tamanho pequeno: a folha nunca fica menor que isto, mesmo com
   * pouco conteúdo.
   *
   * É o caso dos projetos. Como o pequeno é "a altura do conteúdo", uma lista
   * de dois projetos abria uma folha de dois dedos — e o tamanho da folha
   * virava uma informação sobre o acervo em vez de uma sobre a tela. Com o
   * piso, ela abre no mesmo lugar toda vez, e quem tem dois projetos vê o
   * espaço onde os outros vão entrar.
   *
   * Piso, e não `startFull`: continua sendo o tamanho PEQUENO da folha, então
   * o gesto não muda — pra cima cresce, pra baixo fecha, e voltar do grande
   * pousa aqui em vez de encolher até o conteúdo.
   */
  minSize?: "mid";
  /** Por padrão o painel toma o foco ao abrir (é o que faz o teclado físico
   *  navegar a folha). Quem tem um campo lá dentro que abre COM teclado passa
   *  `false`: senão o painel rouba o foco do campo — o efeito do pai roda
   *  depois do efeito do filho, e o campo apagava. */
  focusOnOpen?: boolean;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  /**
   * A raiz da Corvus — pra onde o rodapé vai com o teclado aberto.
   *
   * Com o teclado aberto, o rodapé NÃO é desenhado dentro da folha: ele vai
   * pra uma camada na raiz, idêntica à do painel da assistente (ver
   * `.corvus-float-foot` no CSS). O motivo é medido, não teórico: no aparelho, no
   * MESMO quadro, com a barra de ferramentas do SwiftKey visível, o cartão da
   * assistente terminava no topo do teclado e o botão da folha ficava cortado
   * por ele. Os dois moram na mesma caixa; só a folha errava, e o preview
   * nunca reproduziu por quê. Em vez de mais uma teoria sobre a folha, o
   * botão passa a não depender dela: usa o mecanismo que está confirmado.
   *
   * Fechado o teclado, a camada fica escondida por CSS e o rodapé de sempre,
   * dentro da folha, é o que aparece. Os dois são renderizados; quem decide
   * qual se vê é a classe do teclado, sem estado nenhum aqui.
   */
  const [raiz, setRaiz] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setRaiz(panelRef.current?.closest<HTMLElement>(".corvus-root") ?? null);
  }, []);

  // A faixa da barra de gestos (ver ui/sheetStrip.ts). Depois do commit a
  // camada já tem o `is-open` novo: recalcula. Na limpeza — fechar, ou a folha
  // ser desmontada aberta — recalcula de novo, mas ADIADO: o Preact roda as
  // limpezas antes de tirar o DOM, e na hora a camada ainda estaria lá aberta.
  useLayoutEffect(() => {
    const inner = drawerInnerOf(panelRef.current);
    syncSheetStrip(inner);
    return () => {
      queueMicrotask(() => syncSheetStrip(inner));
    };
  }, [open]);
  /** peek = altura do conteúdo (teto baixo) · full = quase a tela toda ·
   *  fit = altura do conteúdo, com o teto do grande (ver useSheetFit). */
  const [size, setSize] = useState<"peek" | "full" | "fit">(
    startFull ? "full" : "peek"
  );
  const startY = useRef<number | null>(null);
  const dragY = useRef(0);
  /** O gesto lê o tamanho por REF: os listeners nativos são registrados uma vez
   *  por abertura, e um `size` capturado no fecho ficaria velho — foi o que fez
   *  a folha grande FECHAR onde devia só encolher. */
  const sizeRef = useRef(size);
  sizeRef.current = size;

  // A identidade de `expandir` é ESTÁVEL de propósito: quem usa (useSheetFull)
  // põe isto numa dependência de efeito, e uma função nova a cada render faria
  // o efeito rodar sem parar — ou seja, a folha voltaria a crescer sozinha
  // logo depois de a pessoa arrastá-la pra baixo.
  const expandir = useCallback(() => setSize("full"), []);
  const ajustar = useCallback(() => setSize("fit"), []);
  const restaurar = useCallback(
    () => setSize(startFull ? "full" : "peek"),
    [startFull]
  );
  const api = useMemo(
    () => ({ expandir, ajustar, restaurar }),
    [expandir, ajustar, restaurar]
  );

  /** O nível que o conteúdo emprestou, se houver (ver useSheetLevel). */
  const [interno, setInterno] = useState<{
    titulo: string;
    voltar: () => void;
  } | null>(null);
  const nivelApi = useMemo(
    () => ({
      push: (titulo: string, voltar: () => void) =>
        setInterno({ titulo, voltar }),
      pop: () => setInterno(null),
    }),
    []
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    // O documento do painel, não o global: numa janela destacada do
    // Obsidian eles são documentos diferentes.
    const doc = panelRef.current?.ownerDocument ?? document;
    doc.addEventListener("keydown", onKey);
    return () => doc.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // O foco é da ABERTURA, e só dela. Junto do listener acima ele dependia de
  // `onClose`, que muda de identidade a cada render do pai — então o painel
  // roubava o foco de volta a cada tecla digitada na busca (o teclado fechava
  // sozinho), e cada roubada era mais uma chance de rolar a tela.
  //
  // `preventScroll` é o que tira o PULO: sem ele o navegador rola o ancestral
  // pra "revelar" o painel, que nesse instante ainda está em translateY(100%),
  // fora da tela.
  useEffect(() => {
    if (!open) return;
    if (focusOnOpen) panelRef.current?.focus({ preventScroll: true });
    // A lista começa do começo: reabrir no meio de onde parou parece que a
    // folha nasceu torta.
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [open, focusOnOpen]);

  // Um CAMPO ganhou o foco: o teclado vem junto, e folha pequena com teclado
  // aberto é um campo e mais nada — o que se está escrevendo fica sem
  // contexto e a lista de resultados, se houver, fica atrás do teclado. Ela
  // cresce sozinha, que é o gesto que a pessoa faria na mão.
  //
  // É isto que deixa a folha nascer do TAMANHO DO CONTEÚDO: sem a regra, toda
  // folha com um campo dentro precisava nascer grande por precaução — e uma
  // ficha de três linhas abria ocupando a tela inteira.
  useEffect(() => {
    const el = panelRef.current;
    if (!open || !el) return;
    const aoFocar = (e: FocusEvent) => {
      const alvo = e.target as HTMLElement | null;
      const tag = alvo?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") setSize("full");
    };
    el.addEventListener("focusin", aoFocar);
    return () => el.removeEventListener("focusin", aoFocar);
  }, [open]);

  // ROLOU pra ver o que está embaixo: a folha cresce. Se há mais conteúdo do
  // que cabe, o tamanho de agora é pequeno demais pro que a pessoa está
  // fazendo — e ela já disse isso com o dedo. Crescer é responder ao gesto
  // que ela fez, em vez de exigir um segundo (arrastar o puxador).
  //
  // Só na descida e uma vez por abertura: crescer e encolher conforme a
  // rolagem faria a folha respirar debaixo do dedo.
  useEffect(() => {
    const el = bodyRef.current;
    if (!open || !el) return;
    const aoRolar = () => {
      if (el.scrollTop > 8) setSize("full");
    };
    el.addEventListener("scroll", aoRolar, { passive: true });
    return () => el.removeEventListener("scroll", aoRolar);
  }, [open]);

  // Fechou: volta pro tamanho de nascença, senão a próxima abre do tamanho
  // que a anterior ficou depois do arrasto.
  useEffect(() => {
    if (!open) setSize(startFull ? "full" : "peek");
  }, [open, startFull]);

  // Abrir e fechar são eventos de TELA, não toques: pulso um tico mais longo.
  // Só na TROCA: o efeito também roda na montagem, e com quatro folhas
  // montadas junto com o chat isso virava uma saraivada de pulsos na abertura
  // do app — sem nada ter acontecido.
  const montado = useRef(false);
  useEffect(() => {
    if (!montado.current) {
      montado.current = true;
      return;
    }
    screen();
  }, [open]);

  // ── arrasto no puxador ──────────────────────────────────────────────────
  // Pra cima cresce, pra baixo encolhe e, já pequena, fecha. Enquanto arrasta
  // a folha acompanha o dedo (com resistência pra cima, que é o limite).
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    startY.current = e.clientY;
    dragY.current = 0;
    // Mesma razão do microfone: capturar é bom, mas lançar aqui mataria o
    // arrasto inteiro. Sem captura o gesto segue funcionando sobre o puxador.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* segue sem captura */
    }
    panelRef.current?.classList.add("is-dragging");
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (startY.current === null) return;
    const dy = e.clientY - startY.current;
    dragY.current = dy;
    const el = panelRef.current;
    // dy > 0 (pra baixo) segue o dedo; pra cima só 35%, que é o "encosto".
    if (el) el.style.transform = `translateY(${Math.max(dy, dy * 0.35)}px)`;
  };

  const onPointerUp = () => {
    if (startY.current === null) return;
    const dy = dragY.current;
    startY.current = null;
    const el = panelRef.current;
    if (el) {
      el.setCssStyles({ transform: "" });
      el.classList.remove("is-dragging");
    }
    if (dy < -48) {
      setSize("full");
      tap();
    } else if (dy > 48) {
      if (size === "full") setSize("peek");
      else onClose();
      tap();
    }
  };

  // ── arrasto no CONTEÚDO (puxar além da borda fecha) ─────────────────────
  // Listener NATIVO, e não prop do React, por um motivo só: `touchmove` precisa
  // ser não-passivo pra poder chamar preventDefault. Com pointer events o
  // navegador assumia o gesto no scroller e disparava `pointercancel` — a
  // folha andava dois píxeis e voltava (a "tremida"), sem nunca fechar.
  useEffect(() => {
    const el = bodyRef.current;
    const panel = panelRef.current;
    if (!open || !el || !panel) return;

    let y0: number | null = null;
    let dy = 0;
    let borda: "top" | "bottom" | null = null;

    /**
     * O gesto de arrastar a folha NÃO começa dentro de um campo de texto.
     *
     * Escrever num celular é arrastar o dedo: pra pôr o cursor entre duas
     * letras, pra selecionar uma palavra, pra puxar a alcinha da seleção. Cada
     * um desses toques começava aqui, e um deles — a folha no topo da rolagem,
     * o dedo descendo — era engolido como "puxar pra fechar": o
     * `preventDefault` do move matava a seleção, e a folha ainda dava um pulo.
     * Editar virava sorte.
     */
    const emCampoDeTexto = (alvo: EventTarget | null): boolean => {
      const el = alvo as HTMLElement | null;
      const campo = el?.closest?.(
        "input, textarea, [contenteditable='true']"
      ) as HTMLElement | null;
      if (!campo) return false;
      // Só protege o campo em que se está ESCREVENDO.
      //
      // Proteger todo campo era largo demais: a busca da folha de skills mora
      // no terço de cima, que é justamente onde o dedo começa o swipe pra
      // baixo — e a folha parou de descer. Mas o gesto que a gente precisa
      // preservar (pôr o cursor, selecionar, puxar a alcinha) só acontece
      // DENTRO do campo que já tem o foco. Campo sem foco é superfície como
      // qualquer outra.
      return campo.ownerDocument.activeElement === campo;
    };

    const comecar = (y: number) => {
      const noTopo = el.scrollTop <= 0;
      const noFim = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      // Lista que cabe inteira está nas DUAS bordas; puxar pra baixo é o gesto
      // que todo mundo tenta primeiro, então ela conta como "no topo".
      borda = noTopo ? "top" : noFim ? "bottom" : null;
      y0 = y;
      dy = 0;
    };

    /** Devolve true quando o gesto é NOSSO (aí o move é engolido). */
    const mover = (y: number): boolean => {
      if (y0 === null || borda === null) return false;
      const d = y - y0;
      const puxando =
        (borda === "top" && d > 0) || (borda === "bottom" && d < 0);
      if (!puxando) {
        dy = 0;
        panel.setCssStyles({ transform: "" });
        return false;
      }
      dy = d;
      panel.classList.add("is-dragging");
      // Pra baixo segue o dedo; pra cima cede pouco — não há pra onde ir, o
      // gesto ali é só a intenção de fechar.
      panel.style.transform = `translateY(${d > 0 ? d : d * 0.25}px)`;
      return true;
    };

    const soltar = () => {
      const b = borda;
      const d = dy;
      y0 = null;
      borda = null;
      dy = 0;
      panel.setCssStyles({ transform: "" });
      panel.classList.remove("is-dragging");
      // Uma direção, um significado — o mesmo do puxador, e o mesmo em toda
      // folha: PRA CIMA cresce, PRA BAIXO diminui e, já pequena, fecha.
      if (b === "top" && d > PULL_THRESHOLD) {
        if (sizeRef.current === "full") setSize("peek");
        else onClose();
        tap();
      } else if (b === "bottom" && d < -PULL_THRESHOLD) {
        setSize("full");
        tap();
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      if (emCampoDeTexto(e.target)) {
        // Desarma: sem isto, um `touchmove` que saísse do campo continuaria
        // com a borda armada do toque anterior.
        y0 = null;
        borda = null;
        return;
      }
      if (e.touches.length === 1) comecar(e.touches[0].clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      if (mover(e.touches[0].clientY) && e.cancelable) e.preventDefault();
    };
    // Mouse (desktop e preview): o navegador não sequestra, pointer basta.
    const onDown = (e: PointerEvent) => {
      if (emCampoDeTexto(e.target)) return;
      if (e.pointerType !== "touch") comecar(e.clientY);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "touch") mover(e.clientY);
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType !== "touch") soltar();
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", soltar);
    el.addEventListener("touchcancel", soltar);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", soltar);
      el.removeEventListener("touchcancel", soltar);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [open, onClose]);

  return (
    <div
      className={open ? "corvus-sheet-layer is-open" : "corvus-sheet-layer"}
      aria-hidden={!open}
    >
      <div className="corvus-scrim" onClick={onClose} />
      <div
        ref={panelRef}
        className={
          size === "full"
            ? "corvus-sheet is-full"
            : size === "fit"
              ? "corvus-sheet is-fit"
              : minSize === "mid"
                ? "corvus-sheet is-mid"
                : "corvus-sheet"
        }
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div
          className="corvus-sheet-drag"
          title={tr("Drag to resize")}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="corvus-sheet-grab" aria-hidden="true" />
        </div>
        <header className="corvus-sheet-head">
          <button
            type="button"
            className="corvus-icon-btn"
            aria-label={interno || onBack ? tr("Back") : tr("Close")}
            onClick={interno ? interno.voltar : (onBack ?? onClose)}
          >
            <Icon name={interno || onBack ? "chevron-left" : "x"} />
          </button>
          <h3 className="corvus-sheet-title">
            {/* A marca vive COM o nome, que é o único lugar onde ela não vira
                um segundo objeto na tela. Antes ela era uma pílula logo
                abaixo, repetindo o nome que já estava aqui — e com cara de
                botão, porque pílula com contorno, neste app, é coisa que se
                toca. */}
            {mark && (
              <span
                className="corvus-sheet-mark"
                style={mark.color ? { color: mark.color } : undefined}
                aria-hidden="true"
              >
                <Icon name={mark.icon} size={16} />
              </span>
            )}
            <span className="corvus-sheet-title-text">
              {interno?.titulo ?? title}
            </span>
          </h3>
          {/* Espelha a largura do botão pra manter o título no centro óptico —
              e no nível interno esse lugar é do X. */}
          {action && (
            <button
              type="button"
              className="corvus-sheet-action"
              aria-label={action.label}
              title={action.label}
              onClick={action.onClick}
            >
              <Icon name={action.icon} size={18} />
              {action.text && <span>{action.text}</span>}
            </button>
          )}
          {interno || onBack ? (
            <button
              type="button"
              className="corvus-icon-btn"
              aria-label={tr("Close")}
              onClick={onClose}
            >
              <Icon name="x" />
            </button>
          ) : (
            !action && (
              <span className="corvus-sheet-head-spacer" aria-hidden="true" />
            )
          )}
        </header>
        {progress}
        <div ref={bodyRef} className="corvus-sheet-body">
          <SheetSizeCtx.Provider value={api}>
            <SheetLevelCtx.Provider value={nivelApi}>
              {children}
            </SheetLevelCtx.Provider>
          </SheetSizeCtx.Provider>
        </div>
        {footer && <div className="corvus-sheet-actions">{footer}</div>}
      </div>
      {/* O MESMO rodapé, na camada da raiz — só aparece com o teclado aberto
          (ver `raiz`, logo no começo do componente). */}
      {open && footer && raiz
        ? createPortal(
            <div className="corvus-float-foot">
              <div className="corvus-float-foot-card">{footer}</div>
            </div>,
            raiz
          )
        : null}
    </div>
  );
}

/** Cartão que agrupa linhas (divisória entre elas, cantos arredondados). */
/** A fileira de três do topo da folha — os caminhos principais, grandes o
 *  bastante pra acertar com o polegar. O que é secundário desce pra lista. */
export function SheetTiles({ children }: { children: ReactNode }) {
  return <div className="corvus-sheet-tiles">{children}</div>;
}

export function SheetTile({
  icon,
  label,
  /** Explicação curta quando o caminho não está disponível agora. */
  hint,
  disabled,
  onClick,
}: {
  icon: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={disabled ? "corvus-sheet-tile is-off" : "corvus-sheet-tile"}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} size={26} />
      <span className="corvus-sheet-tile-label">{label}</span>
      {hint && <span className="corvus-sheet-tile-hint">{hint}</span>}
    </button>
  );
}

/** Campo de busca no topo de uma folha (lista de notas). Fica ACIMA da lista
 *  de propósito: com o teclado aberto, o que sobra de tela é o topo. */
/**
 * A busca da folha É a busca do app (SearchField) — mesmo componente, mesma
 * pílula, mesma contagem de achados. O que a folha acrescenta é o respiro
 * até a lista.
 *
 * O teclado NÃO abre sozinho por padrão: numa folha ele cobre metade da
 * lista, e quem abriu a folha de modelos abriu pra ESCOLHER. Quem entrou num
 * nível que só existe pra buscar (as notas) pede `autoFocus` e aí sim.
 */
export function SheetSearch({
  value,
  placeholder,
  onChange,
  found,
  invalid,
  autoFocus,
}: {
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  found?: number;
  /** A expressão não compila como regex — caiu em busca literal. */
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <div className="corvus-sheet-search">
      <SearchField
        value={value}
        placeholder={placeholder}
        found={found}
        invalid={invalid}
        autoFocus={autoFocus}
        onChange={onChange}
      />
    </div>
  );
}

export function SheetGroup({
  children,
  label,
}: {
  children: ReactNode;
  /** Título acima do cartão. Sem ele, o grupo não se apresenta — é o caso de
   *  quando só existe um. */
  label?: string;
}) {
  if (!label) return <div className="corvus-sheet-group">{children}</div>;
  return (
    <div className="corvus-sheet-block">
      <span className="corvus-sheet-group-label">{label}</span>
      <div className="corvus-sheet-group">{children}</div>
    </div>
  );
}

/**
 * Abas de TEXTO dentro da folha (as categorias de modelo).
 *
 * Rolam na horizontal em vez de dividir a largura em partes iguais: com cinco
 * ou seis categorias num aparelho de 375px, um segmentado fixo espreme
 * "Reasoning" até virar "Reas…". Aqui cada aba tem o tamanho do nome dela e a
 * fileira anda — e a contagem ao lado diz quanto tem lá dentro antes do toque.
 */
export function SheetTabs({
  items,
  activeId,
  onPick,
  label,
}: {
  items: { id: string; label: string; count: number }[];
  activeId: string;
  onPick: (id: string) => void;
  label: string;
}) {
  return (
    <div className="corvus-sheet-tabs" role="group" aria-label={label}>
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          className={
            it.id === activeId
              ? "corvus-sheet-tab is-active"
              : "corvus-sheet-tab"
          }
          aria-pressed={it.id === activeId}
          onClick={() => onPick(it.id)}
        >
          <span>{it.label}</span>
          <span className="corvus-sheet-tab-count">{it.count}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Segmented control DENTRO da folha — hoje, os providers. Colunas iguais
 * (são todos logos, mesma largura), então o thumb é só o índice ativo: nada
 * de medir nó, ao contrário do das Settings, onde os rótulos têm larguras
 * diferentes.
 */
export function SheetSeg({
  items,
  activeId,
  onPick,
  onBlocked,
  label,
}: {
  items: {
    id: string;
    icon: string;
    label: string;
    /** Bolinha de conexão. Bloqueado (off/fail) também não é clicável. */
    health?: "off" | "unknown" | "ok" | "fail";
    /** Por que está bloqueado — vira o tooltip. */
    blocked?: string | null;
  }[];
  activeId: string;
  onPick: (id: string) => void;
  /** Tocou num bloqueado. `insistiu` = é o segundo toque seguido no MESMO
   *  item — o momento de explicar em vez de só recusar. */
  onBlocked?: (id: string, motivo: string, insistiu: boolean) => void;
  label: string;
}) {
  const index = Math.max(
    items.findIndex((i) => i.id === activeId),
    0
  );
  /** Último bloqueado tocado, pra saber quando o toque é insistência. */
  const [insistindo, setInsistindo] = useState<string | null>(null);
  return (
    <div
      className="corvus-sheet-seg"
      role="group"
      aria-label={label}
      style={
        {
          "--corvus-seg": index,
          "--corvus-seg-count": items.length,
        } as CSSProperties
      }
    >
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          className={
            "corvus-sheet-seg-item" +
            (it.id === activeId ? " is-active" : "") +
            (it.blocked ? " is-blocked" : "")
          }
          aria-pressed={it.id === activeId}
          aria-label={it.label}
          title={it.blocked ? `${it.label} — ${it.blocked}` : it.label}
          /* `aria-disabled` em vez de `disabled`: o botão continua RECEBENDO o
             toque (senão não dá pra explicar por que ele não funciona), mas
             não troca de provider. */
          aria-disabled={!!it.blocked && it.id !== activeId}
          onClick={() => {
            const travado = !!it.blocked && it.id !== activeId;
            if (!travado) {
              setInsistindo(null);
              onPick(it.id);
              return;
            }
            warn();
            onBlocked?.(it.id, it.blocked ?? "", insistindo === it.id);
            setInsistindo(it.id);
          }}
        >
          <span className="corvus-sheet-seg-mark">
            <Icon name={it.icon} size={20} />
            {it.health && (
              <span
                className={`corvus-seg-dot is-${it.health}`}
                aria-hidden="true"
              />
            )}
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * Linha que ABRE outro nível na mesma folha (o "Show list ›"). Não escolhe
 * nada: navega. Por isso o chevron pra direita, e não um check.
 */
export function SheetNavRow({
  title,
  note,
  icon,
  onClick,
}: {
  title: string;
  note?: string;
  /** Ícone Lucide num brasão redondo à esquerda (como na referência). */
  icon?: string;
  onClick: () => void;
}) {
  // O valor vai ao LADO do chevron, não numa segunda linha: a linha de
  // navegação não precisa de duas alturas pra dizer "Effort · Med".
  return (
    <button type="button" className="corvus-sheet-row is-nav" onClick={onClick}>
      {icon && (
        <Icon
          name={icon}
          size={20}
          className="corvus-sheet-row-icon is-badge"
        />
      )}
      <span className="corvus-sheet-row-title">{title}</span>
      {note && <span className="corvus-sheet-row-value">{note}</span>}
      <Icon name="chevron-right" size={18} className="corvus-sheet-chev" />
    </button>
  );
}

/**
 * Linha que LIGA e DESLIGA, no mesmo cartão das que navegam.
 *
 * O interruptor fica à direita, onde o chevron estaria: quem lê a fileira de
 * cima pra baixo aprende num golpe o que cada linha faz — seta leva a outro
 * lugar, chave muda alguma coisa aqui mesmo.
 *
 * A linha INTEIRA é o alvo, não só a chavinha: num telefone, acertar 34px de
 * chave é pior do que acertar a linha toda, e o estado é o mesmo.
 */
export function SheetToggleRow({
  title,
  note,
  icon,
  on,
  onToggle,
}: {
  title: string;
  note?: string;
  icon?: string;
  on: boolean;
  onToggle: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="corvus-sheet-row is-nav"
      role="switch"
      aria-checked={on}
      onClick={() => onToggle(!on)}
    >
      {icon && (
        <Icon name={icon} size={20} className="corvus-sheet-row-icon is-badge" />
      )}
      <span className="corvus-sheet-row-title">{title}</span>
      {note && <span className="corvus-sheet-row-value">{note}</span>}
      {/* `aria-hidden`: quem anuncia o estado é o `role="switch"` da linha —
          a chave é o desenho dele, não um segundo controle. */}
      <span
        className={on ? "corvus-switch is-on" : "corvus-switch"}
        aria-hidden="true"
      >
        <span className="corvus-switch-bola" />
      </span>
    </button>
  );
}

/** Linha de recado dentro do cartão (lista vazia, aviso). */
export function SheetNote({ children }: { children: ReactNode }) {
  return <p className="corvus-sheet-note">{children}</p>;
}

export function SheetRow({
  title,
  note,
  tag,
  selected,
  dense,
  icon,
  iconTone,
  badge,
  chevron,
  action,
  onClick,
}: {
  title: string;
  /** Legenda em uma linha, abaixo do título. */
  note?: string;
  /** Etiqueta ao lado do título ("Default"). */
  tag?: string;
  selected?: boolean;
  /** Uma linha só (nome à esquerda, legenda à direita). Pra lista longa —
   *  onze ações em duas linhas cada viram rolagem sem fim. */
  dense?: boolean;
  /** Ícone Lucide à esquerda. Só onde ele DIZ algo que o texto não diz (ler,
   *  procurar, apagar); lista de modelos continua sem — lá o ícone era
   *  decoração e por isso saiu. */
  icon?: string;
  /** "danger" pinta o ícone de vermelho (ação que falhou). */
  iconTone?: "danger";
  /** Ícone dentro de um círculo (linhas de destino, como no "+"). */
  badge?: boolean;
  /** Seta à direita — a linha leva pra outro lugar. */
  chevron?: boolean;
  /** Botão SEPARADO na ponta direita (a estrela de favorito). Fica fora do
   *  botão da linha porque botão dentro de botão não existe — e porque são
   *  duas ações diferentes: uma escolhe, a outra marca. */
  action?: {
    icon: string;
    label: string;
    on?: boolean;
    onClick: () => void;
  };
  onClick: () => void;
}) {
  const linha = (
    <button
      type="button"
      className={
        "corvus-sheet-row" +
        (selected ? " is-active" : "") +
        (dense ? " is-dense" : "")
      }
      aria-pressed={selected === true}
      onClick={onClick}
    >
      {icon && (
        <Icon
          name={icon}
          size={badge ? 20 : dense ? 16 : 18}
          className={
            (badge ? "corvus-sheet-row-icon is-badge" : "corvus-sheet-row-icon") +
            (iconTone === "danger" ? " is-danger" : "")
          }
        />
      )}
      {dense ? (
        <>
          <span className="corvus-sheet-row-title">
            {title}
            {tag && <span className="corvus-sheet-tag">{tag}</span>}
          </span>
          {note && <span className="corvus-sheet-row-value">{note}</span>}
        </>
      ) : (
        <span className="corvus-sheet-row-main">
          <span className="corvus-sheet-row-title">
            {title}
            {tag && <span className="corvus-sheet-tag">{tag}</span>}
          </span>
          {note && <span className="corvus-sheet-row-note">{note}</span>}
        </span>
      )}
      {selected && <Icon name="check" size={20} className="corvus-sheet-check" />}
      {chevron && (
        <Icon name="chevron-right" size={18} className="corvus-sheet-chev" />
      )}
    </button>
  );
  if (!action) return linha;
  return (
    <div className="corvus-sheet-row-wrap">
      {linha}
      <button
        type="button"
        className={
          action.on
            ? "corvus-sheet-row-action is-on"
            : "corvus-sheet-row-action"
        }
        aria-label={action.label}
        aria-pressed={action.on === true}
        title={action.label}
        onClick={action.onClick}
      >
        <Icon name={action.icon} size={18} />
      </button>
    </div>
  );
}
