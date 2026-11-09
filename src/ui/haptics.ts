// src/ui/haptics.ts
// Feedback tátil. Uma única porta pro `navigator.vibrate`, com vocabulário —
// `tap` não é a mesma coisa que `commit`, e o dedo sabe a diferença.
//
// O QUE ISTO NÃO FAZ, e não dá pra fazer: iPhone. O WebKit não expõe vibração
// pra página (a Apple só libera o Taptic Engine pro app nativo). Então isto é
// Android na prática — e o `can()` abaixo simplesmente não faz nada nos
// aparelhos onde a API não existe, em vez de fingir.
//
// Desktop fica de fora de propósito: mouse não tem tato, e um motor de
// vibração num notebook (alguns têm) seria ruído.

import { Platform } from "obsidian";

/** Espelha `settings.hapticsEnabled` — o CorvusView mantém em dia. */
let enabled = true;

export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

function can(): boolean {
  return (
    enabled &&
    Platform.isMobile &&
    typeof navigator !== "undefined" &&
    typeof navigator.vibrate === "function"
  );
}

function buzz(pattern: number | number[]): void {
  if (!can()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* aparelho recusou — segue sem tato */
  }
}

/** Toque comum: botão, item de lista, aba. O mais curto que se sente. */
export function tap(): void {
  buzz(8);
}

/** Algo ABRIU ou FECHOU: folha, menu, tela. Um tico mais longo que o toque. */
export function screen(): void {
  buzz(14);
}

/** Confirmou algo que vai embora: enviar, usar a transcrição. Dois pulsos. */
export function commit(): void {
  buzz([12, 30, 18]);
}

/** Deu errado ou foi descartado: mais grave, ninguém confunde com sucesso. */
export function warn(): void {
  buzz([20, 45, 20]);
}

/**
 * Liga o tato em TODO clique dentro de uma árvore. Existe pra não depender de
 * alguém lembrar de chamar `tap()` em cada botão novo — o que acaba sempre com
 * metade da tela muda. Os momentos com significado próprio (abrir, enviar,
 * descartar) continuam chamando o seu.
 *
 * O pulso sai no SOLTAR, e só quando o dedo se comportou como toque: andou
 * menos de 8px e ficou menos de 700ms. Antes saía no `pointerdown`, pra chegar
 * junto com o dedo — mas em `pointerdown` ninguém sabe ainda o que o dedo vai
 * fazer. Encostar numa lista pra ROLAR começa exatamente igual a tocar, e a
 * lista inteira é feita de botões: descer a home ou uma conversa virava uma
 * sequência de pulsos sem nenhuma ação por trás. Tato que dispara sem ação
 * deixa de significar ação.
 *
 * O atraso é o tempo que a própria pessoa segurou, e o pulso cai no mesmo
 * instante em que o `click` acontece — junto com o que aparece na tela.
 */
/** Quanto o dedo pode andar e ainda ser toque, não rolagem. */
const FOLGA = 8;
/** Acima disto é toque longo/arrasto: o pulso já não é resposta a nada. */
const LIMITE_MS = 700;

/**
 * O gesto foi um TOQUE? É a regra que separa tocar de rolar, e ela é pura de
 * propósito: é o único pedaço do tato que dá pra provar sem um aparelho na
 * mão.
 */
export function ehToque(dx: number, dy: number, ms: number): boolean {
  return Math.abs(dx) <= FOLGA && Math.abs(dy) <= FOLGA && ms <= LIMITE_MS;
}

export function hapticsOn(root: HTMLElement): () => void {
  let alvo: Element | null = null;
  let x = 0;
  let y = 0;
  let em = 0;

  const acionavel = (e: Event): Element | null => {
    const el = e.target as HTMLElement | null;
    if (!el?.closest) return null;
    return el.closest(
      'button, a, [role="button"], input[type="checkbox"], .checkbox-container, select, .corvus-sheet-row, .corvus-seg-item'
    );
  };

  const onDown = (e: Event) => {
    const p = e as PointerEvent;
    alvo = acionavel(e);
    x = p.clientX;
    y = p.clientY;
    em = Date.now();
  };

  const onUp = (e: Event) => {
    const p = e as PointerEvent;
    const era = alvo;
    alvo = null;
    if (!era) return;
    // Soltou em cima de outra coisa: foi arrasto, não toque.
    if (era !== acionavel(e)) return;
    if (!ehToque(p.clientX - x, p.clientY - y, Date.now() - em)) return;
    tap();
  };

  const onCancel = () => {
    alvo = null;
  };

  root.addEventListener("pointerdown", onDown, { capture: true });
  root.addEventListener("pointerup", onUp, { capture: true });
  root.addEventListener("pointercancel", onCancel, { capture: true });
  return () => {
    root.removeEventListener("pointerdown", onDown, true);
    root.removeEventListener("pointerup", onUp, true);
    root.removeEventListener("pointercancel", onCancel, true);
  };
}
