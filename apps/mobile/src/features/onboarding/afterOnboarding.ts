import { router, type Href } from 'expo-router';
import { useEffect } from 'react';

/**
 * Where to go right after onboarding, e.g. the statement import chosen on step 9 (D-037).
 *
 * The summary cannot navigate there itself: the import screen is reachable only once the
 * profile says onboarded, and at that moment the navigator replaces the onboarding screens with
 * the tabs (and unmounts the summary). So the summary leaves the destination here before saving,
 * and the navigator opens it, on top of the tabs, as soon as the guard has switched.
 */
let pending: Href | null = null;

export function setAfterOnboarding(href: Href | null): void {
  pending = href;
}

/** Returns the destination once and forgets it. */
export function takeAfterOnboarding(): Href | null {
  const href = pending;
  pending = null;
  return href;
}

/** In the root navigator: opens the remembered destination when `onboarded` becomes true. */
export function useAfterOnboarding(onboarded: boolean): void {
  useEffect(() => {
    if (!onboarded) return;
    const href = takeAfterOnboarding();
    if (href !== null) router.push(href);
  }, [onboarded]);
}
