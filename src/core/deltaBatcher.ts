export type Scheduler = (run: () => void) => () => void;

export function frameScheduler(run: () => void): () => void {
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
    run();
    return () => undefined;
  }
  const handle = window.requestAnimationFrame(run);
  return () => window.cancelAnimationFrame(handle);
}

export interface DeltaBatcher {
  push: (text: string) => void;
  flush: () => void;
}

export function createDeltaBatcher(
  apply: (text: string) => void,
  schedule: Scheduler = frameScheduler
): DeltaBatcher {
  let buffer = "";
  let scheduled = false;
  let cancel: (() => void) | null = null;

  const flush = () => {
    if (cancel) cancel();
    cancel = null;
    scheduled = false;
    if (!buffer) return;
    const text = buffer;
    buffer = "";
    apply(text);
  };

  return {
    push(text) {
      buffer += text;
      if (scheduled) return;
      scheduled = true;
      const stop = schedule(() => {
        cancel = null;
        scheduled = false;
        flush();
      });
      if (scheduled) cancel = stop;
    },
    flush,
  };
}
