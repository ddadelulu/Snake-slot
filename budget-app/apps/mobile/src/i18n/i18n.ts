import { DEFAULT_LANGUAGE, LANGUAGES, type Language } from '@budget/core';
import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { de } from './de';
import { en } from './en';

/** Catalogues per language. Adding French or Italian: add `fr.ts`/`it.ts` and the language to LANGUAGES. */
export const resources = {
  de: { translation: de },
  en: { translation: en },
} as const satisfies Record<Language, unknown>;

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof en };
  }
}

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/**
 * The language to start with when the person has not chosen one: the first of the phone's
 * preferred languages that the app supports, otherwise German (the app is for Switzerland).
 */
export function deviceLanguage(): Language {
  try {
    for (const locale of getLocales()) {
      if (isLanguage(locale.languageCode)) return locale.languageCode;
    }
  } catch {
    // No locale information (some test and web environments): use the default.
  }
  return DEFAULT_LANGUAGE;
}

export const i18n = createInstance();

void i18n.use(initReactI18next).init({
  resources,
  lng: deviceLanguage(),
  fallbackLng: 'en',
  supportedLngs: [...LANGUAGES],
  interpolation: { escapeValue: false },
  returnNull: false,
  initAsync: false,
});
