import type { LivroDoDia } from "./usage/dailyLedger";
import type { EffortConfig, EffortLevel } from "./core/effort";
import type { Project } from "./projects";
import { CHATS_FOLDER, INDEX_FOLDER, SKILLS_FOLDER } from "./core/vaultPaths";

interface ProviderStatus {
  ok: boolean;

  at: number;

  detail?: string;
}

export interface CorvusSettings {

  openaiApiKey: string;
  anthropicApiKey: string;
  geminiApiKey: string;
  openrouterApiKey: string;
  nimApiKey: string;

  ollamaEndpoint: string;

  ollamaPadraoRevisto?: boolean;

  defaultProvider: string;

  defaultModel: string;
  anthropicModel: string;
  geminiModel: string;
  openrouterModel: string;
  nimModel: string;
  ollamaModel: string;

  ollamaVistos?: string[];

  activeModels: Record<string, string[]>;

  favoriteModels: Record<string, string[]>;

  freeModels: Record<string, string[]>;

  freeQuota: Record<string, { limit: number; remaining?: number; at: number }>;

  usoDoDia: LivroDoDia;

  limitesDiarios: Record<string, number>;

  limiteGastoDiario: number;

  travarNoLimite: boolean;

  assistantProvider: string;
  assistantModel: string;

  assistantSeesVault: boolean;

  openaiDataSharing: boolean;

  openaiTier: number;

  providerStatus: Record<string, ProviderStatus>;

  voiceEnabled: boolean;

  voiceModel: string;

  voiceLanguage: string;

  ttsEnabled: boolean;

  ttsProvider: string;

  ttsModel: string;

  ttsVoice: string;

  elevenApiKey: string;
  elevenModel: string;

  elevenVoice: string;

  elevenVoices: { id: string; name: string; category?: string }[];

  hapticsEnabled: boolean;

  discoveredEmbeddings: Record<string, string[]>;

  discoveredModels: Record<string, string[]>;

  unreadChats: string[];

  defaultMode: string;

  startupChatMode: string;

  defaultEffort: string;

  effortConfigs: Partial<Record<EffortLevel, Partial<EffortConfig>>>;

  chatsPath: string;
  skillsPath: string;

  projects: Project[];

  ragIndexPath: string;
  ragEmbeddingProvider: string;
  ragEmbeddingModel: string;

  ragQuantProfile: string;

  ragStreamShards: boolean;

  ragAutoReindex: boolean;

  ragMobileSkipNoticeShown?: boolean;

  agentPermissionLevel: string;

  agentInstructionsPath: string;

  agentDiffApproval: boolean;

  agentWeb: boolean;

  tavilyApiKey: string;

  mobileFullscreen: boolean;

  keepAwakeWhileWriting: boolean;
}

export const DEFAULT_SETTINGS: CorvusSettings = {
  openaiApiKey: "",
  anthropicApiKey: "",
  geminiApiKey: "",
  openrouterApiKey: "",
  nimApiKey: "",

  ollamaEndpoint: "",
  defaultProvider: "openai",
  defaultModel: "gpt-4o",
  anthropicModel: "claude-sonnet-4-6",
  geminiModel: "gemini-2.5-flash",
  openrouterModel: "anthropic/claude-3.5-sonnet",
  nimModel: "meta/llama-3.3-70b-instruct",

  ollamaModel: "",
  activeModels: {
    openai: ["gpt-4o", "gpt-4o-mini", "o1", "o3", "gpt-5"],
    anthropic: [
      "claude-opus-4-8",
      "claude-sonnet-4-6",
      "claude-haiku-4-5-20251001",
    ],
    gemini: [
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemini-3.5-flash",
      "gemini-3.1-flash-lite",
    ],
    openrouter: [
      "openrouter/auto",
      "anthropic/claude-3.5-sonnet",
      "openai/gpt-4o",
      "meta-llama/llama-3.3-70b-instruct",
      "google/gemini-2.0-flash-001",
    ],
    nim: [
      "meta/llama-3.3-70b-instruct",
      "meta/llama-3.1-70b-instruct",
      "meta/llama-3.1-8b-instruct",
      "nvidia/llama-3.1-nemotron-70b-instruct",
      "mistralai/mixtral-8x22b-instruct-v0.1",
      "deepseek-ai/deepseek-r1",
      "qwen/qwen2.5-72b-instruct",
      "microsoft/phi-4",
    ],
    ollama: [],
  },
  favoriteModels: {},
  freeModels: {},
  freeQuota: {},
  usoDoDia: {},
  limitesDiarios: {},
  limiteGastoDiario: 0,
  travarNoLimite: false,
  assistantProvider: "",
  assistantModel: "",

  assistantSeesVault: false,

  openaiDataSharing: false,
  openaiTier: 1,
  providerStatus: {},
  voiceEnabled: true,
  voiceModel: "gpt-4o-mini-transcribe",
  voiceLanguage: "",
  ttsEnabled: false,
  ttsProvider: "openai",
  ttsModel: "gpt-4o-mini-tts",
  ttsVoice: "alloy",
  elevenApiKey: "",
  elevenModel: "eleven_multilingual_v2",
  elevenVoice: "",
  elevenVoices: [],
  hapticsEnabled: true,
  discoveredEmbeddings: {},
  discoveredModels: {},
  unreadChats: [],
  defaultMode: "chat",

  startupChatMode: "",
  defaultEffort: "med",
  effortConfigs: {},

  chatsPath: CHATS_FOLDER,
  skillsPath: SKILLS_FOLDER,
  projects: [],
  ragIndexPath: INDEX_FOLDER,
  ragEmbeddingProvider: "openai",
  ragEmbeddingModel: "text-embedding-3-small",
  ragQuantProfile: "balanced",
  ragStreamShards: false,
  ragAutoReindex: false,
  ragMobileSkipNoticeShown: false,
  agentPermissionLevel: "ask",
  agentInstructionsPath: "",
  agentDiffApproval: true,
  agentWeb: true,
  tavilyApiKey: "",
  mobileFullscreen: false,

  keepAwakeWhileWriting: true,
};

export const SECRET_FIELDS = [
  "openaiApiKey",
  "anthropicApiKey",
  "geminiApiKey",
  "openrouterApiKey",
  "nimApiKey",
  "elevenApiKey",
  "tavilyApiKey",
] as const satisfies readonly (keyof CorvusSettings)[];
