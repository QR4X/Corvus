import { Notice, TFile } from "obsidian";
import { fromStoredTrace, storedTracesByResponse } from "./tracePersist";
import type CorvusPlugin from "../main";
import {
  useChatStore,
  type AIResponseMessage,
  type ChatMessage,
  type UserMessage,
} from "../store/chat";
import { getProvider } from "../providers";
import { modeloSalvoPara } from "./defaultModel";
import { nomeCompleto } from "./ollamaDefault";
import { getTranslations } from "../i18n";
import { tr } from "../i18n/tr";
import {
  saveChat,
  loadChat,
  deleteChat,
  renameChat,
  generateTitle,
  fromStoredAttachments,
  toStoredAttachments,
  type ChatData,
} from "./chatPersistence";
import { persistLocalImage } from "../ui/attachSources";
import { makeId, semCredencial } from "./helpers";
import { streamReply, type EngineCtx } from "./chatEngine";
import { runAgentTurn } from "./agentTurn";
import type { NoteAttachment } from "../providers/base";
import type { Project } from "../projects";
import { previewFromText } from "./chatPreview";
import { vaultAtivo } from "./vaultContext";
import { keepConversationMessage } from "../agent/conversation";

export type ChatMode = "chat" | "vault-qa" | "agent";
export const CHAT_MODES: ChatMode[] = ["chat", "vault-qa", "agent"];
export function isChatMode(v: string | undefined | null): v is ChatMode {
  return !!v && (CHAT_MODES as string[]).includes(v);
}

export interface SessionConfig {
  provider: string;
  model: string;
  mode: ChatMode;
  effort: string;

  vault: boolean;

  locked: boolean;
}

export interface ChatRef {
  id: string;
  mode: string;
}

export class ChatSession {

  private get t() {
    return getTranslations(this.plugin.settings.language);
  }
  private readonly abortRef = { current: null as AbortController | null };
  private readonly approveAllRef = { current: false };

  private pendingProjectId: string | null = null;
  private saveTimer: number | null = null;

  private avisoDeGravacaoDado = false;
  private pendingSave: (() => void) | null = null;
  private skipNextSave = false;
  private readonly listeners = new Set<() => void>();
  private readonly unsubStore: () => void;
  private readonly unsubSettings: () => void;
  private provider: string;
  private model: string;
  private mode: ChatMode;
  private effort: string;

  private vaultEscolha: boolean | null = null;

  constructor(private readonly plugin: CorvusPlugin) {
    const s = plugin.settings;
    this.provider = s.defaultProvider || "openai";
    this.model = this.modelFor(this.provider);
    this.mode = isChatMode(s.defaultMode) ? s.defaultMode : "chat";
    this.effort = s.defaultEffort || "med";

    this.unsubStore = useChatStore.subscribe((state, prev) => {
      if (state.messages !== prev.messages) this.scheduleSave();
    });

    this.unsubSettings = plugin.onSettingsChange(() => this.seguirOllama());

    void plugin.loadChatSummaries();
  }

  async flushBackground(): Promise<void> {
    await this.gravarFundo();
  }

  dispose(): void {
    this.unsubStore();
    this.unsubSettings();
    this.flushSave();

    void this.gravarFundo();
    this.abortRef.current?.abort();
    this.listeners.clear();
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  private emit(): void {
    this.listeners.forEach((cb) => {
      try {
        cb();
      } catch (err) {
        console.error("[corvus] session listener failed:", err);
      }
    });
  }

  get config(): SessionConfig {
    const st = useChatStore.getState();
    const locked = st.sessionProvider !== null;
    const provider = st.sessionProvider ?? this.provider;
    return {
      provider,
      model: st.sessionModel ?? this.model,
      mode: isChatMode(st.sessionMode) ? st.sessionMode : this.mode,
      effort: this.effort,
      vault: vaultAtivo(
        isChatMode(st.sessionMode) ? st.sessionMode : this.mode,
        this.vaultEscolha
      ),
      locked,
    };
  }

  modelFor(provider: string): string {
    return modeloSalvoPara(this.plugin.settings, provider);
  }

  private seguirOllama(): void {
    if (this.provider !== "ollama") return;
    const ativos = this.plugin.settings.activeModels?.ollama ?? [];
    const atual = this.model;
    if (atual && ativos.some((m) => nomeCompleto(m) === nomeCompleto(atual))) return;
    const salvo = this.modelFor("ollama");
    if (salvo === atual) return;
    this.model = salvo;
    this.emit();
  }

  modelOptions(provider: string): string[] {
    const list = this.plugin.settings.activeModels?.[provider] ?? [];
    const cfg = this.config;
    const cur = cfg.provider === provider ? cfg.model : this.modelFor(provider);
    return cur && !list.includes(cur) ? [cur, ...list] : list;
  }

  apiKeyFor(provider: string): string {
    return this.plugin.providerCredential(provider);
  }

  setProvider(provider: string): void {
    this.provider = provider;
    this.model = this.modelFor(provider);
    this.plugin.settings.defaultProvider = provider;
    this.syncLockedModel();
    void this.plugin.saveSettings();
    this.emit();
  }

  private syncLockedModel(): void {
    if (useChatStore.getState().sessionProvider === null) return;
    useChatStore.setState({
      sessionProvider: this.provider,
      sessionModel: this.model,
    });
  }

  selectModel(provider: string, model: string): void {
    if (!model) return;
    const before = this.config;
    if (before.provider === provider && before.model === model) return;
    if (this.provider !== provider) this.setProvider(provider);
    this.setModel(model);
  }

  setModel(model: string): void {
    if (!model) return;
    this.model = model;
    const s = this.plugin.settings;
    switch (this.provider) {
      case "anthropic":
        s.anthropicModel = model;
        break;
      case "gemini":
        s.geminiModel = model;
        break;
      case "openrouter":
        s.openrouterModel = model;
        break;
      case "nim":
        s.nimModel = model;
        break;
      case "ollama":
        s.ollamaModel = model;
        break;
      default:
        s.defaultModel = model;
    }
    this.syncLockedModel();
    void this.plugin.saveSettings();
    this.emit();
  }

  setMode(mode: ChatMode): void {
    if (this.config.locked) return;
    this.mode = mode;
    this.plugin.settings.defaultMode = mode;
    void this.plugin.saveSettings();
    this.emit();
  }

  setVault(on: boolean): void {
    this.vaultEscolha = on;
    this.emit();
  }

  setEffort(effort: string): void {
    this.effort = effort;
    this.plugin.settings.defaultEffort = effort;
    void this.plugin.saveSettings();
    this.emit();
  }

  async send(text: string): Promise<boolean> {
    const trimmed = text.trim();
    if (!trimmed) return false;
    let st = useChatStore.getState();
    if (st.isLoading) return false;

    if (
      !st.currentChatId &&
      st.messages.length > 0 &&
      st.messages.every((m) => m.type === "ai-response" && m.isError === true)
    ) {
      st.setMessages([]);
      st = useChatStore.getState(); 
    }
    const cfg = this.config;
    const provider = getProvider(cfg.provider);

    const falta =
      st.messages.length === 0
        ? (semCredencial(cfg.provider, this.apiKeyFor(cfg.provider), this.t, provider.name) ??
          (cfg.model.trim() ? null : this.t.ai.err.noModel(provider.name)))
        : null;
    if (falta) {
      st.addMessage({
        type: "ai-response",
        content: `${this.t.ai.errorPrefix} ${falta}`,
        isError: true,
        errorCode: "no-key",
      });
      return false;
    }

    if (st.messages.length === 0) {
      const id = makeId();
      st.setCurrentChatId(id);
      st.setCurrentChatTitle(generateTitle(trimmed));
      st.lockSession(cfg.provider, cfg.model, cfg.mode);
      if (this.pendingProjectId) {
        const pid = this.pendingProjectId;
        this.pendingProjectId = null;
        await this.updateProjects((prev) =>
          prev.map((p) =>
            p.id === pid && !p.chatIds.includes(id)
              ? { ...p, chatIds: [id, ...p.chatIds] }
              : p
          )
        );
      }
    }

    const pendentes = st.attachments;
    let attachments = pendentes.length > 0 ? [...pendentes] : undefined;
    if (pendentes.length > 0) st.setAttachments([]);

    if (attachments) {
      attachments = await Promise.all(
        attachments.map(async (a) =>
          a.type === "image" ? persistLocalImage(this.plugin.app, a) : a
        )
      );
    }

    st.addMessage({
      type: "user",
      content: trimmed,
      ...(attachments ? { attachments } : {}),
    });

    st.setTurnChatId(useChatStore.getState().currentChatId);
    this.emit();

    const ctx: EngineCtx = {
      plugin: this.plugin,
      t: this.t,
      abortRef: this.abortRef,
      activeProviderId: cfg.provider,
      activeProvider: provider,
      activeModel: cfg.model,
      activeMode: cfg.mode,
      apiKeyFor: (p) => this.apiKeyFor(p),
      effort: this.effort,
      useVault: cfg.vault,
      resolveStyleInstruction: () => "",
    };
    try {
      if (cfg.mode === "agent") {
        await runAgentTurn(
          { ...ctx, agentApproveAllRef: this.approveAllRef },
          trimmed,
          attachments
        );
      } else {
        await streamReply(ctx, trimmed, attachments);
      }
    } finally {

      await this.gravarFundo();
      useChatStore.getState().setTurnChatId(null);
      this.emit();
    }

    const fila = useChatStore.getState().queued;
    if (fila.length > 0) {
      const [proxima, ...resto] = fila;
      useChatStore.getState().setAttachments([]);
      useChatStore.setState({ queued: resto });

      await this.send(proxima);
    }
    return true;
  }

  private destacarTurno(): boolean {
    const st = useChatStore.getState();
    if (!st.isLoading || st.background) return false;
    const dono = st.turnChatId ?? st.currentChatId;
    if (!dono) return false;
    const cfg = this.config;
    if (st.queued.length > 0) {
      const antes = st.drafts[dono] ?? "";
      const texto = [antes, ...st.queued].filter((t) => t.trim()).join("\n\n");
      st.setDraft(dono, texto);
      st.clearQueued();
    }
    st.detachTurn({
      chatId: dono,
      scrollTop: st.viewScrollTop,
      title: st.currentChatTitle,
      mode: cfg.mode,
      provider: cfg.provider,
      model: cfg.model,
      effort: cfg.effort,
      messages: st.messages,
      tokensIn: st.tokensIn,
      tokensOut: st.tokensOut,
    });
    return true;
  }

  private async gravarFundo(): Promise<void> {
    const st = useChatStore.getState();
    const run = st.background;
    if (!run) return;
    st.clearBackground();

    const guardadas = run.messages.filter(
      keepConversationMessage
    ) as Array<Extract<ChatMessage, { content: string }>>;
    if (guardadas.length === 0) return;
    const traces = storedTracesByResponse(run.messages);
    const chat: ChatData = {
      id: run.chatId,
      title: run.title || generateTitle(guardadas[0].content),
      date: new Date().toISOString(),
      mode: run.mode,
      provider: run.provider,
      model: run.model,
      effort: run.effort,
      tokensIn: run.tokensIn,
      tokensOut: run.tokensOut,
      messages: guardadas.map((m) => ({
        ...(m.type === "ai-response" && traces.get(m.id) ? { trace: traces.get(m.id) } : {}),
        type: m.type as "user" | "ai-response",
        content: m.content,
        timestamp: m.timestamp,
        ...(m.type === "ai-response" && m.isError ? { isError: true } : {}),
        ...(m.type === "ai-response" && m.reaction
          ? { reaction: m.reaction }
          : {}),
        ...(m.type === "ai-response" && m.agentSteps
          ? { agentSteps: m.agentSteps }
          : {}),
        ...(m.type === "user" && m.attachments?.length
          ? { attachments: toStoredAttachments(m.attachments) }
          : {}),
      })),
    };
    const ultima = chat.messages[chat.messages.length - 1];
    try {
      const path = await saveChat(
        this.plugin.app,
        this.plugin.settings.chatsPath,
        chat
      );
      this.plugin.upsertChatSummary({
        id: chat.id,
        title: chat.title,
        date: chat.date,
        mode: chat.mode,
        provider: chat.provider,
        model: chat.model,
        effort: chat.effort,
        tokensIn: chat.tokensIn,
        tokensOut: chat.tokensOut,
        messageCount: chat.messages.length,
        toolCount: chat.messages.reduce(
          (n, m) => n + (m.agentSteps?.length ?? 0),
          0
        ),
        filePath: path,
        starred: false,

        preview: previewFromText(ultima?.content ?? ""),
      });

      this.plugin.markChatUnread(chat.id);
      this.avisoDeGravacaoDado = false;
    } catch (err) {
      this.avisarFalhaDeGravacao(err);
    }
  }

  stop(): void {
    this.abortRef.current?.abort();

    useChatStore.getState().clearQueued();
  }

  private reanexarTurno(): void {
    const st = useChatStore.getState();
    const run = st.attachTurn();
    if (!run) return;
    this.skipNextSave = true;
    st.setAttachments([]);
    st.setMessages(run.messages);
    st.setCurrentChatId(run.chatId);
    st.setCurrentChatTitle(run.title);
    st.lockSession(run.provider, run.model, run.mode);
    st.resetUsage();
    st.addUsage(run.tokensIn, run.tokensOut);
    if (run.effort) this.effort = run.effort;

    st.setResume({ scroll: run.scrollTop });
    this.emit();
  }

  newChat(mode?: ChatMode): void {

    if (!this.destacarTurno()) this.abortRef.current?.abort();
    this.flushSave();
    this.pendingProjectId = null;

    this.vaultEscolha = null;
    useChatStore.getState().newChat();
    if (mode) {
      this.mode = mode;
      this.plugin.settings.defaultMode = mode;
      void this.plugin.saveSettings();
    }
    this.emit();
  }

  async newChatInProject(project: Project): Promise<void> {
    this.newChat();
    this.pendingProjectId = project.id;

    useChatStore.getState().setSessionInstructions(project.instructions ?? "");
    const notes: NoteAttachment[] = [];
    const missing: string[] = [];
    for (const src of project.sources) {
      const file = this.plugin.app.vault.getAbstractFileByPath(src);
      if (!(file instanceof TFile)) {
        missing.push(src.split("/").pop() ?? src);
        continue;
      }
      try {
        const content = await this.plugin.app.vault.cachedRead(file);
        notes.push({ type: "note", path: src, content });
      } catch {
        missing.push(src.split("/").pop() ?? src);
      }
    }
    useChatStore.getState().setAttachments(notes);
    if (missing.length > 0) {
      new Notice(tr("Project sources not found: {names}", { names: missing.join(", ") }));
    }
    this.emit();
  }

  async load(ref: ChatRef): Promise<void> {
    const store = useChatStore.getState();
    if (store.currentChatId === ref.id) return;

    if (store.background?.chatId === ref.id) {
      this.reanexarTurno();
      this.plugin.clearChatUnread(ref.id);
      return;
    }

    const naoLida = this.plugin.unreadSet().has(ref.id);

    if (!this.destacarTurno()) this.abortRef.current?.abort();
    this.flushSave();
    store.setLoadingChat(true);
    try {
      const chat = await loadChat(
        this.plugin.app,
        this.plugin.settings.chatsPath,
        ref.mode,
        ref.id
      );
      const restored: ChatMessage[] = await Promise.all(
        chat.messages.map(async (m) => ({
          id: makeId(),
          type: m.type,
          content: m.content,
          timestamp: m.timestamp,
          ...(m.type === "ai-response" && m.isError ? { isError: true } : {}),
          ...(m.type === "ai-response" && m.reaction
            ? { reaction: m.reaction }
            : {}),
          ...(m.type === "ai-response" && m.agentSteps
            ? { agentSteps: m.agentSteps }
            : {}),
          ...(m.type === "ai-response" && m.trace?.length
            ? { trace: fromStoredTrace(m.trace, "trace") }
            : {}),
          ...(m.type === "user" && m.attachments?.length
            ? { attachments: await fromStoredAttachments(this.plugin.app, m.attachments) }
            : {}),
        }))
      );

      const st = useChatStore.getState();

      this.skipNextSave = true;
      this.pendingProjectId = null;
      st.setAttachments([]);
      st.setMessages(restored);
      st.setCurrentChatId(chat.id);
      st.setCurrentChatTitle(chat.title);
      st.lockSession(chat.provider, chat.model, chat.mode);
      st.resetUsage();
      st.addUsage(chat.tokensIn, chat.tokensOut);
      st.setSessionPersona(chat.persona ?? "");
      st.setSessionInstructions(chat.instructions ?? "");
      st.setCurrentChatStarred(chat.starred === true);

      if (naoLida) {
        const nova = [...restored]
          .reverse()
          .find((m) => m.type === "ai-response");
        if (nova) st.setResume({ messageId: nova.id });
      }

      this.plugin.clearChatUnread(chat.id);
      if (chat.effort) this.effort = chat.effort;

      this.vaultEscolha = chat.vault ?? null;
    } catch (err) {
      console.error("[corvus] loadChat failed:", err);
      new Notice(
        `${this.t.ai.errorPrefix} ${err instanceof Error ? err.message : this.t.ai.unknownError}`
      );
    } finally {
      useChatStore.getState().setLoadingChat(false);
      this.emit();
    }
  }

  async delete(ref: ChatRef): Promise<void> {
    try {
      await deleteChat(
        this.plugin.app,
        this.plugin.settings.chatsPath,
        ref.mode,
        ref.id
      );
      this.plugin.removeChatSummary(ref.id);

      await this.updateProjects((prev) =>
        prev.map((p) =>
          p.chatIds.includes(ref.id)
            ? { ...p, chatIds: p.chatIds.filter((id) => id !== ref.id) }
            : p
        )
      );
      if (useChatStore.getState().currentChatId === ref.id) this.newChat();
      new Notice(this.t.chat.deletedToTrash);
    } catch (err) {
      console.error("[corvus] deleteChat failed:", err);
      new Notice(
        `${this.t.ai.errorPrefix} ${err instanceof Error ? err.message : ""}`
      );
    }
  }

  async rename(ref: ChatRef, newTitle: string): Promise<void> {
    const clean = newTitle.trim();
    if (!clean) return;
    try {
      await renameChat(
        this.plugin.app,
        this.plugin.settings.chatsPath,
        ref.mode,
        ref.id,
        clean
      );
      if (useChatStore.getState().currentChatId === ref.id) {
        useChatStore.getState().setCurrentChatTitle(clean);
      }
      const cur = this.plugin.chatSummaries?.find((c) => c.id === ref.id);
      if (cur) this.plugin.upsertChatSummary({ ...cur, title: clean });
      new Notice(this.t.conversations.renameSuccess(clean));
    } catch (err) {
      const msg = err instanceof Error ? err.message : this.t.ai.unknownError;
      new Notice(this.t.conversations.renameFailed(msg));
    }
  }

  async updateProjects(
    update: (prev: Project[]) => Project[]
  ): Promise<void> {
    this.plugin.settings.projects = update(this.plugin.settings.projects ?? []);
    await this.plugin.saveSettings();
  }

  private scheduleSave(): void {
    const st = useChatStore.getState();
    if (st.messages.length === 0 || !st.currentChatId) return;
    if (this.skipNextSave) {
      this.skipNextSave = false;
      return;
    }
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.pendingSave = () => void this.saveNow();
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      this.pendingSave = null;
      void this.saveNow();
    }, 500);
  }

  flushSave(): void {
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    const pending = this.pendingSave;
    this.pendingSave = null;
    pending?.();
  }

  private avisarFalhaDeGravacao(err: unknown): void {
    console.error("[corvus] failed to save conversation:", err);
    if (this.avisoDeGravacaoDado) return;
    this.avisoDeGravacaoDado = true;
    new Notice(
      tr(
        "Corvus could not save this chat to your vault — what you see here is not on disk yet. Check the vault's disk space and permissions."
      ),
      12000
    );
  }

  private async saveNow(): Promise<void> {
    const st = useChatStore.getState();
    if (!st.currentChatId) return;
    const userOrAi = st.messages.filter(
      (m): m is UserMessage | AIResponseMessage =>
        keepConversationMessage(m)
    );
    if (userOrAi.length === 0) return;
    const traces = storedTracesByResponse(st.messages);
    const cfg = this.config;
    const chat: ChatData = {
      id: st.currentChatId,
      title: st.currentChatTitle || generateTitle(userOrAi[0].content),
      date: new Date().toISOString(),
      mode: cfg.mode,
      provider: cfg.provider,
      model: cfg.model,
      effort: cfg.effort,
      tokensIn: st.tokensIn,
      tokensOut: st.tokensOut,
      persona: st.sessionPersona || undefined,
      instructions: st.sessionInstructions || undefined,
      starred: st.currentChatStarred || undefined,

      vault: this.vaultEscolha ?? undefined,
      messages: userOrAi.map((m) => ({
        ...(m.type === "ai-response" && traces.get(m.id) ? { trace: traces.get(m.id) } : {}),
        type: m.type,
        content: m.content,
        timestamp: m.timestamp,
        ...(m.type === "ai-response" && m.isError ? { isError: true } : {}),
        ...(m.type === "ai-response" && m.reaction
          ? { reaction: m.reaction }
          : {}),
        ...(m.type === "ai-response" && m.agentSteps?.length
          ? { agentSteps: m.agentSteps }
          : {}),
        ...(m.type === "user" && m.attachments?.length
          ? { attachments: toStoredAttachments(m.attachments) }
          : {}),
      })),
    };
    const ultima = chat.messages[chat.messages.length - 1];
    try {
      const path = await saveChat(
        this.plugin.app,
        this.plugin.settings.chatsPath,
        chat
      );
      this.plugin.upsertChatSummary({
        id: chat.id,
        title: chat.title,
        date: chat.date,
        mode: chat.mode,
        provider: chat.provider,
        model: chat.model,
        effort: chat.effort,
        tokensIn: chat.tokensIn,
        tokensOut: chat.tokensOut,
        messageCount: chat.messages.length,
        toolCount: chat.messages.reduce(
          (n, m) => n + (m.agentSteps?.length ?? 0),
          0
        ),
        filePath: path,
        starred: chat.starred === true,
        preview: previewFromText(ultima?.content ?? ""),
      });
      this.avisoDeGravacaoDado = false;
    } catch (err) {
      this.avisarFalhaDeGravacao(err);
    }
  }
}
