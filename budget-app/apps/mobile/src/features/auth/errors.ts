import { isAuthError } from '@supabase/supabase-js';

/**
 * Everything an auth screen can tell the user went wrong. Screens show `t('auth.errors.' + code)`;
 * the i18n test checks the catalogue against AUTH_ERROR_CODES.
 */
export const AUTH_ERROR_CODES = [
  'invalid_credentials',
  'email_not_confirmed',
  'user_already_exists',
  'weak_password',
  'rate_limited',
  'network',
  'provider_disabled',
  'signup_disabled',
  'session_expired',
  'link_invalid',
  'unknown',
] as const;
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

/**
 * Supabase Auth error codes (@supabase/auth-js lib/error-codes.ts) and OAuth 2.0 redirect `error`
 * values, mapped to what the user needs to know. Codes not listed here fall through to the
 * status/class/message checks in toAuthErrorCode and finally to 'unknown'.
 */
const SERVER_CODES: ReadonlyMap<string, AuthErrorCode> = new Map<string, AuthErrorCode>([
  ['invalid_credentials', 'invalid_credentials'],

  ['email_not_confirmed', 'email_not_confirmed'],
  ['provider_email_needs_verification', 'email_not_confirmed'],

  ['user_already_exists', 'user_already_exists'],
  ['email_exists', 'user_already_exists'],
  ['identity_already_exists', 'user_already_exists'],

  ['weak_password', 'weak_password'],
  // Choosing the current password again during a reset: "pick another password" covers it.
  ['same_password', 'weak_password'],

  ['over_request_rate_limit', 'rate_limited'],
  ['over_email_send_rate_limit', 'rate_limited'],
  ['over_sms_send_rate_limit', 'rate_limited'],

  ['request_timeout', 'network'],
  ['hook_timeout', 'network'],
  ['hook_timeout_after_retry', 'network'],
  ['temporarily_unavailable', 'network'],

  ['provider_disabled', 'provider_disabled'],
  ['email_provider_disabled', 'provider_disabled'],
  ['oauth_provider_not_supported', 'provider_disabled'],

  ['signup_disabled', 'signup_disabled'],

  ['session_expired', 'session_expired'],
  ['session_not_found', 'session_expired'],
  ['refresh_token_not_found', 'session_expired'],
  ['refresh_token_already_used', 'session_expired'],
  ['bad_jwt', 'session_expired'],
  ['no_authorization', 'session_expired'],
  ['user_not_found', 'session_expired'],
  ['reauthentication_needed', 'session_expired'],
  ['reauthentication_not_valid', 'session_expired'],
  // PostgREST / Postgres, for data calls made on behalf of auth (delete_my_account): the JWT was
  // rejected (PGRST301 invalid, PGRST303 expired) or the function saw no user (42501).
  ['PGRST301', 'session_expired'],
  ['PGRST303', 'session_expired'],
  ['42501', 'session_expired'],

  ['otp_expired', 'link_invalid'],
  ['flow_state_not_found', 'link_invalid'],
  ['flow_state_expired', 'link_invalid'],
  ['bad_code_verifier', 'link_invalid'],
  ['bad_oauth_state', 'link_invalid'],
  ['bad_oauth_callback', 'link_invalid'],
]);

/** auth-js error classes that carry no server code. */
const ERROR_CLASSES: ReadonlyMap<string, AuthErrorCode> = new Map<string, AuthErrorCode>([
  ['AuthRetryableFetchError', 'network'],
  ['AuthSessionMissingError', 'session_expired'],
  ['AuthInvalidCredentialsError', 'invalid_credentials'],
  ['AuthWeakPasswordError', 'weak_password'],
  ['AuthPKCECodeVerifierMissingError', 'link_invalid'],
  ['AuthPKCEGrantCodeExchangeError', 'link_invalid'],
  ['AuthImplicitGrantRedirectError', 'link_invalid'],
]);

/** Last resort for servers or proxies that answer without a code. Matched case-insensitively. */
const MESSAGES: readonly (readonly [RegExp, AuthErrorCode])[] = [
  [/invalid login credentials/i, 'invalid_credentials'],
  [/email not confirmed/i, 'email_not_confirmed'],
  [/user already registered/i, 'user_already_exists'],
  [/signups? not allowed/i, 'signup_disabled'],
  [/unsupported provider|provider is not enabled/i, 'provider_disabled'],
  [/rate limit/i, 'rate_limited'],
  // fetch() rejections: React Native, Chrome, Firefox, Safari, Node/undici.
  [/network request failed|failed to fetch|networkerror|load failed|fetch failed/i, 'network'],
];

type ErrorFields = {
  name?: unknown;
  message?: unknown;
  status?: unknown;
  code?: unknown;
  error_code?: unknown;
  error?: unknown;
  error_description?: unknown;
  details?: unknown;
};

function fromServerCode(value: unknown): AuthErrorCode | null {
  return typeof value === 'string' ? (SERVER_CODES.get(value) ?? null) : null;
}

function fromMessage(value: unknown): AuthErrorCode | null {
  if (typeof value !== 'string') return null;
  for (const [pattern, code] of MESSAGES) {
    if (pattern.test(value)) return code;
  }
  return null;
}

/**
 * Maps anything an auth call can produce to an AuthErrorCode:
 * - supabase-js AuthError instances (by server code, then error class, then HTTP status),
 * - OAuth redirect parameters as an object (`{ error, error_code, error_description }`),
 * - fetch/network failures (TypeError "Network request failed" and friends),
 * - anything else → 'unknown'.
 * Never throws and never echoes the input.
 */
export function toAuthErrorCode(error: unknown): AuthErrorCode {
  if (typeof error === 'string') return fromServerCode(error) ?? fromMessage(error) ?? 'unknown';
  if (typeof error !== 'object' || error === null) return 'unknown';

  const fields = error as ErrorFields;

  const byCode = fromServerCode(fields.error_code) ?? fromServerCode(fields.code);
  if (byCode) return byCode;

  // AuthImplicitGrantRedirectError / AuthPKCEGrantCodeExchangeError carry the redirect's params,
  // which are more specific than the error class.
  if (typeof fields.details === 'object' && fields.details !== null) {
    const details = fields.details as ErrorFields;
    const byDetails = fromServerCode(details.code) ?? fromServerCode(details.error);
    if (byDetails) return byDetails;
  }

  if (isAuthError(error) && typeof fields.name === 'string') {
    const byClass = ERROR_CLASSES.get(fields.name);
    if (byClass) return byClass;
  }

  if (fields.status === 429) return 'rate_limited';
  if (isAuthError(error) && fields.status === 0) return 'network';

  return (
    fromServerCode(fields.error) ??
    fromMessage(fields.message) ??
    fromMessage(fields.error_description) ??
    'unknown'
  );
}

/**
 * True when an OAuth redirect error means the person backed out rather than something failing:
 * `access_denied` (declined at the provider) without a more specific Supabase error code, or
 * Apple's `user_cancelled_authorize`.
 */
export function isOAuthCancellation(params: { error?: string; error_code?: string }): boolean {
  if (params.error === 'user_cancelled_authorize') return true;
  return params.error === 'access_denied' && fromServerCode(params.error_code) === null;
}
