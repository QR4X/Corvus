import { DEFAULT_SETTINGS, type CorvusSettings } from "../../settings";

const BOOL_KEYS = [
  "assistantSeesVault",
  "voiceEnabled",
  "ttsEnabled",
  "openaiDataSharing",
  "agentDiffApproval",
  "agentWeb",
  "blockAtLimit",
  "ragAutoReindex",
  "mobileFullscreen",
  "hapticsEnabled",
  "ragStreamShards",
  "keepAwakeWhileWriting",
] as const;

const TEXT_KEYS = [
  "defaultProvider",
  "defaultMode",
  "startupChatMode",
  "defaultEffort",
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
type ControlKey = BoolKey | TextKey;

const BOOLS: ReadonlySet<string> = new Set(BOOL_KEYS);
const TEXTS: ReadonlySet<string> = new Set(TEXT_KEYS);

export function isControlKey(key: string): key is ControlKey {
  return BOOLS.has(key) || TEXTS.has(key);
}

export function readControl(s: CorvusSettings, key: ControlKey): boolean | string {
  const v = s[key] ?? DEFAULT_SETTINGS[key];
  return typeof v === "number" ? String(v) : v;
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
      s.chatsPath = v.trim() || DEFAULT_SETTINGS.chatsPath;
      return;
    case "skillsPath":
      s.skillsPath = v.trim() || DEFAULT_SETTINGS.skillsPath;
      return;
    case "agentInstructionsPath":
      s.agentInstructionsPath = v.trim();
      return;

    case "ragIndexPath":
      s.ragIndexPath = v.trim().replace(/^\/+|\/+$/g, "") || DEFAULT_SETTINGS.ragIndexPath;
      return;
    default:
      s[key as Exclude<TextKey, "openaiTier">] = v;
  }
}

interface SettingsSaver {
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
