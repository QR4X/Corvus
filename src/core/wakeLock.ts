// src/core/wakeLock.ts
// A tela fica acesa enquanto a IA escreve (Screen Wake Lock API), como um
// vídeo do YouTube: o aparelho só volta a dormir quando a resposta termina.
//
// O estado "escrevendo" é o `isLoading` do store do chat — a única fonte de
// verdade dos turnos: chat, Vault Q&A e agent todos ligam esse flag. O toggle
// (`ligado`) é lido a cada sincronização, então mudar a setting no meio de um
// turno vale na hora.
//
// Sem suporte (iOS/WebView antigo) nada acontece: `wakeLock` ausente vira
// no-op, e o SO recusar o lock é silencioso.

import { useChatStore } from "../store/chat";

/** O mínimo do navegador que usamos (o `window` inteiro é o normal). */
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
  /** Re-lê o estado (turno, toggle, visibilidade) — idempotente. */
  recheck(): void;
  /** Solta o lock e para de escutar (unload do plugin). */
  dispose(): void;
}

export function acompanharEscrita(
  ligado: () => boolean,
  env: WakeLockEnv = window
): WakeLockWatch {
  let sentinela: WakeLockSentinel | null = null;
  // Geração do pedido: cada `soltar` invalida um `request` ainda em voo — sem
  // isto, o turno acabar antes de o lock chegar deixaria a tela acesa para sempre.
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
      if (g !== geracao) return; // o estado mudou enquanto o lock vinha
      sentinela = s;
      s.addEventListener("release", () => {
        // O SO soltou sozinho (tela apagada, app em segundo plano): esquece.
        if (sentinela === s) sentinela = null;
      });
    } catch {
      sentinela = null; // sem permissão: segue sem segurar, sem avisar
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
