import type { CorvusSettings } from "../settings";
import { tr } from "../i18n/tr";

export type KeyField =
  | "openaiApiKey"
  | "anthropicApiKey"
  | "geminiApiKey"
  | "openrouterApiKey"
  | "nimApiKey";

export type ModelField =
  | "defaultModel"
  | "anthropicModel"
  | "geminiModel"
  | "openrouterModel"
  | "nimModel"
  | "ollamaModel";

export interface ProviderMeta {
  id: string;
  name: string;
  icon: string;
  credential: KeyField | "ollamaEndpoint";
  model: ModelField;
  embeds: boolean;
}

export const PROVIDERS: readonly ProviderMeta[] = [
  { id: "openai", name: "OpenAI", icon: "logo-openai", credential: "openaiApiKey", model: "defaultModel", embeds: true },
  { id: "anthropic", name: "Anthropic", icon: "logo-anthropic", credential: "anthropicApiKey", model: "anthropicModel", embeds: false },
  { id: "gemini", name: "Gemini", icon: "logo-gemini", credential: "geminiApiKey", model: "geminiModel", embeds: true },
  { id: "openrouter", name: "OpenRouter", icon: "logo-openrouter", credential: "openrouterApiKey", model: "openrouterModel", embeds: true },
  { id: "nim", name: "Nvidia NIM", icon: "logo-nvidia", credential: "nimApiKey", model: "nimModel", embeds: true },
  { id: "ollama", name: "Ollama", icon: "logo-ollama", credential: "ollamaEndpoint", model: "ollamaModel", embeds: true },
];

export const EMBEDDING_PROVIDERS: readonly string[] = PROVIDERS.filter((p) => p.embeds).map((p) => p.id);

export function isProviderId(id: string): boolean {
  return PROVIDERS.some((p) => p.id === id);
}

export function providerMeta(id: string): ProviderMeta {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];
}

export type CredentialField = ProviderMeta["credential"];

export type Credentials = Partial<Pick<CorvusSettings, CredentialField>>;

export function providerCredential(s: Credentials, id: string): string {
  return s[providerMeta(id).credential] ?? "";
}

export function providerConfigured(s: CorvusSettings, id: string): boolean {
  return !!providerCredential(s, id).trim();
}

export type ProviderHealth = "off" | "unknown" | "ok" | "fail";

export function providerHealth(s: CorvusSettings, id: string): ProviderHealth {
  if (!providerConfigured(s, id)) return "off";
  const st = s.providerStatus?.[id];
  if (!st) return "unknown";
  return st.ok ? "ok" : "fail";
}

export function providerBlockedReason(s: CorvusSettings, id: string): string | null {
  switch (providerHealth(s, id)) {
    case "off":
      return tr("No credential yet — add one in Settings › Providers.");
    case "fail":
      return tr("Last connection test failed — check the key in Settings › Providers.");
    default:
      return null;
  }
}

export function providerIcon(id: string): string {
  return PROVIDERS.find((p) => p.id === id)?.icon ?? "message-square";
}
