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
import { useColorScheme } from 'react-native';

import { themes, type ColorScheme, type Theme } from './tokens';

export const APPEARANCE_PREFERENCES = ['system', 'light', 'dark'] as const;
export type AppearancePreference = (typeof APPEARANCE_PREFERENCES)[number];

/** AsyncStorage key of the appearance setting (a device preference, not synced to the server). */
export const APPEARANCE_STORAGE_KEY = 'prefs.appearance';

export function isAppearancePreference(value: unknown): value is AppearancePreference {
  return typeof value === 'string' && (APPEARANCE_PREFERENCES as readonly string[]).includes(value);
}

/** The scheme to draw: the user's choice, or the operating system's when the choice is "system". */
export function resolveColorScheme(
  preference: AppearancePreference,
  systemScheme: string | null | undefined,
): ColorScheme {
  if (preference !== 'system') return preference;
  return systemScheme === 'dark' ? 'dark' : 'light';
}

export type AppearanceContextValue = {
  theme: Theme;
  scheme: ColorScheme;
  preference: AppearancePreference;
  /**
   * Applies the preference immediately and saves it. Saving is best effort: if storage fails the
   * choice still holds for this session, so the promise only rejects for an unknown value.
   */
  setPreference: (preference: AppearancePreference) => Promise<void>;
  /** False until the saved preference has been read; keep the splash screen up until then. */
  loaded: boolean;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export type ThemeProviderProps = { children: ReactNode };

export function ThemeProvider({ children }: ThemeProviderProps) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<AppearancePreference>('system');
  const [loaded, setLoaded] = useState(false);
  // A choice made while the saved value is still loading must win over the stale saved value.
  const userHasChosen = useRef(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(APPEARANCE_STORAGE_KEY)
      .then((stored) => {
        if (active && !userHasChosen.current && isAppearancePreference(stored)) {
          setPreferenceState(stored);
        }
      })
      .catch(() => {
        // Unreadable storage behaves like a fresh install: follow the system.
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const setPreference = useCallback(async (next: AppearancePreference) => {
    if (!isAppearancePreference(next)) {
      throw new TypeError(`Unknown appearance preference "${String(next)}"`);
    }
    userHasChosen.current = true;
    setPreferenceState(next);
    try {
      await AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, next);
    } catch {
      // Best effort, see AppearanceContextValue.setPreference.
    }
  }, []);

  const scheme = resolveColorScheme(preference, systemScheme);

  const value = useMemo<AppearanceContextValue>(
    () => ({ theme: themes[scheme], scheme, preference, setPreference, loaded }),
    [scheme, preference, setPreference, loaded],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

function useAppearanceContext(hookName: string): AppearanceContextValue {
  const value = useContext(AppearanceContext);
  if (value === null) {
    throw new Error(`${hookName}() must be used inside <ThemeProvider>. Wrap the app root in it.`);
  }
  return value;
}

/** The active design tokens. `theme.scheme` says whether it is the light or the dark set. */
export function useTheme(): Theme {
  return useAppearanceContext('useTheme').theme;
}

/** The appearance setting for the settings screen, plus the resolved scheme for the status bar. */
export function useAppearance(): AppearanceContextValue {
  return useAppearanceContext('useAppearance');
}
