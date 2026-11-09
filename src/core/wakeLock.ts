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

export interface WakeLockWatch {

  recheck(): void;

  dispose(): void;
}

export function acompanharEscrita(
  ligado: () => boolean,
  env: WakeLockEnv = window
): WakeLockWatch {
  let sentinela: WakeLockSentinel | null = null;

  let geracao = 0;

  const soltar = (): void => {
    geracao++;
    const s = sentinela;
    sentinela = null;
    if (s) void s.release().catch(() => {});
  };

  const segurar = async (): Promise<void> => {
    if (sentinela || !env.wakeLock) return;
    const g = geracao;
    try {
      const s = await env.wakeLock.request("screen");
      if (g !== geracao) return; 
      sentinela = s;
      s.addEventListener("release", () => {

        if (sentinela === s) sentinela = null;
      });
    } catch {
      sentinela = null; 
    }
  };

  const recheck = (): void => {
    const escrevendo = useChatStore.getState().isLoading;
    if (!escrevendo || !ligado() || env.document.visibilityState !== "visible") {
      soltar();
      return;
    }
    void segurar();
  };

  const noStore = useChatStore.subscribe((estado, antes) => {
    if (estado.isLoading !== antes.isLoading) recheck();
  });
  env.document.addEventListener("visibilitychange", recheck);

  return {
    recheck,
    dispose: () => {
      noStore();
      env.document.removeEventListener("visibilitychange", recheck);
      soltar();
    },
  };
}
