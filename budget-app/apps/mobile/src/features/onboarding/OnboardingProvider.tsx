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

import {
  ONBOARDING_STEPS,
  createDraft,
  restoreDraft,
  type OnboardingDraft,
  type OnboardingStep,
} from './draft';

/**
 * Holds the questionnaire answers while the person goes through onboarding, and keeps them on
 * the device (per account) so closing the app does not lose them. Cleared when onboarding is
 * complete.
 */

export const draftStorageKey = (userId: string) => `onboarding.draft.v1.${userId}`;

const SAVE_DELAY_MS = 300;

type OnboardingContextValue = {
  draft: OnboardingDraft;
  /** False until the saved draft has been read. */
  loaded: boolean;
  update: (
    change: Partial<OnboardingDraft> | ((draft: OnboardingDraft) => Partial<OnboardingDraft>),
  ) => void;
  /** Records that a step was reached (for resuming). */
  markReached: (step: OnboardingStep) => void;
  /** Forgets the saved answers (after completion). */
  clear: () => Promise<void>;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [draft, setDraft] = useState<OnboardingDraft>(createDraft);
  const [loaded, setLoaded] = useState(false);
  const key = draftStorageKey(userId);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touched = useRef(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(key)
      .then((stored) => {
        if (!active || touched.current || stored === null) return;
        try {
          setDraft(restoreDraft(JSON.parse(stored)));
        } catch {
          // A corrupt save behaves like no save: start fresh.
        }
      })
      .catch(() => {
        // Unreadable storage: start fresh.
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [key]);

  useEffect(() => {
    if (!loaded || !touched.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      AsyncStorage.setItem(key, JSON.stringify(draft)).catch(() => {
        // Best effort: the answers stay in memory for this session.
      });
    }, SAVE_DELAY_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [draft, key, loaded]);

  const update = useCallback<OnboardingContextValue['update']>((change) => {
    touched.current = true;
    setDraft((current) => ({
      ...current,
      ...(typeof change === 'function' ? change(current) : change),
    }));
  }, []);

  const markReached = useCallback(
    (step: OnboardingStep) => {
      const index = ONBOARDING_STEPS.indexOf(step);
      update((current) => (index > current.reached ? { reached: index } : {}));
    },
    [update],
  );

  const clear = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    touched.current = false;
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      // Nothing else to do: a leftover draft is ignored once onboarding is complete.
    }
  }, [key]);

  const value = useMemo(
    () => ({ draft, loaded, update, markReached, clear }),
    [draft, loaded, update, markReached, clear],
  );
  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingContextValue {
  const value = useContext(OnboardingContext);
  if (!value) throw new Error('useOnboarding() must be used inside <OnboardingProvider>.');
  return value;
}
