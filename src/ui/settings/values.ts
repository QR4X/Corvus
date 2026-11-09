import type { CorvusSettings } from "../../main";
import { CORVUS_HIDDEN, CHATS_FOLDER } from "../../core/vaultPaths";

const BOOL_KEYS = [
  "assistantSeesVault",
  "voiceEnabled",
  "ttsEnabled",
  "openaiDataSharing",
  "agentDiffApproval",
  "agentWeb",
  "travarNoLimite",
  "ragAutoReindex",
  "mobileFullscreen",
  "hapticsEnabled",
  "ragStreamShards",
  "instagramReelsEnabled",
  "keepAwakeWhileWriting",
] as const;

const TEXT_KEYS = [
  "defaultProvider",
  "defaultMode",
  "startupChatMode",
  "defaultEffort",
  "language",
  "voiceModel",
  "voiceLanguage",
  "ttsVoice",
  "ttsModel",
  "elevenModel",
  "openaiTier",
  "chatsPath",
  "skillsPath",
  "agentPermissionLevel",
  "agentInstructionsPath",
  "ragQuantProfile",
  "ragIndexPath",
] as const;

export type BoolKey = (typeof BOOL_KEYS)[number];
export type TextKey = (typeof TEXT_KEYS)[number];
export type ControlKey = BoolKey | TextKey;

const BOOLS: ReadonlySet<string> = new Set(BOOL_KEYS);
const TEXTS: ReadonlySet<string> = new Set(TEXT_KEYS);

export function isControlKey(key: string): key is ControlKey {
  return BOOLS.has(key) || TEXTS.has(key);
}

export const DEFAULT_CHATS_PATH = CHATS_FOLDER;

export const DEFAULT_SKILLS_PATH = "corvus-ai/skills";

export const DEFAULT_INDEX_PATH = `${CORVUS_HIDDEN}/index`;

export function readControl(s: CorvusSettings, key: ControlKey): boolean | string {
  switch (key) {

    case "assistantSeesVault":
      return !!s.assistantSeesVault;
    case "openaiDataSharing":
      return s.openaiDataSharing === true;
    case "mobileFullscreen":
      return s.mobileFullscreen === true;
    case "hapticsEnabled":
      return s.hapticsEnabled !== false;

    case "agentWeb":
      return s.agentWeb !== false;
    case "instagramReelsEnabled":
      return s.instagramReelsEnabled !== false;
    case "keepAwakeWhileWriting":
      return s.keepAwakeWhileWriting !== false;
    case "travarNoLimite":
      return s.travarNoLimite === true;
    case "language":
      return s.language || "en-us";

    case "openaiTier":
      return String(s.openaiTier ?? 1);
    default:
      return s[key];
  }
}

export function applyControl(
  s: CorvusSettings,
  key: ControlKey,
  value: unknown
): void {
  if (BOOLS.has(key)) {
    s[key as BoolKey] = value === true;
    return;
  }
  const v =
    typeof value === "string"
      ? value
      : typeof value === "number"
        ? String(value)
        : "";
  switch (key) {
    case "openaiTier":
      s.openaiTier = Number(v) || 1;
      return;

    case "chatsPath":
      s.chatsPath = v.trim() || DEFAULT_CHATS_PATH;
      return;
    case "skillsPath":
      s.skillsPath = v.trim() || DEFAULT_SKILLS_PATH;
      return;
    case "agentInstructionsPath":
      s.agentInstructionsPath = v.trim();
      return;

    case "ragIndexPath":
      s.ragIndexPath = v.trim().replace(/^\/+|\/+$/g, "") || DEFAULT_INDEX_PATH;
      return;
    default:
      s[key as Exclude<TextKey, "openaiTier">] = v;
  }
}

export interface SettingsSaver {
  settings: CorvusSettings;
  saveSettings(): Promise<void>;
}

export async function writeControl(
  plugin: SettingsSaver,
  key: string,
  value: unknown
): Promise<boolean> {
  if (!isControlKey(key)) {
    console.warn(`[corvus] settings: "${key}" is not a control — ignored.`);
    return false;
  }
  applyControl(plugin.settings, key, value);
  await plugin.saveSettings();
  return true;
}
