export const FOLLOW_SLACK = 72;

export function shouldShowJump(
  following: boolean,
  streaming: boolean,
  finishedAway: boolean
): boolean {
  if (following) return false;
  return streaming || finishedAway;
}

export function decideScroll(p: {
  gesture: boolean;
  previousHeight: number;
  currentHeight: number;
  scrollTop: number;
  clientHeight: number;
  slack?: number;
}): { pin: boolean; following: boolean } {
  const height = p.gesture ? p.currentHeight : p.previousHeight || p.currentHeight;
  const distance = Math.max(0, height - p.scrollTop - p.clientHeight);
  const atBottom = distance <= (p.slack ?? FOLLOW_SLACK);
  return { pin: atBottom && !p.gesture, following: atBottom };
}
