import { afterEach, describe, expect, it } from "vitest";
import { ChatSession } from "../src/core/session";
import { useChatStore } from "../src/store/chat";
import { alignToInstalled } from "../src/core/ollamaDefault";
import { savedModelFor } from "../src/core/defaultModel";
import { looksLikeOllamaEmbedding } from "../src/rag/types";
import type { CorvusSettings } from "../src/settings";

function montar(extra: Record<string, unknown> = {}) {
  const ouvintes = new Set<() => void>();
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
      ouvintes.add(cb);
      return () => ouvintes.delete(cb);
    },
    chats: { load: async () => [] },
    saveSettings: async () => ouvintes.forEach((cb) => cb()),
  };
  const sessao = new ChatSession(plugin as never);

  const buscar = async (instalados: string[]) => {
    const d = alignToInstalled(
      {
        active: settings.activeModels.ollama ?? [],
        favorites: [],
        model: settings.ollamaModel,
        seen: settings.ollamaSeenModels ?? null,
      },
      instalados,
      looksLikeOllamaEmbedding
    );
    settings.activeModels = { ...settings.activeModels, ollama: [...d.active] };
    settings.ollamaModel = d.model;
    settings.ollamaSeenModels = [...d.seen];
    await plugin.saveSettings();
  };
  return { sessao, settings, buscar };
}

afterEach(() => {
  useChatStore.getState().newChat();
});

describe("a conversa aberta segue a lista do Ollama", () => {
  it("sem conversa enviada: troca na hora", async () => {
    const { sessao, buscar } = montar();
    expect(sessao.config.model).toBe("llama3.2");
    await buscar(["qwen3.5:9b"]);
    expect(sessao.config.model).toBe("qwen3.5:9b");
    expect(sessao.modelOptions("ollama")).toEqual(["qwen3.5:9b"]);
  });

  it("com uma conversa enviada na tela: ela fica no dela, e a PRÓXIMA nasce no certo", async () => {
    const { sessao, buscar } = montar();
    useChatStore.getState().lockSession("ollama", "llama3.2", "chat");
    await buscar(["qwen3.5:9b"]);
    expect(sessao.config.model).toBe("llama3.2"); 
    sessao.newChat();
    expect(sessao.config.locked).toBe(false);
    expect(sessao.config.model).toBe("qwen3.5:9b");
    expect(sessao.modelOptions("ollama")).toEqual(["qwen3.5:9b"]);
  });
});

describe("sem modelo do Ollama", () => {
  it("avisa, e o envio seguinte (depois da busca) é a primeira mensagem de verdade", async () => {
    const { sessao, buscar } = montar({ ollamaModel: "", activeModels: { ollama: [] } });
    expect(await sessao.send("oi")).toBe(false);
    let st = useChatStore.getState();
    expect(st.messages).toHaveLength(1);
    expect(st.messages[0].isError).toBe(true);
    expect(st.messages[0].content).toMatch(/Fetch models/);
    expect(st.currentChatId).toBeNull();

    await buscar(["qwen3.5:9b"]);
    expect(sessao.config.model).toBe("qwen3.5:9b");

    void sessao.send("oi de novo").catch(() => undefined);
    st = useChatStore.getState();
    expect(st.currentChatId).not.toBeNull();
    expect(st.sessionModel).toBe("qwen3.5:9b");
    expect(st.messages.some((m) => m.type === "ai-response" && m.isError && /Fetch models/.test(m.content ?? ""))).toBe(false);
    sessao.dispose();
  });
});

describe("o modelo salvo do Ollama nunca cai num embedding", () => {
  it("com o campo vazio, o primeiro da lista que conversa — ou nenhum", () => {
    const s = (ativos: string[]) =>
      ({ ollamaModel: "", activeModels: { ollama: ativos } }) as unknown as CorvusSettings;
    expect(savedModelFor(s(["nomic-embed-text:latest", "qwen3.5:9b"]), "ollama")).toBe("qwen3.5:9b");
    expect(savedModelFor(s(["nomic-embed-text:latest"]), "ollama")).toBe("");
  });
});
