import { Notice, TFile } from "obsidian";
import type CorvusPlugin from "../main";
import {
  useChatStore,
  type AIResponseMessage,
  type ChatMessage,
  type UserMessage,
} from "../store/chat";
import { getProvider } from "../providers";
import { savedModelFor } from "./defaultModel";
import { providerCredential, providerMeta } from "./providersMeta";
import { fullModelName } from "./ollamaDefault";
import { EN_US } from "../i18n/en-us";
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
import { persistLocalImage } from "./imageStore";
import { makeId, missingCredentialError } from "./helpers";
import { streamReply, type EngineCtx } from "./chatEngine";
import { runAgentTurn } from "./agentTurn";
import type { NoteAttachment } from "../providers/base";
import type { Project } from "../projects";
import { previewFromText } from "./chatPreview";
import { vaultEnabled } from "./vaultContext";
import { keepConversationMessage } from "../agent/conversation";

export type ChatMode = "chat" | "vault-qa" | "agent";
export const CHAT_MODES: ChatMode[] = ["chat", "vault-qa", "agent"];
export function isChatMode(v: string | undefined | null): v is ChatMode {
  return !!v && (CHAT_MODES as string[]).includes(v);
}

interface SessionConfig {
  provider: string;
  model: string;
  mode: ChatMode;
  effort: string;

  vault: boolean;

  locked: boolean;
}

interface ChatRef {
  id: string;
  mode: string;
}

export class ChatSession {

  private get t() {
    return EN_US;
  }
  private readonly abortRef = { current: null as AbortController | null };
  private readonly approveAllRef = { current: false };

  private pendingProjectId: string | null = null;
  private saveTimer: number | null = null;

  private saveFailureNoticed = false;
  private pendingSave: (() => void) | null = null;
  private skipNextSave = false;
  private readonly listeners = new Set<() => void>();
  private readonly unsubStore: () => void;
  private readonly unsubSettings: () => void;
  private provider: string;
  private model: string;
  private mode: ChatMode;
  private effort: string;

  private vaultChoice: boolean | null = null;

  constructor(private readonly plugin: CorvusPlugin) {
    const s = plugin.settings;
    this.provider = s.defaultProvider || "openai";
    this.model = this.modelFor(this.provider);
    this.mode = isChatMode(s.defaultMode) ? s.defaultMode : "chat";
    this.effort = s.defaultEffort || "med";

    this.unsubStore = useChatStore.subscribe((state, prev) => {
      if (state.messages !== prev.messages) this.scheduleSave();
    });

    this.unsubSettings = plugin.onSettingsChange(() => this.followOllama());

    void plugin.chats.load();
  }

  async flushBackground(): Promise<void> {
    await this.saveBackgroundRun();
  }

  dispose(): void {
    this.unsubStore();
    this.unsubSettings();
    this.flushSave();

    void this.saveBackgroundRun();
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
      vault: vaultEnabled(
        isChatMode(st.sessionMode) ? st.sessionMode : this.mode,
        this.vaultChoice
      ),
      locked,
    };
  }

  modelFor(provider: string): string {
    return savedModelFor(this.plugin.settings, provider);
  }

  private followOllama(): void {
    if (this.provider !== "ollama") return;
    const active = this.plugin.settings.activeModels?.ollama ?? [];
    const current = this.model;
    if (current && active.some((m) => fullModelName(m) === fullModelName(current))) return;
    const saved = this.modelFor("ollama");
    if (saved === current) return;
    this.model = saved;
    this.emit();
  }

  modelOptions(provider: string): string[] {
    const list = this.plugin.settings.activeModels?.[provider] ?? [];
    const cfg = this.config;
    const cur = cfg.provider === provider ? cfg.model : this.modelFor(provider);
    return cur && !list.includes(cur) ? [cur, ...list] : list;
  }

  apiKeyFor(provider: string): string {
    return providerCredential(this.plugin.settings, provider);
  }

  setProvider(provider: string): void {
    if (this.config.locked) return;
    this.provider = provider;
    this.model = this.modelFor(provider);
    this.plugin.settings.defaultProvider = provider;
    void this.plugin.saveSettings();
    this.emit();
  }

  setModel(model: string): void {
    if (this.config.locked || !model) return;
    this.model = model;
    this.plugin.settings[providerMeta(this.provider).model] = model;
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
    this.vaultChoice = on;
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

    const setupError =
      st.messages.length === 0
        ? (missingCredentialError(cfg.provider, this.apiKeyFor(cfg.provider), this.t, provider.name) ??
          (cfg.model.trim() ? null : this.t.ai.err.noModel(provider.name)))
        : null;
    if (setupError) {
      st.addMessage({
        type: "ai-response",
        content: `${this.t.ai.errorPrefix} ${setupError}`,
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

    const pendingAttachments = st.attachments;
    let attachments = pendingAttachments.length > 0 ? [...pendingAttachments] : undefined;
    if (pendingAttachments.length > 0) st.setAttachments([]);

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

      await this.saveBackgroundRun();
      useChatStore.getState().setTurnChatId(null);
      this.emit();
    }

    const queued = useChatStore.getState().queued;
    if (queued.length > 0) {
      const [next, ...rest] = queued;
      useChatStore.getState().setAttachments([]);
      useChatStore.setState({ queued: rest });

      await this.send(next);
    }
    return true;
  }

  private detachRunningTurn(): boolean {
    const st = useChatStore.getState();
    if (!st.isLoading || st.background) return false;
    const ownerChatId = st.turnChatId ?? st.currentChatId;
    if (!ownerChatId) return false;
    const cfg = this.config;
    if (st.queued.length > 0) {
      const draft = st.drafts[ownerChatId] ?? "";
      const merged = [draft, ...st.queued].filter((t) => t.trim()).join("\n\n");
      st.setDraft(ownerChatId, merged);
      st.clearQueued();
    }
    st.detachTurn({
      chatId: ownerChatId,
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

  private async saveBackgroundRun(): Promise<void> {
    const st = useChatStore.getState();
    const run = st.background;
    if (!run) return;
    st.clearBackground();

    const kept = run.messages.filter(
      keepConversationMessage
    ) as Array<Extract<ChatMessage, { content: string }>>;
    if (kept.length === 0) return;
    const chat: ChatData = {
      id: run.chatId,
      title: run.title || generateTitle(kept[0].content),
      date: new Date().toISOString(),
      mode: run.mode,
      provider: run.provider,
      model: run.model,
      effort: run.effort,
      tokensIn: run.tokensIn,
      tokensOut: run.tokensOut,
      messages: kept.map((m) => ({
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
    const last = chat.messages[chat.messages.length - 1];
    try {
      const path = await saveChat(
        this.plugin.app,
        this.plugin.settings.chatsPath,
        chat
      );
      this.plugin.chats.upsert({
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

        preview: previewFromText(last?.content ?? ""),
      });

      this.plugin.chats.markUnread(chat.id);
      this.saveFailureNoticed = false;
    } catch (err) {
      this.reportSaveFailure(err);
    }
  }

  stop(): void {
    this.abortRef.current?.abort();

    useChatStore.getState().clearQueued();
  }

  private reattachRunningTurn(): void {
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

    if (!this.detachRunningTurn()) this.abortRef.current?.abort();
    this.flushSave();
    this.pendingProjectId = null;

    this.vaultChoice = null;
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
      this.reattachRunningTurn();
      this.plugin.chats.clearUnread(ref.id);
      return;
    }

    const wasUnread = this.plugin.chats.unread().has(ref.id);

    if (!this.detachRunningTurn()) this.abortRef.current?.abort();
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

      if (wasUnread) {
        const latestReply = [...restored]
          .reverse()
          .find((m) => m.type === "ai-response");
        if (latestReply) st.setResume({ messageId: latestReply.id });
      }

      this.plugin.chats.clearUnread(chat.id);
      if (chat.effort) this.effort = chat.effort;

      this.vaultChoice = chat.vault ?? null;
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
      this.plugin.chats.remove(ref.id);

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
      const cur = this.plugin.chats.list?.find((c) => c.id === ref.id);
      if (cur) this.plugin.chats.upsert({ ...cur, title: clean });
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

  private reportSaveFailure(err: unknown): void {
    console.error("[corvus] failed to save conversation:", err);
    if (this.saveFailureNoticed) return;
    this.saveFailureNoticed = true;
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

      vault: this.vaultChoice ?? undefined,
      messages: userOrAi.map((m) => ({
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
    const last = chat.messages[chat.messages.length - 1];
    try {
      const path = await saveChat(
        this.plugin.app,
        this.plugin.settings.chatsPath,
        chat
      );
      this.plugin.chats.upsert({
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
        preview: previewFromText(last?.content ?? ""),
      });
      this.saveFailureNoticed = false;
    } catch (err) {
      this.reportSaveFailure(err);
    }
  }
}
