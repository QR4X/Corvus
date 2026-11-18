export interface Ticker {
  subscribe: (listener: (now: number) => void) => () => void;
  size: () => number;
}

export function createTicker(
  intervalMs = 1000,
  clock: () => number = Date.now,
  setTimer: (run: () => void, ms: number) => unknown = (run, ms) =>
    window.setInterval(run, ms),
  clearTimer: (handle: unknown) => void = (handle) =>
    window.clearInterval(handle as number)
): Ticker {
  const listeners = new Set<(now: number) => void>();
  let handle: unknown = null;

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (handle === null) {
        handle = setTimer(() => {
          const now = clock();
          listeners.forEach((l) => l(now));
        }, intervalMs);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && handle !== null) {
          clearTimer(handle);
          handle = null;
        }
      };
    },
    size: () => listeners.size,
  };
}

export const sharedTicker = createTicker();
