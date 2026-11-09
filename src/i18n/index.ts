import { createContext, useContext } from "react";
import { EN_US, type Translations } from "./en-us";

export type { Translations } from "./en-us";

export const LOCALES = [
  { id: "auto", label: "Same as Obsidian" },
  { id: "en-us", label: "English" },
] as const;

export function resolveLocale(_locale: string): "en-us" {
  return "en-us";
}

export function getTranslations(_locale: string): Translations {
  return EN_US;
}

export const TranslationsContext = createContext<Translations>(EN_US);

export function useT(): Translations {
  return useContext(TranslationsContext);
}
