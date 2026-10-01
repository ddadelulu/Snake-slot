import type { Language, Profile } from '@budget/core';
import { useEffect, useRef } from 'react';

import { useProfile, useUpdateProfile } from '@/data/profile';

import { useLanguage } from './LanguageProvider';

export type LanguageSyncDecision =
  | { action: 'none' }
  | { action: 'update-profile'; language: Language }
  | { action: 'adopt'; language: Language };

/**
 * Keeps the account's language (used for push notifications and the assistant) and the language
 * on screen in step:
 *
 * - A language picked on this device in Settings is written to the account.
 * - An account whose profile was never changed since sign-up takes the language on screen. This
 *   covers Google and Apple sign-ups, which cannot pass a language when the account is created.
 * - Otherwise the device follows the account, e.g. when signing in on a new phone.
 */
export function decideLanguageSync(input: {
  profile: Pick<Profile, 'language' | 'created_at' | 'updated_at'> | undefined;
  language: Language;
  explicit: boolean;
}): LanguageSyncDecision {
  const { profile, language, explicit } = input;
  if (!profile || profile.language === language) return { action: 'none' };
  const untouchedSinceSignUp = profile.updated_at === profile.created_at;
  if (explicit || untouchedSinceSignUp) return { action: 'update-profile', language };
  return { action: 'adopt', language: profile.language };
}

/** Renders nothing; mount it once inside the signed-in part of the app. */
export function ProfileLanguageSync() {
  const { data: profile } = useProfile();
  const { mutate, isPending } = useUpdateProfile();
  const { language, explicit, loaded, adoptLanguage } = useLanguage();
  // One write attempt per target language, so a failing request (offline) cannot loop.
  const attempted = useRef<Language | null>(null);

  useEffect(() => {
    if (!loaded || isPending) return;
    const decision = decideLanguageSync({ profile, language, explicit });
    if (decision.action === 'adopt') {
      adoptLanguage(decision.language);
    } else if (decision.action === 'update-profile' && attempted.current !== decision.language) {
      attempted.current = decision.language;
      mutate({ language: decision.language });
    }
  }, [profile, language, explicit, loaded, isPending, adoptLanguage, mutate]);

  return null;
}
