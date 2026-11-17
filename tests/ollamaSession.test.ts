import { afterEach, describe, expect, it } from "vitest";
import { ChatSession } from "../src/core/session";
import { useChatStore } from "../src/store/chat";
import { alignToInstalled } from "../src/core/ollamaDefault";
import { savedModelFor } from "../src/core/defaultModel";
import { looksLikeOllamaEmbedding } from "../src/rag/types";
import type { CorvusSettings } from "../src/settings";

function setup(extra: Record<string, unknown> = {}) {
  const listeners = new Set<() => void>();
  const settings = {
    defaultProvider: "ollama",
    ollamaModel: "llama3.2",
    defaultMode: "chat",
    defaultEffort: "med",
    activeModels: { ollama: ["llama3.2", "qwen2.5", "deepseek-r1", "mistral"] },
    favoriteModels: {},
    ollamaEndpoint: "http://localhost:11434",
    ...extra,
  } as unknown as CorvusSettings;
  const plugin = {
    settings,
    onSettingsChange: (cb: () => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    chats: { load: async () => [] },
    saveSettings: async () => listeners.forEach((cb) => cb()),
  };
  const session = new ChatSession(plugin as never);

  const fetchModels = async (installed: string[]) => {
    const d = alignToInstalled(
      {
        active: settings.activeModels.ollama ?? [],
        favorites: [],
        model: settings.ollamaModel,
        seen: settings.ollamaSeenModels ?? null,
      },
      installed,
      looksLikeOllamaEmbedding
    );
    settings.activeModels = { ...settings.activeModels, ollama: [...d.active] };
    settings.ollamaModel = d.model;
    settings.ollamaSeenModels = [...d.seen];
    await plugin.saveSettings();
  };
  return { session, settings, fetchModels };
}

afterEach(() => {
  useChatStore.getState().newChat();
});

describe("the open chat follows the Ollama model list", () => {
  it("switches immediately when nothing has been sent", async () => {
    const { session, fetchModels } = setup();
    expect(session.config.model).toBe("llama3.2");
    await fetchModels(["qwen3.5:9b"]);
    expect(session.config.model).toBe("qwen3.5:9b");
    expect(session.modelOptions("ollama")).toEqual(["qwen3.5:9b"]);
  });

  it("keeps a sent chat on its model and starts the next one on the new model", async () => {
    const { session, fetchModels } = setup();
    useChatStore.getState().lockSession("ollama", "llama3.2", "chat");
    await fetchModels(["qwen3.5:9b"]);
    expect(session.config.model).toBe("llama3.2");
    session.newChat();
    expect(session.config.locked).toBe(false);
    expect(session.config.model).toBe("qwen3.5:9b");
    expect(session.modelOptions("ollama")).toEqual(["qwen3.5:9b"]);
  });
});

describe("without an Ollama model", () => {
  it("warns, and the next send after fetching is the real first message", async () => {
    const { session, fetchModels } = setup({ ollamaModel: "", activeModels: { ollama: [] } });
    expect(await session.send("hi")).toBe(false);
    let st = useChatStore.getState();
    expect(st.messages).toHaveLength(1);
    expect(st.messages[0].isError).toBe(true);
    expect(st.messages[0].content).toMatch(/Fetch models/);
    expect(st.currentChatId).toBeNull();

    await fetchModels(["qwen3.5:9b"]);
    expect(session.config.model).toBe("qwen3.5:9b");

    void session.send("hi again").catch(() => undefined);
    st = useChatStore.getState();
    expect(st.currentChatId).not.toBeNull();
    expect(st.sessionModel).toBe("qwen3.5:9b");
    expect(st.messages.some((m) => m.type === "ai-response" && m.isError && /Fetch models/.test(m.content ?? ""))).toBe(false);
    session.dispose();
  });
});

describe("the saved Ollama model never falls on an embedding model", () => {
  it("with an empty field, picks the first chat-capable model or none", () => {
    const s = (active: string[]) =>
      ({ ollamaModel: "", activeModels: { ollama: active } }) as unknown as CorvusSettings;
    expect(savedModelFor(s(["nomic-embed-text:latest", "qwen3.5:9b"]), "ollama")).toBe("qwen3.5:9b");
    expect(savedModelFor(s(["nomic-embed-text:latest"]), "ollama")).toBe("");
  });
});
