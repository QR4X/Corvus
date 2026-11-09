export const FOLLOW_SLACK = 72;

export interface ScrollLike {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export function distanceFromBottom(el: ScrollLike): number {
  return Math.max(0, el.scrollHeight - el.scrollTop - el.clientHeight);
}

export function shouldFollow(el: ScrollLike, slack = FOLLOW_SLACK): boolean {
  return distanceFromBottom(el) <= slack;
}

export function wasAtBottom(
  alturaAnterior: number,
  scrollTop: number,
  clientHeight: number,
  slack = FOLLOW_SLACK
): boolean {
  const distancia = Math.max(0, alturaAnterior - scrollTop - clientHeight);
  return distancia <= slack;
}

export function shouldShowJump(
  seguindo: boolean,
  respondendo: boolean,
  terminouLonge: boolean
): boolean {
  if (seguindo) return false;
  return respondendo || terminouLonge;
}

export function decideScroll(p: {

  gesto: boolean;

  alturaAnterior: number;

  alturaAtual: number;
  scrollTop: number;
  clientHeight: number;
  slack?: number;
}): { pin: boolean; seguindo: boolean } {
  const base = p.gesto ? p.alturaAtual : p.alturaAnterior || p.alturaAtual;
  const noFim = wasAtBottom(base, p.scrollTop, p.clientHeight, p.slack);
  return { pin: noFim && !p.gesto, seguindo: noFim };
}
