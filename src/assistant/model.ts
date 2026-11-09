import { tr } from "../i18n/tr";

export interface AssistantAlvo {
  provider: string;
  model: string;
}

export interface AssistantFontes {

  freeModels?: Record<string, string[]>;

  assistantProvider?: string;
  assistantModel?: string;

  favoriteModels?: Record<string, string[]>;

  activeModels?: Record<string, string[]>;
}

export function ehFree(model: string, livres?: readonly string[]): boolean {
  if (livres?.length && livres.includes(model)) return true;
  return (model || "").toLowerCase().endsWith(":free");
}

export function escolherAssistente(s: AssistantFontes): AssistantAlvo | null {
  const escolhido = (s.assistantModel ?? "").trim();
  if (escolhido)
    return {
      provider: (s.assistantProvider ?? "openrouter").trim() || "openrouter",
      model: escolhido,
    };

  const livres = s.freeModels?.openrouter ?? [];
  const eGratis = (m: string) => ehFree(m, livres);

  const favoritos = s.favoriteModels?.openrouter ?? [];
  const favFree = favoritos.find(eGratis);
  if (favFree) return { provider: "openrouter", model: favFree };

  const ativos = s.activeModels?.openrouter ?? [];
  const ativoFree = ativos.find(eGratis);
  if (ativoFree) return { provider: "openrouter", model: ativoFree };

  if (livres.length) return { provider: "openrouter", model: livres[0] };

  return null;
}

export function motivoIndisponivel(
  alvo: AssistantAlvo | null,
  temChave: (provider: string) => boolean
): string | null {
  if (!alvo)
    return tr(
      "Pick an assistant model in Settings — a free OpenRouter model works."
    );
  if (!temChave(alvo.provider))
    return tr("Add your {provider} key in Settings to use the assistant.", {
      provider: alvo.provider,
    });
  return null;
}
