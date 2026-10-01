import type { Language } from '@budget/core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { I18nextProvider } from 'react-i18next';

import { deviceLanguage, i18n, isLanguage } from './i18n';

/** AsyncStorage key of the language the person picked in Settings (a device preference). */
export const LANGUAGE_STORAGE_KEY = 'prefs.language';

export type LanguageContextValue = {
  language: Language;
  /** True once the person picked a language on this device (not just the phone's default). */
  explicit: boolean;
  /** False until the saved choice has been read; keep the splash screen up until then. */
  loaded: boolean;
  /** The person picks a language: applied now, saved on the device. */
  setLanguage: (language: Language) => Promise<void>;
  /** Follow the language stored on the account without marking it as picked on this device. */
  adoptLanguage: (language: Language) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

type State = { language: Language; explicit: boolean; loaded: boolean };

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(() => ({
    language: deviceLanguage(),
    explicit: false,
    loaded: false,
  }));
  const userHasChosen = useRef(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(LANGUAGE_STORAGE_KEY)
      .then((stored) => {
        if (!active || userHasChosen.current) return;
        setState((current) =>
          isLanguage(stored)
            ? { language: stored, explicit: true, loaded: true }
            : { ...current, loaded: true },
        );
      })
      .catch(() => {
        if (active) setState((current) => ({ ...current, loaded: true }));
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (i18n.language !== state.language) void i18n.changeLanguage(state.language);
  }, [state.language]);

  const setLanguage = useCallback(async (language: Language) => {
    userHasChosen.current = true;
    setState({ language, explicit: true, loaded: true });
    try {
      await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Best effort: the choice holds for this session even if it cannot be saved.
    }
  }, []);

  const adoptLanguage = useCallback((language: Language) => {
    setState((current) => (current.explicit ? current : { ...current, language }));
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({ ...state, setLanguage, adoptLanguage }),
    [state, setLanguage, adoptLanguage],
  );

  return (
    <LanguageContext.Provider value={value}>
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguage() must be used inside <LanguageProvider>.');
  return value;
}
