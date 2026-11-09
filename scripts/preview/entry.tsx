import { createRoot } from "react-dom/client";
import { App as CorvusApp } from "./src/ui/App";
import { useChatStore } from "./src/store/chat";
import { registerBrandLogos } from "./src/ui/brandLogos";
import type { ChatSession } from "./src/core/session";
import type CorvusPlugin from "./src/main";
import { vaultAtivo } from "./src/core/vaultContext";
import { loadSkills } from "./src/skills/skills";
import { TFile } from "obsidian";

declare const PREVIEW_VERSION: string;

registerBrandLogos(); 

const params = new URLSearchParams(location.search);
const scenario = params.get("s") ?? "empty";

const dias = (n: number, h = 10) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(h, 0, 0, 0);
  return d.toISOString();
};

const chats = [
  { id: "1", title: "Weekly review plan", date: "2026-09-11T09:12:00", mode: "agent", provider: "anthropic", model: "claude-sonnet-4-6", messageCount: 14, filePath: "", tokensIn: 0, tokensOut: 0, preview: "Wrote the review into Journal/2026-W37.md and linked the three open projects. Two tasks had no due date — left them as they were.", toolCount: 14 },
  { id: "2", title: "What did I write about spaced repetition?", date: "2026-09-10T21:03:00", mode: "vault-qa", provider: "openai", model: "gpt-5", messageCount: 6, filePath: "", tokensIn: 0, tokensOut: 0 , toolCount: 0 },
  { id: "3", title: "Outline for the Corvus landing page", date: "2026-09-09T14:44:00", mode: "chat", provider: "openai", model: "gpt-4o", messageCount: 22, filePath: "", tokensIn: 0, tokensOut: 0 , toolCount: 0 },
  { id: "4", title: "Clean up the inbox folder", date: "2026-09-08T08:20:00", mode: "agent", provider: "gemini", model: "gemini-2.5-flash", messageCount: 9, filePath: "", tokensIn: 0, tokensOut: 0, preview: "Moved 41 notes out of Inbox/ into the folders they belong to. Six had no clear home and stayed put; the list is at the end of this session.", toolCount: 9 },
  { id: "5", title: "Rewrite the plugin README", date: dias(0, 8), mode: "chat", provider: "openai", model: "gpt-5", messageCount: 11, filePath: "", tokensIn: 0, tokensOut: 0 , toolCount: 0 },
  { id: "6", title: "Which notes mention the Anki backlog?", date: dias(1, 19), mode: "vault-qa", provider: "openai", model: "gpt-5", messageCount: 4, filePath: "", tokensIn: 0, tokensOut: 0 , toolCount: 0 },
  { id: "7", title: "Move last month's meeting notes", date: dias(2, 11), mode: "agent", provider: "anthropic", model: "claude-sonnet-4-6", messageCount: 18, filePath: "", tokensIn: 0, tokensOut: 0, preview: "[edit_note] Meetings/2026-08 — moved 18 files, rewrote 9 wikilinks that pointed at the old paths.", toolCount: 18 },
  { id: "8", title: "Names for the voice feature", date: dias(3, 15), mode: "chat", provider: "openai", model: "gpt-4o", messageCount: 7, filePath: "", tokensIn: 0, tokensOut: 0 , toolCount: 0 },
  { id: "9", title: "What did I decide about pricing?", date: dias(4, 9), mode: "vault-qa", provider: "anthropic", model: "claude-sonnet-4-6", messageCount: 5, filePath: "", tokensIn: 0, tokensOut: 0 , toolCount: 0 },
  { id: "10", title: "Tag every note from the São Paulo trip", date: dias(5, 20), mode: "agent", provider: "openai", model: "gpt-5", messageCount: 26, filePath: "", tokensIn: 0, tokensOut: 0, preview: "Tagged 26 notes with #trip/sao-paulo. Skipped the three daily notes: they mention the trip but are not about it.", toolCount: 26 },
  { id: "11", title: "Explain event loops like I'm tired", date: dias(6, 23), mode: "chat", provider: "openai", model: "gpt-5", messageCount: 9, filePath: "", tokensIn: 0, tokensOut: 0 , toolCount: 0 },
  { id: "12", title: "Summarise the reading list", date: dias(9, 12), mode: "vault-qa", provider: "openai", model: "gpt-4o", messageCount: 8, filePath: "", tokensIn: 0, tokensOut: 0 , toolCount: 0 },
  { id: "13", title: "Draft the changelog for 0.5", date: dias(12, 16), mode: "chat", provider: "anthropic", model: "claude-sonnet-4-6", messageCount: 13, filePath: "", tokensIn: 0, tokensOut: 0 , toolCount: 0 },
  { id: "14", title: "Split the daily notes by quarter", date: dias(15, 10), mode: "agent", provider: "openai", model: "gpt-5", messageCount: 31, filePath: "", tokensIn: 0, tokensOut: 0, preview: "Split Daily/ into Daily/2026-Q1..Q3. 31 files moved, no links broken — checked every backlink before writing.", toolCount: 31 },
  { id: "15", title: "Where did I write about sleep debt?", date: dias(21, 7), mode: "vault-qa", provider: "openai", model: "gpt-5", messageCount: 3, filePath: "", tokensIn: 0, tokensOut: 0 , toolCount: 0 },

  { id: "17", title: "Regex for the daily note template", date: dias(7, 11), mode: "chat", provider: "openai", model: "gpt-5", messageCount: 6, filePath: "", tokensIn: 0, tokensOut: 0 , toolCount: 0 },
  { id: "18", title: "Ideas for the onboarding screen", date: dias(10, 17), mode: "chat", provider: "anthropic", model: "claude-sonnet-4-6", messageCount: 15, filePath: "", tokensIn: 0, tokensOut: 0 , toolCount: 0 },
  { id: "19", title: "Why is my build 300KB?", date: dias(14, 21), mode: "chat", provider: "openai", model: "gpt-4o", messageCount: 10, filePath: "", tokensIn: 0, tokensOut: 0 , toolCount: 0 },
  { id: "20", title: "Translate the README to Portuguese", date: dias(18, 9), mode: "chat", provider: "openai", model: "gpt-5", messageCount: 4, filePath: "", tokensIn: 0, tokensOut: 0 , toolCount: 0 },

  { id: "16", title: "Deep research on spaced repetition", date: dias(8, 13), mode: "research", provider: "openai", model: "gpt-5", messageCount: 5, filePath: "", tokensIn: 0, tokensOut: 0 , toolCount: 0 },

  { id: "21", title: "Old notes cleanup", date: dias(36, 10), mode: "agent", provider: "openai", model: "gpt-5", messageCount: 20, filePath: "", tokensIn: 0, tokensOut: 0 , toolCount: 20 },
  { id: "22", title: "Reading list for June", date: dias(44, 15), mode: "chat", provider: "anthropic", model: "claude-sonnet-4-6", messageCount: 12, filePath: "", tokensIn: 0, tokensOut: 0 , toolCount: 0 },
  { id: "23", title: "Where did the Q2 plan go?", date: dias(51, 9), mode: "vault-qa", provider: "openai", model: "gpt-4o", messageCount: 7, filePath: "", tokensIn: 0, tokensOut: 0 , toolCount: 0 },
  { id: "24", title: "Rewrite the onboarding copy", date: dias(52, 20), mode: "chat", provider: "openai", model: "gpt-5", messageCount: 30, filePath: "", tokensIn: 0, tokensOut: 0 , toolCount: 0 },
  { id: "25", title: "Split the archive by year", date: dias(73, 11), mode: "agent", provider: "anthropic", model: "claude-sonnet-4-6", messageCount: 24, filePath: "", tokensIn: 0, tokensOut: 0 , toolCount: 24 },
  { id: "26", title: "Names for the plugin", date: dias(95, 16), mode: "chat", provider: "openai", model: "gpt-4o", messageCount: 9, filePath: "", tokensIn: 0, tokensOut: 0 , toolCount: 0 },
  { id: "27", title: "Which notes mention Obsidian sync?", date: dias(120, 8), mode: "vault-qa", provider: "openai", model: "gpt-5", messageCount: 5, filePath: "", tokensIn: 0, tokensOut: 0 , toolCount: 0 },
]

  .map((c) => ({
    ...c,
    tokensIn: c.messageCount * 1400 + c.toolCount * 900,
    tokensOut: c.messageCount * 520,
  }))
  .sort((a, b) => b.date.localeCompare(a.date));

const chatsListeners = new Set<() => void>();
const unreadListeners = new Set<() => void>();
const settingsListeners = new Set<() => void>();

const plugin = {
  manifest: { version: PREVIEW_VERSION, id: "corvus" },

  app: {

    workspace: {
      getLeaf: () => ({
        openFile: async (f: { path: string }) =>
          console.log("[preview] abriria a nota", f.path),
      }),
    },
    fileManager: {
      renameFile: async (f: { path: string }, alvo: string) => {
        const c = SKILL_FILES.get(f.path);
        if (c === undefined) return;
        SKILL_FILES.delete(f.path);
        SKILL_FILES.set(alvo, c);
      },
    },
    vault: {
      getMarkdownFiles: () => [...FAKE_NOTES, ...skillFiles()],

      getFiles: () => [...FAKE_NOTES, ...FAKE_ARTIFACTS],

      getAbstractFileByPath: (p: string) => {
        if (SKILL_FILES.has(p)) return fakeFile(p);
        const nota = FAKE_NOTES.find((f) => f.path === p);
        if (nota) return fakeFile(p, nota.stat.mtime);
        return FAKE_ARTIFACTS.find((f) => f.path === p) ?? null;
      },

      create: async (caminho: string, conteudo: string) => {
        SKILL_FILES.set(caminho, conteudo);
        return fakeFile(caminho);
      },
      modify: async (f: { path: string }, conteudo: string) => {
        SKILL_FILES.set(f.path, conteudo);
      },
      trash: async (f: { path: string }) => {
        SKILL_FILES.delete(f.path);
      },
      adapter: {
        readBinary: async () =>
          Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]).buffer,

        exists: async (caminho: string) => SKILL_FILES.has(caminho) || !caminho.includes("/exports/"),

        read: async (caminho: string) => {
          const id = (caminho.split("/").pop() ?? "").replace(/\.md$/, "");
          const c =
            chats.find((x) => x.id === id) ?? chats[0];
          return [
            "---",
            `id: "${c.id}"`,
            `title: "${c.title}"`,
            `date: "${c.date}"`,
            `mode: "${c.mode}"`,
            `provider: "${c.provider}"`,
            `model: "${c.model}"`,
            'effort: "med"',
            `tokens_in: ${c.tokensIn}`,
            `tokens_out: ${c.tokensOut}`,
            `message_count: ${c.messageCount}`,
            "tags:",
            "  - corvus",
            "---",
            "",
            `# ${c.title}`,
            "",
            "## You",
            "",
            "<!-- corvus: ts=1758900000000 -->",
            "faz um resumo disso pra mim",
            "",
            "## Assistant",
            "",
            "Claro. Em tres pontos: o que mudou, o que ficou de fora e o que",
            "eu faria a seguir.",
            "",
          ].join("\n");
        },
        mkdir: async () => undefined,
        write: async (caminho: string, conteudo: string) => {
          console.log(`[preview] would write ${caminho}:`, conteudo.slice(0, 400));
        },
      },
      cachedRead: async (f: { path: string }) =>
        SKILL_FILES.get(f.path) ??
        `# ${f.path.split("/").pop()}

Mock note content, enough to serve as context.`,
    },
  },

  skills: [],
  chatSummaries: chats,

  markChatUnread(id: string) {
    if (!id || plugin.settings.unreadChats.includes(id)) return;
    plugin.settings.unreadChats = [...plugin.settings.unreadChats, id];
    plugin.notifyUnread();
  },
  clearChatUnread(id: string) {
    if (!id || !plugin.settings.unreadChats.includes(id)) return;
    plugin.settings.unreadChats = plugin.settings.unreadChats.filter(
      (x: string) => x !== id
    );
    plugin.notifyUnread();
  },
  unreadSet() {
    return new Set(plugin.settings.unreadChats);
  },
  onUnreadChange: (cb: () => void) => {
    unreadListeners.add(cb);
    return () => unreadListeners.delete(cb);
  },
  notifyUnread() {
    unreadListeners.forEach((cb) => cb());
  },

  vectorIndex:
    new URLSearchParams(location.search).get("indice") === "0"
      ? null
      : { size: 18430, fileCount: 1274 },
  indexing: null,

  async runVaultIndex() {
    if (plugin.indexing) {
      plugin.indexing.abort();
      plugin.indexing = null;
      settingsListeners.forEach((cb) => cb());
      return;
    }
    plugin.indexing = new AbortController();
    settingsListeners.forEach((cb) => cb());
    await new Promise((r) => setTimeout(r, 1200));
    plugin.vectorIndex = {
      size: (plugin.vectorIndex?.size ?? 0) + 37,
      fileCount: (plugin.vectorIndex?.fileCount ?? 0) + 3,
    };
    plugin.indexing = null;
    settingsListeners.forEach((cb) => cb());
  },
  settings: {

    unreadChats: ["9"],
    openaiApiKey: "sk-test",
    anthropicApiKey: "sk-ant",

    openrouterApiKey: "sk-or-test",
    activeModels: {

      openai: [
        "gpt-5", "gpt-4o", "gpt-4o-mini", "gpt-5-mini", "gpt-5-nano",
        "gpt-4.1", "gpt-4.1-mini", "o3", "o3-mini", "o4-mini", "dall-e-3",
        "tts-1", "tts-1-hd",
      ],
      anthropic: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"],
      openrouter: [
        "anthropic/claude-3.5-sonnet",
        "meta-llama/llama-3.3-70b-instruct:free",
        "deepseek/deepseek-chat:free",
      ],
    },

    discoveredModels: {
      openai: [
        "gpt-5", "gpt-4o", "gpt-4o-mini", "gpt-5-mini", "gpt-5-nano",
        "gpt-4.1", "gpt-4.1-mini", "o3", "o3-mini", "o4-mini", "dall-e-3",
        "tts-1", "tts-1-hd",

        "gpt-5.1", "gpt-5.1-mini", "gpt-image-1", "text-embedding-3-small",
      ],
      anthropic: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"],
      openrouter: [
        "anthropic/claude-3.5-sonnet",
        "meta-llama/llama-3.3-70b-instruct:free",
        "deepseek/deepseek-chat:free",
      ],
    },

    favoriteModels:
      new URLSearchParams(location.search).get("favoritos") === "0"
        ? {}
        : {
            openai: ["gpt-5", "gpt-4o"],
            anthropic: ["claude-opus-5"],
          },

    geminiApiKey: "gm-test",
    providerStatus: {
      openai: { ok: true, at: Date.now(), detail: "24 models available." },
      gemini: { ok: false, at: Date.now(), detail: "401 invalid key" },
    },
    defaultEffort: "med",
    defaultProvider: "openai",
    defaultMode: "chat",
    voiceEnabled: true,
    voiceModel: "gpt-4o-mini-transcribe",
    voiceLanguage: "pt",
    ttsEnabled: true,
    ttsModel: "gpt-4o-mini-tts",
    ttsVoice: "alloy",
    ttsProvider: "openai",
    elevenApiKey: "",
    elevenModel: "eleven_multilingual_v2",
    elevenVoice: "",
    elevenVoices: [],
    skillsPath: "corvus-ai/skills",

    openaiDataSharing: false,
    openaiTier: 1,
    projects: [
      {
        id: "proj-thesis",
        name: "Thesis",
        icon: "graduation-cap",
        color: "#4361ee",
        sources: ["PROJECTS/FRAMEWORKS.md", "Learning/Spaced repetition.md"],
        chatIds: ["1", "3"],
        createdAt: new Date().toISOString(),
      },
      ...["Clientes", "Tese", "Casa", "Leituras"].map((nome, i) => ({
        id: `proj-extra-${i}`,
        name: nome,
        icon: ["briefcase", "book", "sprout", "book-open"][i],
        color: ["#e5484d", "#e5b54d", "#a370f7", "#4361ee"][i],
        sources: [],
        chatIds: [],
        createdAt: new Date(Date.now() - (i + 1) * 86400000).toISOString(),
      })),
      {
        id: "proj-nutri",
        name: "NUTRITION 1.0",
        icon: "leaf",
        color: "#46a758",
        sources: ["NUTRITION 1.0/Plano semanal.md"],
        chatIds: [],
        createdAt: new Date().toISOString(),
      },
    ],
  },

  saveSettings: async () => {
    settingsListeners.forEach((cb) => cb());
  },
  loadChatSummaries: async () => chats,

  onChatsChange: (cb: () => void) => {
    chatsListeners.add(cb);
    return () => chatsListeners.delete(cb);
  },
  notifyChats() {
    chatsListeners.forEach((cb) => cb());
  },
  onSettingsChange: (cb: () => void) => {
    settingsListeners.add(cb);
    return () => settingsListeners.delete(cb);
  },

  providerCredential: (id: string) =>
    params.get("nokey")
      ? ""
      : ({
          openai: "sk-test",
          anthropic: "sk-ant",
          gemini: "gm-test",

          openrouter: "sk-or-test",
        })[id] ?? "",

  scanModels: async (id: string) =>
    id === "openai"
      ? [
          "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-5", "gpt-5-mini",
          "gpt-5-nano", "gpt-4.1", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini",
          "gpt-4o-2024-08-06", "gpt-4-turbo", "o1", "o1-mini", "o3", "o3-mini",
          "o4-mini", "dall-e-2", "dall-e-3", "gpt-image-1", "tts-1", "tts-1-hd",
          "text-embedding-3-small", "text-embedding-3-large",
        ]
      : [
          "meta/llama-3.3-70b-instruct:free",
          "qwen/qwen-2.5-7b:free",
          "deepseek/deepseek-r1",
        ],
  reloadSkills: async () => {
    plugin.skills = await loadSkills(
      plugin.app as never,
      plugin.settings.skillsPath
    );
    settingsListeners.forEach((cb) => cb());
  },
  seedExampleSkills: async () => {
    const p = "corvus-ai/skills/Resumo TL;DR.md";
    if (SKILL_FILES.has(p)) return 0;
    SKILL_FILES.set(
      p,
      [
        "---",
        'name: "Resumo TL;DR"',
        'description: "Summarize in 3 bullets + 1 action"',
        'icon: "list"',
        "---",
        "",
        "Summarize the content below in 3 short bullets.",
        "",
      ].join("\n")
    );
    await plugin.reloadSkills();
    return 1;
  },
} as unknown as CorvusPlugin;

const FAKE_DEFAULT_MODEL: Record<string, string> = {
  openai: "gpt-5",
  anthropic: "claude-sonnet-5",
  gemini: "gemini-2.5-flash",
  openrouter: "meta/llama-3.3-70b-instruct:free",
  nim: "nvidia/llama-3.3-nemotron-super-49b",
  ollama: "llama3.2",
};

let mode = "chat";
let effort = "med";

let provider = "openai";
let model = "gpt-5";
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

let vaultEscolha: boolean | null = null;
let abortado = false;

const destacarOuNada = () => {
  const st = useChatStore.getState();
  if (!st.isLoading || st.background) return;
  const dono = st.turnChatId ?? st.currentChatId;
  if (!dono) return;
  st.detachTurn({
    chatId: dono,

    scrollTop: st.viewScrollTop,
    title: st.currentChatTitle,
    mode: st.sessionMode ?? mode,
    provider: st.sessionProvider ?? provider,
    model: st.sessionModel ?? model,
    effort,
    messages: st.messages,
    tokensIn: st.tokensIn,
    tokensOut: st.tokensOut,
  });
};

const session = {
  get config() {
    const st = useChatStore.getState();
    const m = st.sessionMode ?? mode;
    return {
      provider: st.sessionProvider ?? provider,
      model: st.sessionModel ?? model,
      mode: m,
      effort,

      vault: vaultAtivo(m, vaultEscolha),
      locked: st.sessionProvider !== null,
    };
  },
  setVault: (on: boolean) => {
    vaultEscolha = on;
    emit();
  },
  setMode: (m: string) => {
    mode = m;
    emit();
  },
  setProvider: (p: string) => {
    provider = p;
    model = FAKE_DEFAULT_MODEL[p] ?? "";
    emit();
  },
  setModel: (m: string) => {
    model = m;
    emit();
  },
  setEffort: (e: string) => {
    effort = e;
    emit();
  },

  modelOptions: (provider: string) => {
    const shown = plugin.settings.activeModels?.[provider] ?? [];
    const cur = FAKE_DEFAULT_MODEL[provider];
    return cur && !shown.includes(cur) ? [cur, ...shown] : shown;
  },
  apiKeyFor: () => "sk-test",

  send: async (text: string) => {
    const st = useChatStore.getState();
    if (!plugin.providerCredential(provider)) {
      st.addMessage({
        type: "ai-response",
        content: "Corvus: no API key configured for this provider.",
        isError: true,
        errorCode: "no-key",
      });
      return false;
    }

    if (st.attachments.length > 0) st.setAttachments([]);
    st.addMessage({ type: "user", content: text });
    if (!st.currentChatId) {
      st.setCurrentChatId("preview-" + Date.now());
      st.setCurrentChatTitle(text.slice(0, 40));
      st.lockSession(provider, model, mode);
    }

    st.setTurnChatId(useChatStore.getState().currentChatId);
    st.setLoading(true);
    emit();

    const total = Number(params.get("turn") ?? 1400);
    abortado = false;
    const dorme = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const narracao = st.addMessage({
      type: "ai-comment",
      content: "",
      activity: {
        phase: "pending",
        iconPending: "eye",
        pendingText: "Reading PROJECTS/FRAMEWORKS.md",
      },
    });
    await dorme(total * 0.35);
    if (!abortado) {
      useChatStore
        .getState()
        .updateActivity(narracao, { phase: "done", doneText: "Read PROJECTS/FRAMEWORKS.md" });
      const pedacos = ("Resposta de mentira, em pedaços, pra dar pra ver o " +
        "texto chegando enquanto a tela continua respondendo ao toque.").split(" ");
      const id = useChatStore.getState().addMessage({ type: "ai-response", content: "" });
      useChatStore.getState().setStreamingMessageId(id);
      for (const p of pedacos) {
        if (abortado) break;
        useChatStore.getState().appendToMessage(id, p + " ");
        await dorme((total * 0.65) / pedacos.length);
      }
      useChatStore.getState().setStreamingMessageId(null);
    }
    useChatStore.getState().setLoading(false);

    const bgFinal = useChatStore.getState().background;
    if (bgFinal) plugin.markChatUnread(bgFinal.chatId);
    useChatStore.getState().clearBackground();
    useChatStore.getState().setTurnChatId(null);
    emit();

    const fila = useChatStore.getState().queued;
    if (fila.length > 0) {
      const [proxima, ...resto] = fila;
      useChatStore.setState({ queued: resto });
      await session.send(proxima);
    }
    return true;
  },
  stop: () => {
    abortado = true;
    useChatStore.getState().setLoading(false);
    useChatStore.getState().setStreamingMessageId(null);
    useChatStore.getState().clearQueued();
    emit();
  },

  newChat: (m?: string) => {
    destacarOuNada();
    useChatStore.getState().newChat();
    if (m) {
      mode = m;

      plugin.settings.defaultMode = m;
    }
    emit();
  },
  newChatInProject: async (p: { name: string }) => {
    console.log("[preview] nova conversa no projeto", p.name);
  },

  load: async (c: { id: string; title: string; mode: string; provider: string; model: string }) => {

    if (useChatStore.getState().currentChatId === c.id) return;

    const eraNaoLida = plugin.settings.unreadChats.includes(c.id);

    plugin.clearChatUnread(c.id);
    const bg = useChatStore.getState().background;
    if (bg?.chatId === c.id) {

      const run = useChatStore.getState().attachTurn();
      if (run) {
        const s2 = useChatStore.getState();
        s2.setMessages(run.messages);
        s2.setCurrentChatId(run.chatId);
        s2.setCurrentChatTitle(run.title);
        s2.lockSession(run.provider, run.model, run.mode);

        s2.setResume({ scroll: run.scrollTop });
        emit();
      }
      return;
    }
    destacarOuNada();
    const st = useChatStore.getState();
    st.newChat();
    st.setMessages([
      { id: `${c.id}-u`, type: "user", content: c.title, timestamp: Date.now() - 60000 },
      {
        id: `${c.id}-a`,
        type: "ai-response",
        content: `Mock preview conversation loaded from **${c.mode}**. What matters here is that the menu opened THIS one.`,
        timestamp: Date.now() - 50000,
      },
    ]);
    st.setCurrentChatId(c.id);
    st.setCurrentChatTitle(c.title);
    st.lockSession(c.provider, c.model, c.mode);
    if (eraNaoLida) {
      const nova = [...useChatStore.getState().messages]
        .reverse()
        .find((m) => m.type === "ai-response");
      if (nova) st.setResume({ messageId: nova.id });
    }
    mode = c.mode;
    provider = c.provider;
    model = c.model;
    emit();
  },
  delete: async () => {},
  rename: async () => {},
  updateProjects: async (fn: (prev: unknown[]) => unknown[]) => {
    plugin.settings.projects = fn(plugin.settings.projects ?? []);
    settingsListeners.forEach((cb) => cb());
  },
  onChange: (cb: () => void) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
} as unknown as ChatSession;

if (scenario === "thread") {
  const st = useChatStore.getState();
  st.setMessages([
    { id: "m1", type: "user", content: "Which of my notes talk about spaced repetition, and what did I conclude?", timestamp: Date.now() - 60000 },
    { id: "m2", type: "ai-comment", content: "", timestamp: Date.now() - 55000, activity: { phase: "done", pendingText: "Searching the vault…", doneText: "Read 4 notes" } },
    { id: "m3", type: "ai-response", content: "Three notes cover it. In **Learning/Spaced repetition.md** you settled on a 2-day → 1-week → 1-month ladder, and noted that the jump to a month was where recall broke down.\n\nThe open question you left in **Inbox/Anki backlog.md** was whether to split decks by topic or by difficulty.", timestamp: Date.now() - 50000 },
    { id: "m4", type: "user", content: "Draft a note that answers that open question.", timestamp: Date.now() - 20000 },
    { id: "m5", type: "ai-response", reasoning: "The user wants a note that answers the open question. Check both cited notes before writing, because the June conclusion contradicts the topic-splitting hypothesis.", content: "Splitting by difficulty is the better fit for how you review — topic decks recreate the cramming pattern you flagged in June.", timestamp: Date.now() - 10000,

      agentSteps: [
        { id: "t1", name: "vault_list", arguments: {}, result: "7 items", ok: true },
        { id: "t2", name: "vault_list", arguments: { folder: "PROJECTS" }, result: "16 items", ok: true },
        { id: "t3", name: "vault_list", arguments: { folder: "TASKS" }, result: "4 items", ok: true },
        { id: "t4", name: "vault_list", arguments: { folder: "DAILY" }, result: "8 items", ok: true },
        { id: "t5", name: "vault_list", arguments: { folder: "NUTRITION 1.0" }, result: "12 items", ok: true },
        { id: "t6", name: "vault_list", arguments: { folder: "corvus-ai" }, result: "1 item", ok: true },
        { id: "t7", name: "vault_read", arguments: { path: "PROJECTS/FRAMEWORKS.md" }, result: "# Frameworks…", ok: true },
        { id: "t8", name: "vault_search", arguments: { query: "spaced repetition" }, result: ["4 notes matched:", "Learning/Spaced repetition.md"].join("\n"), ok: true },
        { id: "t9", name: "vault_edit", arguments: { path: "PROJECTS/FRAMEWORKS.md" }, result: "edited", ok: true },
        { id: "t10", name: "vault_create", arguments: { path: "PROJECTS/CREATIVE SYSTEMS.md", content: "…" }, result: "created", ok: true },
        { id: "t11", name: "vault_create", arguments: { path: "Inbox/Decks por dificuldade.md", content: "…" }, result: "Permission denied: destructive action needs confirmation", ok: false },
      ] },
  ] as never);
  st.setCurrentChatId("2");
  st.setCurrentChatTitle("What did I write about spaced repetition?");
  st.lockSession("openai", "gpt-5", "vault-qa");
}

(window as unknown as { __chat: unknown }).__chat = useChatStore;

const FAKE_NOTES = [
  { path: "PROJECTS/FRAMEWORKS.md", basename: "FRAMEWORKS", extension: "md", stat: { mtime: 5 } },
  { path: "PROJECTS/CREATIVE SYSTEMS.md", basename: "CREATIVE SYSTEMS", extension: "md", stat: { mtime: 8 } },
  { path: "DAILY/2026-09-14.md", basename: "2026-09-14", extension: "md", stat: { mtime: 99 } },
  { path: "TASKS/Inbox.md", basename: "Inbox", extension: "md", stat: { mtime: 40 } },
  { path: "Learning/Spaced repetition.md", basename: "Spaced repetition", extension: "md", stat: { mtime: 30 } },
  { path: "Notas/2024/framing-de-produto/rascunho.md", basename: "rascunho", extension: "md", stat: { mtime: 10 } },
  { path: "NUTRITION 1.0/Plano semanal.md", basename: "Plano semanal", extension: "md", stat: { mtime: 20 } },
];

const SKILL_FILES = new Map<string, string>([
  [
    "corvus-ai/skills/Daily note.md",
    [
      "---",
      'name: "Daily note"',
      'description: "Start today’s note"',
      'icon: "calendar"',
      'mode: "chat"',
      "---",
      "",
      "Open today’s daily note and list what is still open.",
      "",
    ].join("\n"),
  ],
  [
    "corvus-ai/skills/Summarize.md",
    [
      "---",
      'name: "Summarize"',
      'description: "Summarize a note"',
      'icon: "align-left"',
      "---",
      "",
      "Summarize the note I am looking at in five bullets.",
      "",
    ].join("\n"),
  ],
]);

function fakeFile(path: string, mtime = Date.now() - 3 * 86400000) {
  const f = Object.create(TFile.prototype) as TFile & {
    path: string;
    basename: string;
    extension: string;
    stat: { mtime: number };
  };
  f.path = path;
  f.basename = (path.split("/").pop() ?? path).replace(/\.md$/i, "");
  f.extension = path.split(".").pop() ?? "md";
  f.stat = { mtime };
  return f;
}

function skillFiles() {
  return [...SKILL_FILES.keys()].map((p) => fakeFile(p));
}

const FAKE_ARTIFACTS = [
  { path: "corvus-ai/generation/images/1731-gato-de-oculos.png", basename: "1731-gato-de-oculos", extension: "png", stat: { mtime: 900 } },
  { path: "corvus-ai/generation/images/1731-gato-de-oculos.md", basename: "1731-gato-de-oculos", extension: "md", stat: { mtime: 901 } },
  { path: "corvus-ai/generation/audio/1730-resumo-falado.mp3", basename: "1730-resumo-falado", extension: "mp3", stat: { mtime: 800 } },
  { path: "corvus-ai/generation/video/1729-clipe.mp4", basename: "1729-clipe", extension: "mp4", stat: { mtime: 700 } },
];

const MD_DEMO = "# CREATIVE SYSTEMS\n\n## Purpose\nA broad, **practical** view of how creative systems work day to day, with enough text to prove that long lines wrap instead of running off the screen.\n\n## Core Principles\n- Treat the work as a *system*, not a mood\n- Capture first, judge later\n- Review on a schedule, not on a feeling\n\nSee [[PROJECTS/FRAMEWORKS]] for the longer version.\n\n```ts\nexport function review(deck: Card[], hoje = Date.now()) {\n  return deck.filter((c) => c.due <= hoje).sort((a, b) => a.due - b.due);\n}\n```\n";
const TS_DEMO = "import { readFile } from 'node:fs/promises';\n\n/** L\u00ea o deck e devolve o que vence hoje. */\nexport async function due(path: string): Promise<Card[]> {\n  const raw = await readFile(path, 'utf8');\n  const deck = JSON.parse(raw) as Card[];\n  return deck.filter((c) => c.due <= Date.now());\n}\n";

const host = document.getElementById("app");

if (scenario === "confirm") {

  void (async () => {
    const { ConfirmationModal } = await import("./src/agent/ConfirmationModal");
    const { getTranslations } = await import("./src/i18n");
    const strings = getTranslations("en-us").agent;

    const tipo = params.get("file") ?? "md";
    const caso =
      tipo === "ts"
        ? {
            path: "corvus-ai/review.ts",
            content: TS_DEMO,
          }
        : tipo === "txt"
          ? { path: "Inbox/dump.txt", content: "linha 1\nlinha 2\nlinha 3" }
          : { path: "PROJECTS/CREATIVE SYSTEMS.md", content: MD_DEMO };

    const content = params.get("big")
      ? caso.content.repeat(6)
      : caso.content;
    const modal = new ConfirmationModal({} as never, {
      toolCall: {
        id: "call_1",
        name: "vault_create",
        arguments: { path: caso.path, content },
      },
      definition: {
        name: "vault_create",
        description:
          "Creates a new vault file with the given content. Fails if it already exists.",
        parameters: { type: "object", properties: {}, required: [] },
      } as never,
      strings,
    });
    void modal.openAndWait();
  })();
}
if (scenario === "settings") {

  void (async () => {
    const { CorvusSettingsTab } = await import("./src/ui/SettingsTab");
    const tab = new CorvusSettingsTab(
      {} as never,
      plugin as never
    ) as unknown as { containerEl: HTMLElement; display: () => void };

    const modal = document.createElement("div");
    modal.className = "modal mod-settings preview-settings-modal";
    const content = document.createElement("div");
    content.className = "modal-content vertical-tabs-container";
    const tabContent = document.createElement("div");
    tabContent.className = "vertical-tab-content-container";
    const inner = document.createElement("div");
    inner.className = "vertical-tab-content";
    tab.containerEl = document.createElement("div");
    tab.containerEl.className = "corvus-settings-preview";
    inner.appendChild(tab.containerEl);
    tabContent.appendChild(inner);
    content.appendChild(tabContent);
    modal.appendChild(content);
    host?.appendChild(modal);
    tab.display();
  })();
} else if (host) {
  createRoot(host).render(<CorvusApp plugin={plugin} session={session} />);

  void import("./src/ui/haptics").then(({ hapticsOn, setHapticsEnabled }) => {
    setHapticsEnabled(true);
    hapticsOn(host);
  });
}
