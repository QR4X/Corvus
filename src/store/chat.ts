import { create } from "zustand";
import type { AIToolStep } from "../agent/types";
import type { MessageAttachment } from "../providers/base";

export type MessageType = "user" | "ai-response" | "ai-comment" | "ai-options";

export type AIErrorCode =
  | "no-key"
  | "invalid-key"
  | "rate-limit"
  | "network"
  | "billing"
  | "context-overflow"
  | "unknown";

interface BaseMessage {
  id: string;
  type: MessageType;
  timestamp: number;
}

export interface UserMessage extends BaseMessage {
  type: "user";
  content: string;

  attachments?: MessageAttachment[];
}

export interface AIResponseMessage extends BaseMessage {
  type: "ai-response";
  content: string;

  reaction?: "like" | "dislike" | null;

  isError?: boolean;

  errorCode?: AIErrorCode;

  agentSteps?: AIToolStep[];

  truncated?: boolean;

  reasoning?: string;

  variants?: string[];
  variantIndex?: number;
}

export interface ActivityMeta {
  phase: "pending" | "done" | "failed";

  toolName?: string;
  toolArguments?: Record<string, unknown>;

  iconPending: string;

  iconDone?: string;

  iconFailed?: string;

  pendingText: string;

  doneText?: string;

  failedText?: string;

  detail?: string;

  placeholder?: "image";

  undoId?: string;

  undone?: boolean;
}

export interface AICommentMessage extends BaseMessage {
  type: "ai-comment";
  content: string;

  activity?: ActivityMeta;

  thought?: string;
}

export interface AIOptionsMessage extends BaseMessage {
  type: "ai-options";
  prompt: string;
  options: string[];
  selectedIndex?: number;
}

export type ChatMessage =
  | UserMessage
  | AIResponseMessage
  | AICommentMessage
  | AIOptionsMessage;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

export type NewMessageInput = DistributiveOmit<ChatMessage, "id" | "timestamp">;

export interface BackgroundRun {
  chatId: string;

  scrollTop: number;
  title: string;
  mode: string;
  provider: string;
  model: string;
  effort: string;
  messages: ChatMessage[];
  tokensIn: number;
  tokensOut: number;
}

interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;

  loadingChat: boolean;

  tokensIn: number;
  tokensOut: number;

  lastPromptTokens: number;

  streamingMessageId: string | null;

  streamStartedAt: number | null;

  streamTokens: number;

  tokensPerSec: number;

  sessionProvider: string | null;
  sessionModel: string | null;
  sessionMode: string | null;

  sessionPersona: string;

  sessionInstructions: string;

  currentChatId: string | null;

  currentChatTitle: string;

  drafts: Record<string, string>;

  attachments: MessageAttachment[];

  queued: string[];

  background: BackgroundRun | null;

  turnChatId: string | null;

  viewScrollTop: number;
  viewChatId: string | null;

  resumeScroll: number | null;
  resumeMessageId: string | null;

  waitingChatId: string | null;

  currentChatStarred: boolean;
  addMessage: (msg: NewMessageInput) => string;
  removeMessage: (id: string) => void;
  appendToMessage: (id: string, text: string) => void;
  appendReasoning: (id: string, text: string) => void;
  appendThought: (id: string, text: string) => void;

  updateActivity: (
    id: string,
    patch: Partial<ActivityMeta>,
    contentPatch?: string
  ) => void;

  markUndone: (id: string) => void;

  setReaction: (id: string, reaction: "like" | "dislike" | null) => void;

  setAgentSteps: (id: string, steps: AIToolStep[]) => void;

  setTruncated: (id: string, truncated: boolean) => void;

  beginVariant: (id: string) => void;

  syncVariant: (id: string) => void;

  discardEmptyVariant: (id: string) => void;

  navigateVariant: (id: string, dir: number) => void;
  selectOption: (messageId: string, optionIndex: number) => void;
  clearMessages: () => void;
  setLoading: (loading: boolean) => void;

  setTurnChatId: (id: string | null) => void;

  setWaitingChatId: (id: string | null) => void;

  setResume: (p: { scroll?: number | null; messageId?: string | null }) => void;

  detachTurn: (run: BackgroundRun) => void;

  attachTurn: () => BackgroundRun | null;

  clearBackground: () => void;
  setLoadingChat: (loading: boolean) => void;
  addUsage: (input: number, output: number) => void;
  resetUsage: () => void;
  setStreamingMessageId: (id: string | null) => void;

  startStreamTimer: () => void;

  tickStreamTokens: (chunk: string) => void;

  endStreamTimer: () => void;
  lockSession: (provider: string, model: string, mode?: string) => void;
  unlockSession: () => void;

  setSessionPersona: (persona: string) => void;
  setSessionInstructions: (instructions: string) => void;
  setCurrentChatId: (id: string | null) => void;
  setCurrentChatTitle: (title: string) => void;
  setCurrentChatStarred: (starred: boolean) => void;

  setMessages: (msgs: ChatMessage[]) => void;

  newChat: () => void;

  setDraft: (key: string, text: string) => void;
  pushQueued: (text: string) => void;
  removeQueued: (index: number) => void;
  clearQueued: () => void;
  addAttachment: (att: MessageAttachment) => void;
  removeAttachment: (index: number) => void;
  setAttachments: (atts: MessageAttachment[]) => void;
}

function makeId(): string {

  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function escritaDoTurno(
  state: ChatState,
  mudar: (msgs: ChatMessage[]) => ChatMessage[]
): Partial<ChatState> {
  const bg = state.background;
  if (!bg) return { messages: mudar(state.messages) };
  return { background: { ...bg, messages: mudar(bg.messages) } };
}

const BASE_RESET = {
  messages: [] as ChatMessage[],
  attachments: [] as MessageAttachment[],
  queued: [] as string[],
  isLoading: false,
  tokensIn: 0,
  tokensOut: 0,
  lastPromptTokens: 0,
  streamingMessageId: null as string | null,
  sessionProvider: null as string | null,
  sessionModel: null as string | null,
  sessionMode: null as string | null,
  sessionPersona: "",
  sessionInstructions: "",
} as const;

export const NEW_CHAT_DRAFT = "__new__";

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  drafts: {},
  attachments: [],
  queued: [],
  isLoading: false,
  loadingChat: false,
  tokensIn: 0,
  tokensOut: 0,
  lastPromptTokens: 0,
  streamingMessageId: null,
  streamStartedAt: null,
  streamTokens: 0,
  tokensPerSec: 0,
  sessionProvider: null,
  sessionModel: null,
  sessionMode: null,
  sessionPersona: "",
  sessionInstructions: "",
  currentChatId: null,
  background: null,
  turnChatId: null,
  viewScrollTop: 0,
  viewChatId: null,
  resumeScroll: null,
  resumeMessageId: null,
  waitingChatId: null,
  currentChatTitle: "",
  currentChatStarred: false,
  addMessage: (msg) => {
    const id = makeId();
    set((state) =>
      escritaDoTurno(state, (ms) => [
        ...ms,
        { ...msg, id, timestamp: Date.now() },
      ])
    );
    return id;
  },
  removeMessage: (id) =>
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== id),
    })),

  appendToMessage: (id, text) =>
    set((state) =>
      escritaDoTurno(state, (ms) =>
        ms.map((m) => {
          if (m.id !== id) return m;
          if (m.type === "ai-options") return m;
          return { ...m, content: m.content + text };
        })
      )
    ),

  appendReasoning: (id, text) =>
    set((state) =>
      escritaDoTurno(state, (ms) =>
        ms.map((m) =>
          m.id === id && m.type === "ai-response"
            ? { ...m, reasoning: (m.reasoning ?? "") + text }
            : m
        )
      )
    ),
  appendThought: (id, text) =>
    set((state) =>
      escritaDoTurno(state, (ms) =>
        ms.map((m) =>
          m.id === id && m.type === "ai-comment"
            ? { ...m, thought: (m.thought ?? "") + text }
            : m
        )
      )
    ),
  markUndone: (id) =>
    set((state) => {
      const marcar = (ms: ChatMessage[]) =>
        ms.map((m) =>
          m.id === id && m.type === "ai-comment" && m.activity
            ? { ...m, activity: { ...m.activity, undone: true } }
            : m
        );
      return {
        messages: marcar(state.messages),
        ...(state.background
          ? { background: { ...state.background, messages: marcar(state.background.messages) } }
          : {}),
      };
    }),

  updateActivity: (id, patch, contentPatch) =>
    set((state) =>
      escritaDoTurno(state, (ms) =>
        ms.map((m) => {
          if (m.id !== id) return m;
          if (m.type !== "ai-comment") return m;
          if (!m.activity) return m;
          return {
            ...m,
            activity: { ...m.activity, ...patch },
            ...(contentPatch !== undefined ? { content: contentPatch } : {}),
          };
        })
      )
    ),
  setReaction: (id, reaction) =>
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.id !== id) return m;
        if (m.type !== "ai-response") return m;
        return { ...m, reaction };
      }),
    })),
  setAgentSteps: (id, steps) =>
    set((state) =>
      escritaDoTurno(state, (ms) =>
        ms.map((m) =>
          m.id === id && m.type === "ai-response"
            ? { ...m, agentSteps: steps }
            : m
        )
      )
    ),
  setTruncated: (id, truncated) =>
    set((state) =>
      escritaDoTurno(state, (ms) =>
        ms.map((m) =>
          m.id === id && m.type === "ai-response" ? { ...m, truncated } : m
        )
      )
    ),
  beginVariant: (id) =>
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.id !== id || m.type !== "ai-response") return m;

        const variants =
          m.variants && m.variants.length > 0 ? m.variants : [m.content];
        return {
          ...m,
          variants: [...variants, ""],
          variantIndex: variants.length,
          content: "",
          truncated: false,
        };
      }),
    })),

  discardEmptyVariant: (id) =>
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.id !== id || m.type !== "ai-response" || !m.variants) return m;
        if (m.content.trim() !== "") return m;
        const cur = m.variantIndex ?? m.variants.length - 1;
        const variants = m.variants.filter((_, i) => i !== cur);
        if (variants.length === 0) return m;
        const idx = Math.min(Math.max(0, cur - 1), variants.length - 1);
        if (variants.length === 1) {
          return {
            ...m,
            content: variants[0],
            variants: undefined,
            variantIndex: undefined,
          };
        }
        return { ...m, content: variants[idx], variants, variantIndex: idx };
      }),
    })),
  syncVariant: (id) =>
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.id !== id || m.type !== "ai-response") return m;
        if (!m.variants || m.variantIndex === undefined) return m;
        const variants = [...m.variants];
        variants[m.variantIndex] = m.content;
        return { ...m, variants };
      }),
    })),
  navigateVariant: (id, dir) =>
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.id !== id || m.type !== "ai-response" || !m.variants) return m;
        const n = m.variants.length;
        const current = m.variantIndex ?? n - 1;
        let i = current + dir;
        if (i < 0) i = 0;
        if (i > n - 1) i = n - 1;

        const variants = [...m.variants];
        variants[current] = m.content;
        return { ...m, variants, variantIndex: i, content: variants[i] };
      }),
    })),
  selectOption: (messageId, optionIndex) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId && m.type === "ai-options"
          ? { ...m, selectedIndex: optionIndex }
          : m
      ),
    })),
  clearMessages: () =>

    set((state) =>
      state.background
        ? {
            ...BASE_RESET,
            isLoading: state.isLoading,
            streamingMessageId: state.streamingMessageId,
          }
        : { ...BASE_RESET }
    ),
  setLoading: (loading) => set({ isLoading: loading }),
  setTurnChatId: (id) => set({ turnChatId: id }),
  setWaitingChatId: (id) => set({ waitingChatId: id }),
  setResume: (p) =>
    set({
      resumeScroll: p.scroll ?? null,
      resumeMessageId: p.messageId ?? null,
    }),
  detachTurn: (run) => set({ background: run }),
  attachTurn: () => {
    const bg: BackgroundRun | null = get().background;
    if (bg) set({ background: null });
    return bg;
  },
  clearBackground: () => set({ background: null }),
  setLoadingChat: (loading) => set({ loadingChat: loading }),

  addUsage: (input, output) =>
    set((state) => {
      const bg = state.background;
      if (bg) {
        return {
          background: {
            ...bg,
            tokensIn: bg.tokensIn + input,
            tokensOut: bg.tokensOut + output,
          },
        };
      }
      return {
        tokensIn: state.tokensIn + input,
        tokensOut: state.tokensOut + output,
        lastPromptTokens: input > 0 ? input : state.lastPromptTokens,
      };
    }),
  resetUsage: () => set({ tokensIn: 0, tokensOut: 0, lastPromptTokens: 0 }),
  setStreamingMessageId: (id) => set({ streamingMessageId: id }),
  startStreamTimer: () =>
    set({ streamStartedAt: Date.now(), streamTokens: 0, tokensPerSec: 0 }),
  tickStreamTokens: (chunk) =>
    set((state) => {
      if (state.streamStartedAt === null) {

        const now = Date.now();
        const approx = Math.max(1, Math.ceil(chunk.length / 3.5));
        return {
          streamStartedAt: now,
          streamTokens: approx,
          tokensPerSec: 0,
        };
      }
      const approx = Math.ceil(chunk.length / 3.5);
      const newTokens = state.streamTokens + approx;
      const elapsedSec = (Date.now() - state.streamStartedAt) / 1000;
      const tps = elapsedSec > 0.05 ? newTokens / elapsedSec : 0;
      return {
        streamTokens: newTokens,
        tokensPerSec: tps,
      };
    }),
  endStreamTimer: () => set({ streamStartedAt: null }),
  lockSession: (provider, model, mode) =>
    set({
      sessionProvider: provider,
      sessionModel: model,
      sessionMode: mode ?? "chat",
    }),
  unlockSession: () =>
    set({ sessionProvider: null, sessionModel: null, sessionMode: null }),
  setSessionPersona: (persona) => set({ sessionPersona: persona }),
  setSessionInstructions: (instructions) =>
    set({ sessionInstructions: instructions }),
  setCurrentChatId: (id) => set({ currentChatId: id }),
  setCurrentChatTitle: (title) => set({ currentChatTitle: title }),
  setCurrentChatStarred: (starred) => set({ currentChatStarred: starred }),
  setMessages: (msgs) => set({ messages: msgs }),
  pushQueued: (text) =>
    set((state) => ({ queued: [...state.queued, text] })),
  removeQueued: (index) =>
    set((state) => ({ queued: state.queued.filter((_, i) => i !== index) })),
  clearQueued: () => set({ queued: [] }),
  addAttachment: (att) =>
    set((state) => ({ attachments: [...state.attachments, att] })),
  removeAttachment: (index) =>
    set((state) => ({
      attachments: state.attachments.filter((_, i) => i !== index),
    })),
  setAttachments: (atts) => set({ attachments: atts }),
  setDraft: (key, text) =>
    set((state) => {
      if ((state.drafts[key] ?? "") === text) return state;
      const drafts = { ...state.drafts };

      if (text) drafts[key] = text;
      else delete drafts[key];
      return { drafts };
    }),
  newChat: () =>

    set((state) => ({
      ...BASE_RESET,
      ...(state.background
        ? {
            isLoading: state.isLoading,
            streamingMessageId: state.streamingMessageId,
          }
        : {}),
      currentChatId: null,
      currentChatTitle: "",
      currentChatStarred: false,
    })),
}));
