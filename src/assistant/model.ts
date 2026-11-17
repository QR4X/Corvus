import { tr } from "../i18n/tr";

interface AssistantTarget {
  provider: string;
  model: string;
}

interface AssistantSources {

  freeModels?: Record<string, string[]>;

  assistantProvider?: string;
  assistantModel?: string;

  favoriteModels?: Record<string, string[]>;

  activeModels?: Record<string, string[]>;
}

export function isFree(model: string, freeIds?: readonly string[]): boolean {
  if (freeIds?.length && freeIds.includes(model)) return true;
  return (model || "").toLowerCase().endsWith(":free");
}

export function pickAssistant(s: AssistantSources): AssistantTarget | null {
  const chosen = (s.assistantModel ?? "").trim();
  if (chosen)
    return {
      provider: (s.assistantProvider ?? "openrouter").trim() || "openrouter",
      model: chosen,
    };

  const freeIds = s.freeModels?.openrouter ?? [];
  const isListedFree = (m: string) => isFree(m, freeIds);

  const favorites = s.favoriteModels?.openrouter ?? [];
  const freeFavorite = favorites.find(isListedFree);
  if (freeFavorite) return { provider: "openrouter", model: freeFavorite };

  const active = s.activeModels?.openrouter ?? [];
  const freeActive = active.find(isListedFree);
  if (freeActive) return { provider: "openrouter", model: freeActive };

  if (freeIds.length) return { provider: "openrouter", model: freeIds[0] };

  return null;
}

export function unavailableReason(
  target: AssistantTarget | null,
  hasKey: (provider: string) => boolean
): string | null {
  if (!target)
    return tr(
      "Pick an assistant model in Settings — a free OpenRouter model works."
    );
  if (!hasKey(target.provider))
    return tr("Add your {provider} key in Settings to use the assistant.", {
      provider: target.provider,
    });
  return null;
}
