import { describe, it, expect, afterEach, vi } from "vitest";
import {
  acompanharEscrita,
  type WakeLockEnv,
  type WakeLockSentinel,
} from "../src/core/wakeLock";
import { useChatStore } from "../src/store/chat";

// O contrato do wake lock: a tela fica acesa exatamente enquanto a IA escreve
// (store.isLoading) com o toggle ligado e o app à vista; qualquer coisa fora
// disso solta o lock. Cada caso aqui é um jeito de a tela apagar (ou ficar
// acesa) na hora errada.

/** Um navegador de mentira: registra pedidos/soltas e dispara os listeners. */
function fakeEnv(over: Partial<WakeLockEnv> = {}): WakeLockEnv & {
  pedidos: string[];
  soltos: string[];
  setVisivel: (v: string) => void;
  dispararVisibilidade: () => void;
} {
  const pedidos: string[] = [];
  const soltos: string[] = [];
  const ouvintes = new Set<() => void>();
  let visivel = "visible";
  const env: WakeLockEnv = {
    ...over,
    wakeLock: "wakeLock" in over ? over.wakeLock : {
      async request(type: "screen") {
        pedidos.push(type);
        return {
          release: async () => {
            soltos.push(type);
          },
          addEventListener: () => {},
        };
      },
    },
    document: {
      get visibilityState() {
        return visivel;
      },
      addEventListener: (_t, cb) => ouvintes.add(cb),
      removeEventListener: (_t, cb) => ouvintes.delete(cb),
    },
  };
  return {
    ...env,
    pedidos,
    soltos,
    setVisivel: (v) => {
      visivel = v;
    },
    dispararVisibilidade: () => ouvintes.forEach((cb) => cb()),
  };
}

afterEach(() => {
  useChatStore.setState({ isLoading: false });
});

describe("acompanharEscrita", () => {
  it("pede o lock quando o turno começa e solta quando termina", async () => {
    const env = fakeEnv();
    const vigia = acompanharEscrita(() => true, env);
    useChatStore.setState({ isLoading: true });
    await vi.waitFor(() => expect(env.pedidos).toEqual(["screen"]));
    useChatStore.setState({ isLoading: false });
    await vi.waitFor(() => expect(env.soltos).toEqual(["screen"]));
    vigia.dispose();
  });

  it("o toggle desligado no meio do turno solta o lock", async () => {
    const env = fakeEnv();
    let ligado = true;
    const vigia = acompanharEscrita(() => ligado, env);
    useChatStore.setState({ isLoading: true });
    await vi.waitFor(() => expect(env.pedidos).toHaveLength(1));
    ligado = false;
    vigia.recheck();
    await vi.waitFor(() => expect(env.soltos).toEqual(["screen"]));
    vigia.dispose();
  });

  it("não segura com o app fora da tela, e re-segura ao voltar", async () => {
    const env = fakeEnv();
    const vigia = acompanharEscrita(() => true, env);
    useChatStore.setState({ isLoading: true });
    await vi.waitFor(() => expect(env.pedidos).toHaveLength(1));

    env.setVisivel("hidden");
    env.dispararVisibilidade();
    await vi.waitFor(() => expect(env.soltos).toHaveLength(1));

    env.setVisivel("visible");
    env.dispararVisibilidade();
    await vi.waitFor(() => expect(env.pedidos).toHaveLength(2));
    vigia.dispose();
  });

  it("sem suporte da API nunca lança", async () => {
    const env = fakeEnv({ wakeLock: undefined });
    const vigia = acompanharEscrita(() => true, env);
    useChatStore.setState({ isLoading: true });
    await vi.waitFor(() => {
      expect(env.pedidos).toEqual([]);
      expect(useChatStore.getState().isLoading).toBe(true);
    });
    vigia.dispose();
  });

  it("o SO recusar o lock é silencioso", async () => {
    const env = fakeEnv({
      wakeLock: {
        async request() {
          throw new Error("NotAllowedError");
        },
      },
    });
    const vigia = acompanharEscrita(() => true, env);
    useChatStore.setState({ isLoading: true });
    await vi.waitFor(() => expect(env.pedidos).toEqual([]));
    vigia.dispose();
  });

  it("dispose solta o lock e para de escutar", async () => {
    const env = fakeEnv();
    const vigia = acompanharEscrita(() => true, env);
    useChatStore.setState({ isLoading: true });
    await vi.waitFor(() => expect(env.pedidos).toHaveLength(1));
    vigia.dispose();
    await vi.waitFor(() => expect(env.soltos).toEqual(["screen"]));
    useChatStore.setState({ isLoading: false });
    useChatStore.setState({ isLoading: true });
    await vi.waitFor(() => expect(env.pedidos).toHaveLength(1));
  });

  it("o turno acabar antes de o lock chegar descarta o pedido velho", async () => {
    const pedidos: string[] = [];
    let liberar!: (s: WakeLockSentinel) => void;
    const env = fakeEnv({
      wakeLock: {
        request: () => {
          pedidos.push("screen");
          return new Promise<WakeLockSentinel>((resolver) => {
            liberar = resolver;
          });
        },
      },
    });
    const vigia = acompanharEscrita(() => true, env);
    useChatStore.setState({ isLoading: true });
    useChatStore.setState({ isLoading: false }); // acabou antes de o lock chegar
    liberar({ release: async () => {}, addEventListener: () => {} });
    // o pedido velho não segura nada nem trava o próximo turno
    useChatStore.setState({ isLoading: true });
    await vi.waitFor(() => expect(pedidos).toEqual(["screen", "screen"]));
    vigia.dispose();
  });
});
