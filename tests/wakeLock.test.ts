import { describe, it, expect, afterEach, vi } from "vitest";
import {
  browserEnv,
  watchWakeLock,
  type WakeLockEnv,
  type WakeLockSentinel,
} from "../src/core/wakeLock";
import { useChatStore } from "../src/store/chat";

function fakeEnv(over: Partial<WakeLockEnv> = {}): WakeLockEnv & {
  requests: string[];
  releases: string[];
  setVisibility: (v: string) => void;
  fireVisibilityChange: () => void;
} {
  const requests: string[] = [];
  const releases: string[] = [];
  const listeners = new Set<() => void>();
  let visibility = "visible";
  const env: WakeLockEnv = {
    ...over,
    wakeLock: "wakeLock" in over ? over.wakeLock : {
      async request(type: "screen") {
        requests.push(type);
        return {
          release: async () => {
            releases.push(type);
          },
          addEventListener: () => {},
        };
      },
    },
    document: {
      get visibilityState() {
        return visibility;
      },
      addEventListener: (_t, cb) => listeners.add(cb),
      removeEventListener: (_t, cb) => listeners.delete(cb),
    },
  };
  return {
    ...env,
    requests,
    releases,
    setVisibility: (v) => {
      visibility = v;
    },
    fireVisibilityChange: () => listeners.forEach((cb) => cb()),
  };
}

afterEach(() => {
  useChatStore.setState({ isLoading: false });
});

describe("watchWakeLock", () => {
  it("requests the lock when a turn starts and releases it when it ends", async () => {
    const env = fakeEnv();
    const watcher = watchWakeLock(() => true, env);
    useChatStore.setState({ isLoading: true });
    await vi.waitFor(() => expect(env.requests).toEqual(["screen"]));
    useChatStore.setState({ isLoading: false });
    await vi.waitFor(() => expect(env.releases).toEqual(["screen"]));
    watcher.dispose();
  });

  it("releases the lock when the toggle is turned off mid-turn", async () => {
    const env = fakeEnv();
    let enabled = true;
    const watcher = watchWakeLock(() => enabled, env);
    useChatStore.setState({ isLoading: true });
    await vi.waitFor(() => expect(env.requests).toHaveLength(1));
    enabled = false;
    watcher.recheck();
    await vi.waitFor(() => expect(env.releases).toEqual(["screen"]));
    watcher.dispose();
  });

  it("releases while the app is hidden and reacquires when it is visible again", async () => {
    const env = fakeEnv();
    const watcher = watchWakeLock(() => true, env);
    useChatStore.setState({ isLoading: true });
    await vi.waitFor(() => expect(env.requests).toHaveLength(1));

    env.setVisibility("hidden");
    env.fireVisibilityChange();
    await vi.waitFor(() => expect(env.releases).toHaveLength(1));

    env.setVisibility("visible");
    env.fireVisibilityChange();
    await vi.waitFor(() => expect(env.requests).toHaveLength(2));
    watcher.dispose();
  });

  it("never throws when the API is unsupported", async () => {
    const env = fakeEnv({ wakeLock: undefined });
    const watcher = watchWakeLock(() => true, env);
    useChatStore.setState({ isLoading: true });
    await vi.waitFor(() => {
      expect(env.requests).toEqual([]);
      expect(useChatStore.getState().isLoading).toBe(true);
    });
    watcher.dispose();
  });

  it("stays silent when the OS refuses the lock", async () => {
    const env = fakeEnv({
      wakeLock: {
        async request() {
          throw new Error("NotAllowedError");
        },
      },
    });
    const watcher = watchWakeLock(() => true, env);
    useChatStore.setState({ isLoading: true });
    await vi.waitFor(() => expect(env.requests).toEqual([]));
    watcher.dispose();
  });

  it("releases the lock and stops listening on dispose", async () => {
    const env = fakeEnv();
    const watcher = watchWakeLock(() => true, env);
    useChatStore.setState({ isLoading: true });
    await vi.waitFor(() => expect(env.requests).toHaveLength(1));
    watcher.dispose();
    await vi.waitFor(() => expect(env.releases).toEqual(["screen"]));
    useChatStore.setState({ isLoading: false });
    useChatStore.setState({ isLoading: true });
    await vi.waitFor(() => expect(env.requests).toHaveLength(1));
  });

  it("discards a stale request when the turn ends before the lock arrives", async () => {
    const requests: string[] = [];
    let resolveLock!: (s: WakeLockSentinel) => void;
    const env = fakeEnv({
      wakeLock: {
        request: () => {
          requests.push("screen");
          return new Promise<WakeLockSentinel>((resolve) => {
            resolveLock = resolve;
          });
        },
      },
    });
    const watcher = watchWakeLock(() => true, env);
    useChatStore.setState({ isLoading: true });
    useChatStore.setState({ isLoading: false });
    resolveLock({ release: async () => {}, addEventListener: () => {} });

    useChatStore.setState({ isLoading: true });
    await vi.waitFor(() => expect(requests).toEqual(["screen", "screen"]));
    watcher.dispose();
  });
});

describe("browserEnv", () => {
  it("reads the wake lock from navigator, not from window", () => {
    const wakeLock = { request: vi.fn() };
    const doc = fakeEnv().document;
    const env = browserEnv({ wakeLock }, doc);
    expect(env.wakeLock).toBe(wakeLock);
    expect(env.document).toBe(doc);
  });
});
