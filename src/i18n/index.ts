// src/i18n/index.ts
// Setup do i18n: registry de locales + context React + hook useT.
//
// Uso em componente React:
//   const t = useT();
//   return <button>{t.menu.copy}</button>;
//
// Uso em código TS puro (ex.: CorvusSettingsTab):
//   const t = getTranslations(plugin.settings.language);
//   notice(t.settings.modelSetNotice(modelName));

import { createContext, useContext } from "react";
import { getLanguage } from "obsidian";
import { EN_US, type Translations } from "./en-us";
import { PT_BR } from "./pt-br";

export type { Translations } from "./en-us";

/** Os idiomas que o app fala. Dois, e a lista é esta — o seletor das settings
 *  e a assistente de criação leem daqui, pra não haver um terceiro por
 *  descuido (ver assistant/prompt.ts: idiomaDoApp). */
export const LOCALES = [
  { id: "auto", label: "Same as Obsidian" },
  { id: "en-us", label: "English" },
  { id: "pt-br", label: "Português (Brasil)" },
] as const;

/**
 * O idioma de verdade: "auto" segue o do Obsidian (português em qualquer
 * variante vira pt-BR, o resto inglês); o resto é o que a pessoa escolheu.
 */
export function resolverIdioma(locale: string): "en-us" | "pt-br" {
  if (locale === "pt-br" || locale === "en-us") return locale;
  if (locale === "auto") {
    let doObsidian = "en";
    try {
      doObsidian = getLanguage() || "en";
    } catch {
      // Obsidian antigo sem getLanguage: inglês.
    }
    return /^pt/i.test(doObsidian) ? "pt-br" : "en-us";
  }
  return "en-us";
}

const DICIONARIOS: Record<string, Translations> = {
  "en-us": EN_US,
  "pt-br": PT_BR,
};

/**
 * O dicionário do locale — EN-US pra qualquer coisa que não reconheça.
 *
 * Cair no inglês em vez de quebrar é de propósito: `language` vem das
 * settings, que são um JSON que a pessoa pode editar na mão, e um locale
 * digitado errado não pode derrubar o app.
 */
export function getTranslations(locale: string): Translations {
  return DICIONARIOS[resolverIdioma(locale)] ?? EN_US;
}

/** Context React — CorvusApp envolve toda a árvore com o locale ativo. */
export const TranslationsContext = createContext<Translations>(EN_US);

/** Hook pra ler o dicionário do locale ativo. */
export function useT(): Translations {
  return useContext(TranslationsContext);
}
