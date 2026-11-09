import type CorvusPlugin from "../main";
import { tr } from "../i18n/tr";

export const PROVIDERS = [
  { id: "openai", name: "OpenAI", icon: "logo-openai" },
  { id: "anthropic", name: "Anthropic", icon: "logo-anthropic" },
  { id: "gemini", name: "Gemini", icon: "logo-gemini" },
  { id: "openrouter", name: "OpenRouter", icon: "logo-openrouter" },
  { id: "nim", name: "Nvidia NIM", icon: "logo-nvidia" },
  { id: "ollama", name: "Ollama", icon: "logo-ollama" },
];

export type ProviderHealth = "off" | "unknown" | "ok" | "fail";

export function providerHealth(
  plugin: CorvusPlugin,
  id: string
): ProviderHealth {
  if (!providerConfigured(plugin, id)) return "off";
  const st = plugin.settings.providerStatus?.[id];
  if (!st) return "unknown";
  return st.ok ? "ok" : "fail";
}

export function providerUsable(plugin: CorvusPlugin, id: string): boolean {
  const h = providerHealth(plugin, id);
  return h === "ok" || h === "unknown";
}

export function providerBlockedReason(
  plugin: CorvusPlugin,
  id: string
): string | null {
  switch (providerHealth(plugin, id)) {
    case "off":
      return tr("No credential yet — add one in Settings › Providers.");
    case "fail":
      return tr("Last connection test failed — check the key in Settings › Providers.");
    default:
      return null;
  }
}

export function providerConfigured(plugin: CorvusPlugin, id: string): boolean {
  const s = plugin.settings;
  switch (id) {
    case "anthropic": return !!s.anthropicApiKey?.trim();
    case "gemini": return !!s.geminiApiKey?.trim();
    case "openrouter": return !!s.openrouterApiKey?.trim();
    case "nim": return !!s.nimApiKey?.trim();
    case "ollama": return !!s.ollamaEndpoint?.trim();
    default: return !!s.openaiApiKey?.trim();
  }
}
