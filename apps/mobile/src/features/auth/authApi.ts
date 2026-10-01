import { DEFAULT_LANGUAGE, LANGUAGES, type Language } from '@budget/core';
import { isAuthError } from '@supabase/supabase-js';
import type { QueryClient } from '@tanstack/react-query';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { readEnv } from '@/lib/env';
import { authRedirectUrl, getSupabase } from '@/lib/supabase';

import { isOAuthCancellation, toAuthErrorCode, type AuthErrorCode } from './errors';
import {
  normalizeEmail,
  validateEmail,
  validatePassword,
  type EmailErrorCode,
  type PasswordErrorCode,
} from './validation';

/*
 * The auth operations screens call. None of them throws for an expected failure: each resolves
 * to a result whose `ok` says whether it worked, and failures say what to show:
 *
 *   { ok: false, kind: 'field', fields }   input problems, nothing was sent. Show each under its
 *                                          field: t(`auth.validation.${code}`).
 *   { ok: false, kind: 'auth', code }      the request failed. Show t(`auth.errors.${code}`);
 *                                          fieldForAuthError(code) says if it belongs to a field.
 *   { ok: false, kind: 'cancelled' }       the person closed the provider sheet or browser.
 *                                          Show nothing.
 *
 * A successful sign-in does not return the session: AuthProvider receives it from supabase-js
 * and the navigation follows from useAuth().status.
 */

export type AuthField = 'email' | 'password';
export type FieldErrors = { email?: EmailErrorCode; password?: PasswordErrorCode };

export type FieldFailure = { ok: false; kind: 'field'; fields: FieldErrors };
export type AuthFailure = { ok: false; kind: 'auth'; code: AuthErrorCode };
export type Cancelled = { ok: false; kind: 'cancelled' };

export type SignUpResult =
  { ok: true; status: 'signed_in' | 'confirm_email' } | FieldFailure | AuthFailure;
export type SignInResult = { ok: true } | FieldFailure | AuthFailure;
export type PasswordResetResult = { ok: true } | FieldFailure | AuthFailure;
export type ResendConfirmationResult = { ok: true } | FieldFailure | AuthFailure;
export type UpdatePasswordResult = { ok: true } | FieldFailure | AuthFailure;
export type SignOutResult = { ok: true } | AuthFailure;
export type DeleteAccountResult = { ok: true } | AuthFailure;
export type ProviderSignInResult = { ok: true } | Cancelled | AuthFailure;
export type CompleteAuthResult = { ok: true; next?: AuthNextRoute } | AuthFailure;

export type OAuthProvider = 'google' | 'apple';

/**
 * Screens an auth callback may continue to. `next` arrives in a deep link anyone can craft, so
 * only these values are passed on.
 */
export const AUTH_NEXT_ROUTES = ['reset-password'] as const;
export type AuthNextRoute = (typeof AUTH_NEXT_ROUTES)[number];

/** The field an auth error is about, for screens that show it there instead of above the form. */
export function fieldForAuthError(code: AuthErrorCode): AuthField | null {
  if (code === 'weak_password') return 'password';
  if (code === 'user_already_exists') return 'email';
  return null;
}

const OK = { ok: true } as const;
const CANCELLED: Cancelled = { ok: false, kind: 'cancelled' };

function authFailure(code: AuthErrorCode): AuthFailure {
  return { ok: false, kind: 'auth', code };
}

/** A failure from the server; an address the server rejects becomes an email field error. */
function failureFrom(error: unknown): FieldFailure | AuthFailure {
  if (isAuthError(error) && error.code === 'email_address_invalid') {
    return { ok: false, kind: 'field', fields: { email: 'email_invalid' } };
  }
  return authFailure(toAuthErrorCode(error));
}

function fieldFailure(fields: FieldErrors): FieldFailure | null {
  const present: FieldErrors = {};
  if (fields.email) present.email = fields.email;
  if (fields.password) present.password = fields.password;
  return present.email || present.password ? { ok: false, kind: 'field', fields: present } : null;
}

function authFailureFrom(error: unknown): AuthFailure {
  return authFailure(toAuthErrorCode(error));
}

/**
 * Runs an operation and turns anything it throws (offline, client not configured, a native module
 * rejecting) into the failure `onThrow` builds, so no auth operation rejects.
 */
async function settle<T>(operation: () => Promise<T>, onThrow: (error: unknown) => T): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    return onThrow(error);
  }
}

// ---------------------------------------------------------------------------------------------
// Email and password
// ---------------------------------------------------------------------------------------------

/**
 * Creates an account. The language goes into the user metadata, where the database trigger
 * reads it to create the profile. Resolves to status 'confirm_email' when the project requires
 * email confirmation (no session yet), 'signed_in' otherwise.
 *
 * With confirmation on, an address that is already registered also yields 'confirm_email': the
 * server deliberately does not reveal which addresses have accounts.
 */
export async function signUpWithEmail(input: {
  email: string;
  password: string;
  language: Language;
}): Promise<SignUpResult> {
  const invalid = fieldFailure({
    email: validateEmail(input.email) ?? undefined,
    password: validatePassword(input.password) ?? undefined,
  });
  if (invalid) return invalid;

  const language = LANGUAGES.includes(input.language) ? input.language : DEFAULT_LANGUAGE;
  return settle<SignUpResult>(async () => {
    const { data, error } = await getSupabase().auth.signUp({
      email: normalizeEmail(input.email),
      password: input.password,
      options: { data: { language }, emailRedirectTo: authRedirectUrl() },
    });
    if (error) return failureFrom(error);
    return { ok: true, status: data.session ? 'signed_in' : 'confirm_email' };
  }, failureFrom);
}

/**
 * Signs in with email and password. The password is only checked for presence: accounts created
 * under an older policy must still be able to sign in.
 */
export async function signInWithEmail(input: {
  email: string;
  password: string;
}): Promise<SignInResult> {
  const invalid = fieldFailure({
    email: validateEmail(input.email) ?? undefined,
    password: input.password.length === 0 ? 'password_required' : undefined,
  });
  if (invalid) return invalid;

  return settle<SignInResult>(async () => {
    const { error } = await getSupabase().auth.signInWithPassword({
      email: normalizeEmail(input.email),
      password: input.password,
    });
    return error ? failureFrom(error) : OK;
  }, failureFrom);
}

/**
 * Emails a password reset link. The link comes back to auth/callback with `next=reset-password`;
 * completeAuthFromUrl exchanges it and the screen routes to the new-password form. Succeeds
 * whether or not the address has an account (the server does not reveal it).
 */
export async function sendPasswordReset(email: string): Promise<PasswordResetResult> {
  const invalid = fieldFailure({ email: validateEmail(email) ?? undefined });
  if (invalid) return invalid;

  return settle<PasswordResetResult>(async () => {
    const { error } = await getSupabase().auth.resetPasswordForEmail(normalizeEmail(email), {
      redirectTo: authRedirectUrl('reset-password'),
    });
    return error ? failureFrom(error) : OK;
  }, failureFrom);
}

/** Sends the sign-up confirmation email again (after 'confirm_email' or 'email_not_confirmed'). */
export async function resendSignUpConfirmation(email: string): Promise<ResendConfirmationResult> {
  const invalid = fieldFailure({ email: validateEmail(email) ?? undefined });
  if (invalid) return invalid;

  return settle<ResendConfirmationResult>(async () => {
    const { error } = await getSupabase().auth.resend({
      type: 'signup',
      email: normalizeEmail(email),
      options: { emailRedirectTo: authRedirectUrl() },
    });
    return error ? failureFrom(error) : OK;
  }, failureFrom);
}

/** Sets a new password for the signed-in user (the reset flow signs the user in first). */
export async function updatePassword(password: string): Promise<UpdatePasswordResult> {
  const invalid = fieldFailure({ password: validatePassword(password) ?? undefined });
  if (invalid) return invalid;

  return settle<UpdatePasswordResult>(async () => {
    const { error } = await getSupabase().auth.updateUser({ password });
    return error ? failureFrom(error) : OK;
  }, failureFrom);
}

// ---------------------------------------------------------------------------------------------
// Signing out and deleting the account
// ---------------------------------------------------------------------------------------------

/**
 * Signs out on this device: the session is revoked on the server and removed from the keychain.
 * Other devices stay signed in. If the server cannot be reached, the local session is still
 * removed and the result is ok; it fails only when the session could not be removed locally.
 * AuthProvider clears the query cache when the SIGNED_OUT event arrives.
 */
export async function signOut(): Promise<SignOutResult> {
  return settle<SignOutResult>(async () => {
    const supabase = getSupabase();
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (!error) return OK;
    const { data } = await supabase.auth.getSession();
    return data.session ? authFailure(toAuthErrorCode(error)) : OK;
  }, authFailureFrom);
}

/**
 * Deletes the account and all its data (spec section 15) through the delete_my_account RPC, then
 * forgets the session locally (the server already deleted it) and empties the query cache.
 * When the RPC fails, nothing else happens: the user stays signed in and can retry.
 */
export async function deleteAccount(queryClient: QueryClient): Promise<DeleteAccountResult> {
  return settle<DeleteAccountResult>(async () => {
    const supabase = getSupabase();
    const { error, status } = await supabase.rpc('delete_my_account');
    if (error) return authFailure(status === 0 ? 'network' : toAuthErrorCode(error));

    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // The account no longer exists; a session left behind fails its next refresh and signs out.
    }
    queryClient.clear();
    return OK;
  }, authFailureFrom);
}

// ---------------------------------------------------------------------------------------------
// Code exchange (OAuth redirects and email links)
// ---------------------------------------------------------------------------------------------

type RedirectParams = {
  code?: string;
  error?: string;
  error_code?: string;
  error_description?: string;
  next?: string;
  sb_flow_id?: string;
};

const REDIRECT_PARAM_NAMES = [
  'code',
  'error',
  'error_code',
  'error_description',
  'next',
  'sb_flow_id',
] as const;

/**
 * Reads the auth parameters from a redirect URL's query and fragment (Supabase reports some
 * errors in the fragment). Tolerates anything: garbage yields an empty object.
 */
export function parseAuthRedirect(url: unknown): RedirectParams {
  const params: RedirectParams = {};
  if (typeof url !== 'string' || url.length === 0 || url.length > 8192) return params;

  const hashIndex = url.indexOf('#');
  const beforeHash = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? '' : url.slice(hashIndex + 1);
  const queryIndex = beforeHash.indexOf('?');
  const query = queryIndex === -1 ? '' : beforeHash.slice(queryIndex + 1);

  for (const part of [query, fragment]) {
    if (!part) continue;
    let search: URLSearchParams;
    try {
      search = new URLSearchParams(part);
    } catch {
      continue;
    }
    for (const name of REDIRECT_PARAM_NAMES) {
      const value = search.get(name);
      if (value) params[name] = value;
    }
  }
  return params;
}

type ExchangeOutcome = { ok: true; recovery: boolean } | AuthFailure;

/**
 * Exchanges in progress or done, by code. An auth code is single-use, and on Android the same
 * redirect can reach both expo-web-browser and the auth/callback route; both get one exchange.
 */
const exchanges = new Map<string, Promise<ExchangeOutcome>>();
const MAX_REMEMBERED_EXCHANGES = 10;

function exchangeCode(code: string, flowId: string | undefined): Promise<ExchangeOutcome> {
  const existing = exchanges.get(code);
  if (existing) return existing;

  const exchange = (async (): Promise<ExchangeOutcome> => {
    try {
      const { data, error } = await getSupabase().auth.exchangeCodeForSession(
        code,
        flowId ? { flowId } : undefined,
      );
      if (error || !data.session) return authFailure(error ? toAuthErrorCode(error) : 'unknown');
      // supabase-js also returns how the flow started; 'recovery' means a password reset link.
      const redirectType: unknown = (data as { redirectType?: unknown }).redirectType;
      return { ok: true, recovery: redirectType === 'recovery' };
    } catch (error) {
      return authFailure(toAuthErrorCode(error));
    }
  })();

  exchanges.set(code, exchange);
  while (exchanges.size > MAX_REMEMBERED_EXCHANGES) {
    const oldest = exchanges.keys().next();
    if (oldest.done) break;
    exchanges.delete(oldest.value);
  }
  return exchange;
}

/**
 * Finishes an email link or OAuth redirect that opened the app at auth/callback: exchanges the
 * `code` for a session, or maps the `error` / `error_code` the server sent. On success, `next`
 * is the screen to continue to (only values in AUTH_NEXT_ROUTES; a password reset link always
 * continues to 'reset-password').
 *
 * PKCE ties the code to a verifier stored on this device, so a link opened on another device, or
 * after reinstalling, fails with 'link_invalid' (a confirmation link has still confirmed the
 * address; the person can sign in).
 */
export async function completeAuthFromUrl(url: string): Promise<CompleteAuthResult> {
  const params = parseAuthRedirect(url);
  if (params.error || params.error_code) {
    const code = toAuthErrorCode(params);
    // Email links report an expired or used link as `error=access_denied` without a known code.
    return authFailure(code === 'unknown' ? 'link_invalid' : code);
  }
  if (!params.code) return authFailure('link_invalid');

  const outcome = await exchangeCode(params.code, params.sb_flow_id);
  if (!outcome.ok) return outcome;
  if (outcome.recovery) return { ok: true, next: 'reset-password' };

  const next = AUTH_NEXT_ROUTES.find((route) => route === params.next);
  return next ? { ok: true, next } : OK;
}

// ---------------------------------------------------------------------------------------------
// Google and Apple
// ---------------------------------------------------------------------------------------------

/**
 * Signs in with Google (all platforms) or Apple (Android and web) in an in-app browser session:
 * Supabase builds the provider URL, the browser comes back to auth/callback with a code, and the
 * code is exchanged here. Closing the browser resolves to { kind: 'cancelled' }.
 *
 * On web the popup lands on the auth/callback route, which must call
 * WebBrowser.maybeCompleteAuthSession() so this promise receives the URL.
 */
export async function signInWithOAuthProvider(
  provider: OAuthProvider,
): Promise<ProviderSignInResult> {
  return settle<ProviderSignInResult>(async () => {
    const supabase = getSupabase();
    const redirectTo = authRedirectUrl();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) return authFailure(toAuthErrorCode(error));

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') return CANCELLED;

    const params = parseAuthRedirect(result.url);
    if (params.error || params.error_code) {
      return isOAuthCancellation(params) ? CANCELLED : authFailure(toAuthErrorCode(params));
    }
    if (!params.code) return authFailure('unknown');

    const outcome = await exchangeCode(params.code, data.flowId ?? params.sb_flow_id);
    return outcome.ok ? OK : outcome;
  }, authFailureFrom);
}

/** Whether the native Sign in with Apple sheet can be used: iOS 13+ only. */
export async function isAppleNativeAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/** 32 random bytes as hex: the raw nonce that only the app and Supabase see. */
function createRawNonce(): string {
  return Array.from(Crypto.getRandomBytes(32), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

function isAppleCancellation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  return error.code === 'ERR_REQUEST_CANCELED' || error.code === 'ERR_CANCELED';
}

/**
 * Native Sign in with Apple (iOS). Apple receives the SHA-256 of a random nonce and puts it in
 * the identity token; Supabase receives the raw nonce and checks that it hashes to the token's
 * value, so a token intercepted elsewhere cannot be replayed.
 *
 * Apple shares the person's name only on the very first authorization; it is saved to the user
 * metadata as full_name (where Google sign-ins also put it) so onboarding can prefill it.
 */
export async function signInWithAppleNative(): Promise<ProviderSignInResult> {
  return settle<ProviderSignInResult>(async () => {
    const rawNonce = createRawNonce();
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce,
      { encoding: Crypto.CryptoEncoding.HEX },
    );

    let credential: AppleAuthentication.AppleAuthenticationCredential;
    try {
      credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
    } catch (error) {
      return isAppleCancellation(error) ? CANCELLED : authFailure(toAuthErrorCode(error));
    }
    if (!credential.identityToken) return authFailure('unknown');

    const supabase = getSupabase();
    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: rawNonce,
    });
    if (error) return authFailure(toAuthErrorCode(error));

    const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
      .join(' ')
      .trim();
    if (fullName) {
      try {
        await supabase.auth.updateUser({
          data: {
            full_name: fullName,
            given_name: credential.fullName?.givenName ?? null,
            family_name: credential.fullName?.familyName ?? null,
          },
        });
      } catch {
        // Best effort: the sign-in itself succeeded, and onboarding can still ask for a name.
      }
    }
    return OK;
  }, authFailureFrom);
}

/** Sign in with Apple the right way for this platform: native sheet on iOS, browser elsewhere. */
export async function signInWithApple(): Promise<ProviderSignInResult> {
  return (await isAppleNativeAvailable())
    ? signInWithAppleNative()
    : signInWithOAuthProvider('apple');
}

// ---------------------------------------------------------------------------------------------
// Which sign-in methods the project offers
// ---------------------------------------------------------------------------------------------

export type AuthSettings = {
  email: boolean;
  google: boolean;
  apple: boolean;
  signupEnabled: boolean;
  emailConfirmationRequired: boolean;
};

/** What to assume when the settings cannot be read: email and password only. */
export const FALLBACK_AUTH_SETTINGS: Readonly<AuthSettings> = Object.freeze({
  email: true,
  google: false,
  apple: false,
  signupEnabled: true,
  emailConfirmationRequired: true,
});

export const AUTH_SETTINGS_TIMEOUT_MS = 8000;

function parseAuthSettings(json: unknown): AuthSettings | null {
  if (typeof json !== 'object' || json === null) return null;
  const body = json as {
    external?: unknown;
    disable_signup?: unknown;
    mailer_autoconfirm?: unknown;
  };
  if (typeof body.external !== 'object' || body.external === null) return null;
  const external = body.external as Record<string, unknown>;
  return {
    email: external.email === true,
    google: external.google === true,
    apple: external.apple === true,
    signupEnabled: body.disable_signup !== true,
    emailConfirmationRequired: body.mailer_autoconfirm !== true,
  };
}

/**
 * Reads which sign-in methods the Supabase project has enabled (GET /auth/v1/settings), so the
 * sign-in screen shows only working buttons. Never throws: on any failure (offline, timeout,
 * unexpected answer, not configured) it resolves to FALLBACK_AUTH_SETTINGS.
 */
export async function fetchAuthSettings(): Promise<AuthSettings> {
  const env = readEnv();
  if (!env.ok) return { ...FALLBACK_AUTH_SETTINGS };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUTH_SETTINGS_TIMEOUT_MS);
  try {
    const response = await fetch(`${env.supabaseUrl}/auth/v1/settings`, {
      method: 'GET',
      headers: { apikey: env.supabaseKey, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) return { ...FALLBACK_AUTH_SETTINGS };
    return parseAuthSettings(await response.json()) ?? { ...FALLBACK_AUTH_SETTINGS };
  } catch {
    return { ...FALLBACK_AUTH_SETTINGS };
  } finally {
    clearTimeout(timeout);
  }
}
