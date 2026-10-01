import identity from './app-identity.json';

/**
 * App identity. The product name is a working title (decision D-001). Renaming the app means
 * editing `app-identity.json` (read here and by `apps/mobile/app.config.ts`), nothing else.
 */
export const APP_NAME: string = identity.name;

/** Deep-link scheme, e.g. `batzen://auth/callback`. Must match the Supabase redirect allow-list. */
export const APP_SCHEME: string = identity.scheme;

/** The only currency the app books in. Foreign purchases use the CHF amount the source booked. */
export const BASE_CURRENCY = 'CHF';
