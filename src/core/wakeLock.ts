import { useChatStore } from "../store/chat";

export interface WakeLockEnv {
  wakeLock?: {
    request(type: "screen"): Promise<WakeLockSentinel>;
  };
  document: {
    visibilityState: string;
    addEventListener(type: "visibilitychange", cb: () => void): void;
    removeEventListener(type: "visibilitychange", cb: () => void): void;
  };
}

export interface WakeLockSentinel {
  release(): Promise<void>;
  addEventListener(type: "release", cb: () => void): void;
}

interface WakeLockWatch {

  recheck(): void;

  dispose(): void;
}

export function browserEnv(
  nav: { wakeLock?: WakeLockEnv["wakeLock"] } = navigator,
  doc: WakeLockEnv["document"] = document
): WakeLockEnv {
  return { wakeLock: nav.wakeLock, document: doc };
}

export function watchWakeLock(
  enabled: () => boolean,
  env: WakeLockEnv = browserEnv()
): WakeLockWatch {
  let sentinel: WakeLockSentinel | null = null;

  let generation = 0;

  const release = (): void => {
    generation++;
    const s = sentinel;
    sentinel = null;
    if (s) void s.release().catch(() => {});
  };

  const acquire = async (): Promise<void> => {
    if (sentinel || !env.wakeLock) return;
    const g = generation;
    try {
      const s = await env.wakeLock.request("screen");
      if (g !== generation) return; 
      sentinel = s;
      s.addEventListener("release", () => {

        if (sentinel === s) sentinel = null;
      });
    } catch {
      sentinel = null; 
    }
  };

  const recheck = (): void => {
    const writing = useChatStore.getState().isLoading;
    if (!writing || !enabled() || env.document.visibilityState !== "visible") {
      release();
      return;
    }
    void acquire();
  };

  const noStore = useChatStore.subscribe((state, prev) => {
    if (state.isLoading !== prev.isLoading) recheck();
  });
  env.document.addEventListener("visibilitychange", recheck);

  return {
    recheck,
    dispose: () => {
      noStore();
      env.document.removeEventListener("visibilitychange", recheck);
      release();
    },
  };
}
