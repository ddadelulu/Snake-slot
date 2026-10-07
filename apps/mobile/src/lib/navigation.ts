import { router, type Href } from 'expo-router';

/**
 * Back to where the person came from, or to `fallback` when the screen was opened directly (a
 * deep link such as batzen://add, or a reload on the web).
 */
export function goBackOr(fallback: Href): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
