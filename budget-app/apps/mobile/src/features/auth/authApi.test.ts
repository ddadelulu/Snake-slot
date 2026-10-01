import { createHash as mockCreateHash } from 'node:crypto';

import {
  AuthApiError,
  AuthPKCECodeVerifierMissingError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  AuthWeakPasswordError,
} from '@supabase/supabase-js';
import { QueryClient } from '@tanstack/react-query';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import {
  AUTH_SETTINGS_TIMEOUT_MS,
  completeAuthFromUrl,
  deleteAccount,
  FALLBACK_AUTH_SETTINGS,
  fetchAuthSettings,
  fieldForAuthError,
  isAppleNativeAvailable,
  parseAuthRedirect,
  resendSignUpConfirmation,
  sendPasswordReset,
  signInWithApple,
  signInWithAppleNative,
  signInWithEmail,
  signInWithOAuthProvider,
  signOut,
  signUpWithEmail,
  updatePassword,
} from './authApi';

// --- Module boundary mocks --------------------------------------------------------------------

const mockAuth = {
  signUp: jest.fn(),
  signInWithPassword: jest.fn(),
  resetPasswordForEmail: jest.fn(),
  resend: jest.fn(),
  updateUser: jest.fn(),
  signOut: jest.fn(),
  getSession: jest.fn(),
  exchangeCodeForSession: jest.fn(),
  signInWithOAuth: jest.fn(),
  signInWithIdToken: jest.fn(),
};
const mockRpc = jest.fn();
const mockGetSupabase = jest.fn(() => ({ auth: mockAuth, rpc: mockRpc }));

jest.mock('@/lib/supabase', () => ({
  getSupabase: () => mockGetSupabase(),
  authRedirectUrl: (next?: string) =>
    next ? `batzen://auth/callback?next=${encodeURIComponent(next)}` : 'batzen://auth/callback',
}));

const mockReadEnv = jest.fn();
jest.mock('@/lib/env', () => ({ readEnv: () => mockReadEnv() }));

jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));

jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn(),
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

const MOCK_RANDOM_BYTES = Uint8Array.from({ length: 32 }, (_, index) => (index * 37 + 11) % 256);
const RAW_NONCE = Buffer.from(MOCK_RANDOM_BYTES).toString('hex');
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { HEX: 'hex' },
  getRandomBytes: jest.fn((count: number) => MOCK_RANDOM_BYTES.slice(0, count)),
  digestStringAsync: jest.fn(
    async (algorithm: string, data: string, options: { encoding: string }) => {
      if (algorithm !== 'SHA-256' || options.encoding !== 'hex')
        throw new Error('unexpected digest');
      return mockCreateHash('sha256').update(data).digest('hex');
    },
  ),
}));

const openAuthSession = WebBrowser.openAuthSessionAsync as jest.MockedFunction<
  typeof WebBrowser.openAuthSessionAsync
>;
const appleSignIn = AppleAuthentication.signInAsync as jest.MockedFunction<
  typeof AppleAuthentication.signInAsync
>;
const appleAvailable = AppleAuthentication.isAvailableAsync as jest.MockedFunction<
  typeof AppleAuthentication.isAvailableAsync
>;

// --- Helpers ----------------------------------------------------------------------------------

const SESSION = { access_token: 'access', refresh_token: 'refresh', user: { id: 'user-1' } };
const CONFIGURED_ENV = {
  ok: true,
  supabaseUrl: 'https://abc.supabase.co',
  supabaseKey: 'sb_publishable_test',
  appEnv: 'production',
};

let codeCounter = 0;
/** Auth codes are single-use and authApi remembers exchanges, so each test uses fresh codes. */
function freshCode(): string {
  codeCounter += 1;
  return `code-${codeCounter}`;
}

function setPlatform(os: string) {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true, writable: true });
}

const originalOS = Platform.OS;

beforeEach(() => {
  jest.clearAllMocks();
  setPlatform(originalOS);
  mockGetSupabase.mockImplementation(() => ({ auth: mockAuth, rpc: mockRpc }));
  mockReadEnv.mockReturnValue(CONFIGURED_ENV);
  mockAuth.exchangeCodeForSession.mockResolvedValue({
    data: { session: SESSION, user: SESSION.user, redirectType: null },
    error: null,
  });
});

afterAll(() => {
  setPlatform(originalOS);
});

// --- Email and password -----------------------------------------------------------------------

describe('signUpWithEmail', () => {
  const valid = { email: '  Anna@Example.CH ', password: 'correct horse', language: 'en' as const };

  it('returns every field error and sends nothing', async () => {
    const result = await signUpWithEmail({ email: 'nope', password: 'short', language: 'de' });
    expect(result).toEqual({
      ok: false,
      kind: 'field',
      fields: { email: 'email_invalid', password: 'password_too_short' },
    });
    expect(mockAuth.signUp).not.toHaveBeenCalled();
  });

  it('reports a single field error alone', async () => {
    expect(await signUpWithEmail({ ...valid, password: '' })).toEqual({
      ok: false,
      kind: 'field',
      fields: { password: 'password_required' },
    });
  });

  it('asks for email confirmation when no session comes back', async () => {
    mockAuth.signUp.mockResolvedValue({ data: { user: { id: 'u' }, session: null }, error: null });

    expect(await signUpWithEmail(valid)).toEqual({ ok: true, status: 'confirm_email' });
    expect(mockAuth.signUp).toHaveBeenCalledWith({
      email: 'anna@example.ch',
      password: 'correct horse',
      options: { data: { language: 'en' }, emailRedirectTo: 'batzen://auth/callback' },
    });
  });

  it('is signed in right away when the project auto-confirms', async () => {
    mockAuth.signUp.mockResolvedValue({
      data: { user: SESSION.user, session: SESSION },
      error: null,
    });
    expect(await signUpWithEmail(valid)).toEqual({ ok: true, status: 'signed_in' });
  });

  it('falls back to the default language for an unexpected value', async () => {
    mockAuth.signUp.mockResolvedValue({ data: { user: null, session: null }, error: null });
    await signUpWithEmail({ ...valid, language: 'fr' as never });
    expect(mockAuth.signUp.mock.calls[0][0].options.data).toEqual({ language: 'de' });
  });

  it('maps an existing account', async () => {
    mockAuth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthApiError('User already registered', 422, 'user_already_exists'),
    });
    const result = await signUpWithEmail(valid);
    expect(result).toEqual({ ok: false, kind: 'auth', code: 'user_already_exists' });
  });

  it('maps a password the server finds weak', async () => {
    mockAuth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthWeakPasswordError('Password is known to be weak', 422, ['pwned']),
    });
    expect(await signUpWithEmail(valid)).toEqual({
      ok: false,
      kind: 'auth',
      code: 'weak_password',
    });
  });

  it('turns an address the server rejects into an email field error', async () => {
    mockAuth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthApiError('Email address "x" is invalid', 400, 'email_address_invalid'),
    });
    expect(await signUpWithEmail(valid)).toEqual({
      ok: false,
      kind: 'field',
      fields: { email: 'email_invalid' },
    });
  });

  it('maps disabled sign-ups', async () => {
    mockAuth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthApiError('Signups not allowed for this instance', 422, 'signup_disabled'),
    });
    expect(await signUpWithEmail(valid)).toEqual({
      ok: false,
      kind: 'auth',
      code: 'signup_disabled',
    });
  });

  it('never rejects, even when the client is not configured', async () => {
    mockGetSupabase.mockImplementation(() => {
      throw new Error('Supabase is not configured');
    });
    await expect(signUpWithEmail(valid)).resolves.toEqual({
      ok: false,
      kind: 'auth',
      code: 'unknown',
    });
  });
});

describe('signInWithEmail', () => {
  it('signs in with the normalized address and the password as typed', async () => {
    mockAuth.signInWithPassword.mockResolvedValue({ data: { session: SESSION }, error: null });
    expect(
      await signInWithEmail({ email: ' Anna@Example.ch', password: ' pw with spaces ' }),
    ).toEqual({
      ok: true,
    });
    expect(mockAuth.signInWithPassword).toHaveBeenCalledWith({
      email: 'anna@example.ch',
      password: ' pw with spaces ',
    });
  });

  it('only requires a password, so older short passwords still work', async () => {
    mockAuth.signInWithPassword.mockResolvedValue({ data: { session: SESSION }, error: null });
    expect(await signInWithEmail({ email: 'a@b.ch', password: 'short' })).toEqual({ ok: true });
    expect(await signInWithEmail({ email: '', password: '' })).toEqual({
      ok: false,
      kind: 'field',
      fields: { email: 'email_required', password: 'password_required' },
    });
  });

  it.each([
    [
      new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'),
      'invalid_credentials',
    ],
    [new AuthApiError('Email not confirmed', 400, 'email_not_confirmed'), 'email_not_confirmed'],
    [new AuthRetryableFetchError('Network request failed', 0), 'network'],
    [
      new AuthApiError('Request rate limit reached', 429, 'over_request_rate_limit'),
      'rate_limited',
    ],
  ])('maps %p', async (error, code) => {
    mockAuth.signInWithPassword.mockResolvedValue({ data: { session: null, user: null }, error });
    expect(await signInWithEmail({ email: 'a@b.ch', password: 'whatever!!' })).toEqual({
      ok: false,
      kind: 'auth',
      code,
    });
  });

  it('maps a rejected fetch to network', async () => {
    mockAuth.signInWithPassword.mockRejectedValue(new TypeError('Network request failed'));
    expect(await signInWithEmail({ email: 'a@b.ch', password: 'whatever!!' })).toEqual({
      ok: false,
      kind: 'auth',
      code: 'network',
    });
  });
});

describe('sendPasswordReset', () => {
  it('sends a link that comes back with next=reset-password', async () => {
    mockAuth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    expect(await sendPasswordReset(' Anna@Example.CH ')).toEqual({ ok: true });
    expect(mockAuth.resetPasswordForEmail).toHaveBeenCalledWith('anna@example.ch', {
      redirectTo: 'batzen://auth/callback?next=reset-password',
    });
    const [, { redirectTo }] = mockAuth.resetPasswordForEmail.mock.calls[0];
    expect(parseAuthRedirect(redirectTo).next).toBe('reset-password');
  });

  it('validates the address first', async () => {
    expect(await sendPasswordReset('')).toEqual({
      ok: false,
      kind: 'field',
      fields: { email: 'email_required' },
    });
    expect(mockAuth.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('maps the email rate limit', async () => {
    mockAuth.resetPasswordForEmail.mockResolvedValue({
      data: null,
      error: new AuthApiError('Email rate limit exceeded', 429, 'over_email_send_rate_limit'),
    });
    expect(await sendPasswordReset('a@b.ch')).toEqual({
      ok: false,
      kind: 'auth',
      code: 'rate_limited',
    });
  });
});

describe('resendSignUpConfirmation', () => {
  it('resends the sign-up email with the callback redirect', async () => {
    mockAuth.resend.mockResolvedValue({ data: { user: null, session: null }, error: null });
    expect(await resendSignUpConfirmation('Anna@Example.ch')).toEqual({ ok: true });
    expect(mockAuth.resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'anna@example.ch',
      options: { emailRedirectTo: 'batzen://auth/callback' },
    });
  });

  it('validates the address first', async () => {
    expect((await resendSignUpConfirmation('x')).ok).toBe(false);
    expect(mockAuth.resend).not.toHaveBeenCalled();
  });
});

describe('updatePassword', () => {
  it('applies the password policy first', async () => {
    expect(await updatePassword('short')).toEqual({
      ok: false,
      kind: 'field',
      fields: { password: 'password_too_short' },
    });
    expect(await updatePassword('a'.repeat(73))).toEqual({
      ok: false,
      kind: 'field',
      fields: { password: 'password_too_long' },
    });
    expect(mockAuth.updateUser).not.toHaveBeenCalled();
  });

  it('updates the password', async () => {
    mockAuth.updateUser.mockResolvedValue({ data: { user: SESSION.user }, error: null });
    expect(await updatePassword('a new long password')).toEqual({ ok: true });
    expect(mockAuth.updateUser).toHaveBeenCalledWith({ password: 'a new long password' });
  });

  it.each([
    [new AuthApiError('New password should be different', 422, 'same_password'), 'weak_password'],
    [new AuthSessionMissingError(), 'session_expired'],
  ])('maps %p', async (error, code) => {
    mockAuth.updateUser.mockResolvedValue({ data: { user: null }, error });
    expect(await updatePassword('a new long password')).toEqual({ ok: false, kind: 'auth', code });
  });
});

describe('fieldForAuthError', () => {
  it('places field-specific server errors', () => {
    expect(fieldForAuthError('weak_password')).toBe('password');
    expect(fieldForAuthError('user_already_exists')).toBe('email');
    expect(fieldForAuthError('network')).toBeNull();
  });
});

// --- Signing out and deleting the account -----------------------------------------------------

describe('signOut', () => {
  it('signs out this device only', async () => {
    mockAuth.signOut.mockResolvedValue({ error: null });
    expect(await signOut()).toEqual({ ok: true });
    expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('succeeds offline once the local session is gone', async () => {
    mockAuth.signOut.mockResolvedValue({ error: new AuthRetryableFetchError('offline', 0) });
    mockAuth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    expect(await signOut()).toEqual({ ok: true });
  });

  it('fails when the session is still stored', async () => {
    mockAuth.signOut.mockResolvedValue({ error: new AuthRetryableFetchError('offline', 0) });
    mockAuth.getSession.mockResolvedValue({ data: { session: SESSION }, error: null });
    expect(await signOut()).toEqual({ ok: false, kind: 'auth', code: 'network' });
  });
});

describe('deleteAccount', () => {
  function trackedQueryClient(calls: string[]) {
    const queryClient = new QueryClient();
    jest.spyOn(queryClient, 'clear').mockImplementation(() => {
      calls.push('clear');
    });
    return queryClient;
  }

  it('deletes on the server first, then forgets the session and the cache', async () => {
    const calls: string[] = [];
    mockRpc.mockImplementation(async (name: string) => {
      calls.push(`rpc:${name}`);
      return { data: null, error: null, status: 204 };
    });
    mockAuth.signOut.mockImplementation(async (options: unknown) => {
      calls.push(`signOut:${JSON.stringify(options)}`);
      return { error: null };
    });

    expect(await deleteAccount(trackedQueryClient(calls))).toEqual({ ok: true });
    expect(calls).toEqual(['rpc:delete_my_account', 'signOut:{"scope":"local"}', 'clear']);
  });

  it.each([
    [{ message: 'not signed in', code: '42501', details: '', hint: '' }, 401, 'session_expired'],
    [
      { message: 'TypeError: Network request failed', code: '', details: '', hint: '' },
      0,
      'network',
    ],
    [{ message: 'boom', code: 'XX000', details: '', hint: '' }, 500, 'unknown'],
  ])('keeps the user signed in when the RPC fails (%p)', async (error, status, code) => {
    const calls: string[] = [];
    mockRpc.mockResolvedValue({ data: null, error, status });

    expect(await deleteAccount(trackedQueryClient(calls))).toEqual({
      ok: false,
      kind: 'auth',
      code,
    });
    expect(mockAuth.signOut).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it('keeps the user signed in when the RPC request throws', async () => {
    const calls: string[] = [];
    mockRpc.mockRejectedValue(new TypeError('Network request failed'));
    expect(await deleteAccount(trackedQueryClient(calls))).toEqual({
      ok: false,
      kind: 'auth',
      code: 'network',
    });
    expect(mockAuth.signOut).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it('reports success once the account is gone, even if the local sign-out throws', async () => {
    const calls: string[] = [];
    mockRpc.mockResolvedValue({ data: null, error: null, status: 204 });
    mockAuth.signOut.mockRejectedValue(new Error('keychain busy'));
    expect(await deleteAccount(trackedQueryClient(calls))).toEqual({ ok: true });
    expect(calls).toEqual(['clear']);
  });
});

// --- Code exchange ----------------------------------------------------------------------------

describe('parseAuthRedirect', () => {
  it('reads query and fragment parameters', () => {
    expect(
      parseAuthRedirect(
        'batzen://auth/callback?code=abc&next=reset-password#error=x&error_code=otp_expired',
      ),
    ).toEqual({ code: 'abc', next: 'reset-password', error: 'x', error_code: 'otp_expired' });
    expect(
      parseAuthRedirect('exp://192.168.1.2:8081/--/auth/callback?sb_flow_id=f1&code=c'),
    ).toEqual({
      code: 'c',
      sb_flow_id: 'f1',
    });
  });

  it('decodes values', () => {
    expect(
      parseAuthRedirect('batzen://auth/callback?error_description=Email+link+is+invalid%21')
        .error_description,
    ).toBe('Email link is invalid!');
  });

  it.each([
    undefined,
    null,
    42,
    '',
    'garbage',
    '?',
    '#',
    '%%%',
    'batzen://auth/callback',
    `?code=${'x'.repeat(9000)}`,
  ])('yields nothing for %p', (url) => {
    expect(parseAuthRedirect(url)).toEqual({});
  });
});

describe('completeAuthFromUrl', () => {
  it('exchanges the code from a confirmation link', async () => {
    const code = freshCode();
    expect(await completeAuthFromUrl(`batzen://auth/callback?code=${code}`)).toEqual({ ok: true });
    expect(mockAuth.exchangeCodeForSession).toHaveBeenCalledWith(code, undefined);
  });

  it('continues to the reset screen after a password reset link', async () => {
    const code = freshCode();
    expect(
      await completeAuthFromUrl(`batzen://auth/callback?next=reset-password&code=${code}`),
    ).toEqual({
      ok: true,
      next: 'reset-password',
    });
  });

  it('knows a recovery exchange even without the next parameter', async () => {
    mockAuth.exchangeCodeForSession.mockResolvedValue({
      data: { session: SESSION, user: SESSION.user, redirectType: 'recovery' },
      error: null,
    });
    expect(await completeAuthFromUrl(`batzen://auth/callback?code=${freshCode()}`)).toEqual({
      ok: true,
      next: 'reset-password',
    });
  });

  it('drops a next value that is not an auth screen', async () => {
    const url = `batzen://auth/callback?code=${freshCode()}&next=${encodeURIComponent('https://evil.example')}`;
    expect(await completeAuthFromUrl(url)).toEqual({ ok: true });
  });

  it('passes the PKCE flow id when the redirect carries one', async () => {
    const code = freshCode();
    await completeAuthFromUrl(`batzen://auth/callback?code=${code}&sb_flow_id=abcdef0123456789`);
    expect(mockAuth.exchangeCodeForSession).toHaveBeenCalledWith(code, {
      flowId: 'abcdef0123456789',
    });
  });

  it.each([
    [
      'batzen://auth/callback?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
      'link_invalid',
    ],
    ['batzen://auth/callback#error=access_denied&error_code=otp_expired', 'link_invalid'],
    ['batzen://auth/callback?error=access_denied', 'link_invalid'],
    ['batzen://auth/callback?error=server_error&error_code=signup_disabled', 'signup_disabled'],
    ['batzen://auth/callback?error_code=over_email_send_rate_limit', 'rate_limited'],
  ])('maps the error in %s without exchanging', async (url, code) => {
    expect(await completeAuthFromUrl(url)).toEqual({ ok: false, kind: 'auth', code });
    expect(mockAuth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it.each([
    '',
    'garbage',
    'batzen://auth/callback',
    'batzen://auth/callback?next=reset-password',
    '%%%',
  ])('rejects %j as an invalid link', async (url) => {
    expect(await completeAuthFromUrl(url)).toEqual({
      ok: false,
      kind: 'auth',
      code: 'link_invalid',
    });
    expect(mockAuth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it.each([
    [new AuthPKCECodeVerifierMissingError(), 'link_invalid'],
    [new AuthApiError('invalid flow state', 404, 'flow_state_not_found'), 'link_invalid'],
    [new AuthRetryableFetchError('offline', 0), 'network'],
  ])('maps a failed exchange (%p)', async (error, code) => {
    mockAuth.exchangeCodeForSession.mockResolvedValue({
      data: { session: null, user: null, redirectType: null },
      error,
    });
    expect(await completeAuthFromUrl(`batzen://auth/callback?code=${freshCode()}`)).toEqual({
      ok: false,
      kind: 'auth',
      code,
    });
  });

  it('maps an exchange that throws', async () => {
    mockAuth.exchangeCodeForSession.mockRejectedValue(new TypeError('Network request failed'));
    expect(await completeAuthFromUrl(`batzen://auth/callback?code=${freshCode()}`)).toEqual({
      ok: false,
      kind: 'auth',
      code: 'network',
    });
  });

  it('exchanges a code only once when the same link arrives twice', async () => {
    const url = `batzen://auth/callback?code=${freshCode()}`;
    const [first, second] = await Promise.all([completeAuthFromUrl(url), completeAuthFromUrl(url)]);
    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: true });
    expect(await completeAuthFromUrl(url)).toEqual({ ok: true });
    expect(mockAuth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
  });
});

// --- Google and Apple -------------------------------------------------------------------------

describe('signInWithOAuthProvider', () => {
  const AUTHORIZE_URL = 'https://abc.supabase.co/auth/v1/authorize?provider=google';

  beforeEach(() => {
    mockAuth.signInWithOAuth.mockResolvedValue({
      data: { provider: 'google', url: AUTHORIZE_URL, flowId: 'flow-1' },
      error: null,
    });
  });

  it('runs the PKCE browser flow and exchanges the returned code', async () => {
    const code = freshCode();
    openAuthSession.mockResolvedValue({
      type: 'success',
      url: `batzen://auth/callback?code=${code}`,
    });

    expect(await signInWithOAuthProvider('google')).toEqual({ ok: true });
    expect(mockAuth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'batzen://auth/callback', skipBrowserRedirect: true },
    });
    expect(openAuthSession).toHaveBeenCalledWith(AUTHORIZE_URL, 'batzen://auth/callback');
    expect(mockAuth.exchangeCodeForSession).toHaveBeenCalledWith(code, { flowId: 'flow-1' });
  });

  it('works for Apple through the browser too', async () => {
    openAuthSession.mockResolvedValue({
      type: 'success',
      url: `batzen://auth/callback?code=${freshCode()}`,
    });
    expect(await signInWithOAuthProvider('apple')).toEqual({ ok: true });
    expect(mockAuth.signInWithOAuth.mock.calls[0][0].provider).toBe('apple');
  });

  it.each(['cancel', 'dismiss'] as const)(
    'treats a %s of the browser as cancelled',
    async (type) => {
      openAuthSession.mockResolvedValue({ type } as WebBrowser.WebBrowserAuthSessionResult);
      expect(await signInWithOAuthProvider('google')).toEqual({ ok: false, kind: 'cancelled' });
      expect(mockAuth.exchangeCodeForSession).not.toHaveBeenCalled();
    },
  );

  it('treats declining at the provider as cancelled', async () => {
    openAuthSession.mockResolvedValue({
      type: 'success',
      url: 'batzen://auth/callback?error=access_denied&error_description=The+user+denied+access',
    });
    expect(await signInWithOAuthProvider('google')).toEqual({ ok: false, kind: 'cancelled' });
  });

  it.each([
    ['batzen://auth/callback?error=server_error&error_code=signup_disabled', 'signup_disabled'],
    [
      'batzen://auth/callback?error=access_denied&error_code=provider_disabled',
      'provider_disabled',
    ],
    ['batzen://auth/callback#error=invalid_request&error_code=bad_oauth_state', 'link_invalid'],
    ['batzen://auth/callback?error=server_error', 'unknown'],
  ])('maps the provider error in %s', async (url, code) => {
    openAuthSession.mockResolvedValue({ type: 'success', url });
    expect(await signInWithOAuthProvider('google')).toEqual({ ok: false, kind: 'auth', code });
    expect(mockAuth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('fails when the redirect carries neither code nor error', async () => {
    openAuthSession.mockResolvedValue({ type: 'success', url: 'batzen://auth/callback' });
    expect(await signInWithOAuthProvider('google')).toEqual({
      ok: false,
      kind: 'auth',
      code: 'unknown',
    });
  });

  it('maps a failed code exchange', async () => {
    openAuthSession.mockResolvedValue({
      type: 'success',
      url: `batzen://auth/callback?code=${freshCode()}`,
    });
    mockAuth.exchangeCodeForSession.mockResolvedValue({
      data: { session: null, user: null },
      error: new AuthApiError('expired', 400, 'flow_state_expired'),
    });
    expect(await signInWithOAuthProvider('google')).toEqual({
      ok: false,
      kind: 'auth',
      code: 'link_invalid',
    });
  });

  it('maps a failure to start the flow', async () => {
    mockAuth.signInWithOAuth.mockResolvedValue({
      data: { provider: 'google', url: null },
      error: new AuthApiError(
        'Unsupported provider: provider is not enabled',
        400,
        'validation_failed',
      ),
    });
    expect(await signInWithOAuthProvider('google')).toEqual({
      ok: false,
      kind: 'auth',
      code: 'provider_disabled',
    });
    expect(openAuthSession).not.toHaveBeenCalled();
  });

  it('does not reject when the browser cannot open', async () => {
    openAuthSession.mockRejectedValue(
      Object.assign(new Error('Popup blocked'), { code: 'ERR_WEB_BROWSER_BLOCKED' }),
    );
    expect(await signInWithOAuthProvider('google')).toEqual({
      ok: false,
      kind: 'auth',
      code: 'unknown',
    });
  });
});

describe('isAppleNativeAvailable', () => {
  it('asks the native module on iOS', async () => {
    setPlatform('ios');
    appleAvailable.mockResolvedValue(true);
    expect(await isAppleNativeAvailable()).toBe(true);
    appleAvailable.mockResolvedValue(false);
    expect(await isAppleNativeAvailable()).toBe(false);
  });

  it.each(['android', 'web'])('is false on %s without asking', async (os) => {
    setPlatform(os);
    expect(await isAppleNativeAvailable()).toBe(false);
    expect(appleAvailable).not.toHaveBeenCalled();
  });

  it('is false when the native check fails', async () => {
    setPlatform('ios');
    appleAvailable.mockRejectedValue(new Error('no module'));
    expect(await isAppleNativeAvailable()).toBe(false);
  });
});

describe('signInWithAppleNative', () => {
  const credential = {
    user: 'apple-user',
    state: null,
    fullName: null,
    email: null,
    realUserStatus: 1,
    identityToken: 'apple.identity.token',
    authorizationCode: 'auth-code',
  } as AppleAuthentication.AppleAuthenticationCredential;

  beforeEach(() => {
    mockAuth.signInWithIdToken.mockResolvedValue({
      data: { session: SESSION, user: SESSION.user },
      error: null,
    });
    mockAuth.updateUser.mockResolvedValue({ data: { user: SESSION.user }, error: null });
  });

  it('gives Apple the SHA-256 of the nonce and Supabase the raw nonce', async () => {
    appleSignIn.mockResolvedValue(credential);

    expect(await signInWithAppleNative()).toEqual({ ok: true });

    const appleOptions = appleSignIn.mock.calls[0]?.[0];
    expect(appleOptions?.requestedScopes).toEqual([
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ]);
    const supabaseArgs = mockAuth.signInWithIdToken.mock.calls[0][0];
    expect(supabaseArgs).toEqual({
      provider: 'apple',
      token: 'apple.identity.token',
      nonce: RAW_NONCE,
    });
    expect(RAW_NONCE).toMatch(/^[0-9a-f]{64}$/);
    expect(appleOptions?.nonce).toBe(mockCreateHash('sha256').update(RAW_NONCE).digest('hex'));
    expect(appleOptions?.nonce).not.toBe(RAW_NONCE);
  });

  it.each(['ERR_REQUEST_CANCELED', 'ERR_CANCELED'])('treats %s as cancelled', async (code) => {
    appleSignIn.mockRejectedValue(Object.assign(new Error('The user canceled'), { code }));
    expect(await signInWithAppleNative()).toEqual({ ok: false, kind: 'cancelled' });
    expect(mockAuth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it('maps other Apple failures', async () => {
    appleSignIn.mockRejectedValue(
      Object.assign(new Error('failed'), { code: 'ERR_REQUEST_FAILED' }),
    );
    expect(await signInWithAppleNative()).toEqual({ ok: false, kind: 'auth', code: 'unknown' });
  });

  it('fails without an identity token', async () => {
    appleSignIn.mockResolvedValue({ ...credential, identityToken: null });
    expect(await signInWithAppleNative()).toEqual({ ok: false, kind: 'auth', code: 'unknown' });
    expect(mockAuth.signInWithIdToken).not.toHaveBeenCalled();
  });

  it('maps a rejected token', async () => {
    appleSignIn.mockResolvedValue(credential);
    mockAuth.signInWithIdToken.mockResolvedValue({
      data: { session: null, user: null },
      error: new AuthApiError('Provider is not enabled', 400, 'provider_disabled'),
    });
    expect(await signInWithAppleNative()).toEqual({
      ok: false,
      kind: 'auth',
      code: 'provider_disabled',
    });
  });

  it('keeps the name Apple shares on the first authorization', async () => {
    appleSignIn.mockResolvedValue({
      ...credential,
      fullName: {
        namePrefix: null,
        givenName: 'Anna',
        middleName: null,
        familyName: 'Muster',
        nameSuffix: null,
        nickname: null,
      },
    });
    expect(await signInWithAppleNative()).toEqual({ ok: true });
    expect(mockAuth.updateUser).toHaveBeenCalledWith({
      data: { full_name: 'Anna Muster', given_name: 'Anna', family_name: 'Muster' },
    });
  });

  it('does not touch the user without a name, and survives a failed name update', async () => {
    appleSignIn.mockResolvedValue(credential);
    await signInWithAppleNative();
    expect(mockAuth.updateUser).not.toHaveBeenCalled();

    appleSignIn.mockResolvedValue({
      ...credential,
      fullName: {
        namePrefix: null,
        givenName: 'Anna',
        middleName: null,
        familyName: null,
        nameSuffix: null,
        nickname: null,
      },
    });
    mockAuth.updateUser.mockRejectedValue(new TypeError('Network request failed'));
    expect(await signInWithAppleNative()).toEqual({ ok: true });
  });
});

describe('signInWithApple', () => {
  it('uses the native sheet where available', async () => {
    setPlatform('ios');
    appleAvailable.mockResolvedValue(true);
    appleSignIn.mockRejectedValue(Object.assign(new Error('x'), { code: 'ERR_REQUEST_CANCELED' }));
    expect(await signInWithApple()).toEqual({ ok: false, kind: 'cancelled' });
    expect(appleSignIn).toHaveBeenCalled();
    expect(mockAuth.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('uses the browser flow elsewhere', async () => {
    setPlatform('android');
    mockAuth.signInWithOAuth.mockResolvedValue({
      data: { provider: 'apple', url: 'https://abc.supabase.co/auth/v1/authorize?provider=apple' },
      error: null,
    });
    openAuthSession.mockResolvedValue({ type: 'cancel' } as WebBrowser.WebBrowserAuthSessionResult);
    expect(await signInWithApple()).toEqual({ ok: false, kind: 'cancelled' });
    expect(mockAuth.signInWithOAuth.mock.calls[0][0].provider).toBe('apple');
    expect(appleSignIn).not.toHaveBeenCalled();
  });
});

// --- Auth settings ----------------------------------------------------------------------------

describe('fetchAuthSettings', () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.useRealTimers();
  });

  function respond(body: unknown, init: { ok?: boolean; status?: number } = {}) {
    fetchMock.mockResolvedValue({
      ok: init.ok ?? true,
      status: init.status ?? 200,
      json: async () => body,
    });
  }

  it('reads the enabled providers with the publishable key', async () => {
    respond({
      external: { email: true, apple: false, google: true, github: true },
      disable_signup: false,
      mailer_autoconfirm: true,
    });

    expect(await fetchAuthSettings()).toEqual({
      email: true,
      google: true,
      apple: false,
      signupEnabled: true,
      emailConfirmationRequired: false,
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://abc.supabase.co/auth/v1/settings');
    expect(init.method).toBe('GET');
    expect(init.headers).toEqual({ apikey: 'sb_publishable_test', Accept: 'application/json' });
  });

  it('reads disabled sign-ups and required confirmation', async () => {
    respond({
      external: { email: true, apple: true },
      disable_signup: true,
      mailer_autoconfirm: false,
    });
    expect(await fetchAuthSettings()).toEqual({
      email: true,
      google: false,
      apple: true,
      signupEnabled: false,
      emailConfirmationRequired: true,
    });
  });

  it('only trusts literal true', async () => {
    respond({ external: { email: 'true', google: 1, apple: null } });
    expect(await fetchAuthSettings()).toEqual({
      email: false,
      google: false,
      apple: false,
      signupEnabled: true,
      emailConfirmationRequired: true,
    });
  });

  it.each([
    ['an error status', () => respond({ message: 'no' }, { ok: false, status: 503 })],
    ['a body without providers', () => respond({ disable_signup: false })],
    ['a non-object body', () => respond('<html>')],
    ['a null body', () => respond(null)],
    [
      'invalid JSON',
      () =>
        fetchMock.mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError('Unexpected token <');
          },
        }),
    ],
    [
      'a network failure',
      () => fetchMock.mockRejectedValue(new TypeError('Network request failed')),
    ],
  ])('falls back to email only on %s', async (_label, arrange) => {
    arrange();
    expect(await fetchAuthSettings()).toEqual(FALLBACK_AUTH_SETTINGS);
  });

  it('falls back without a request when the app is not configured', async () => {
    mockReadEnv.mockReturnValue({ ok: false, problems: ['x'] });
    expect(await fetchAuthSettings()).toEqual(FALLBACK_AUTH_SETTINGS);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('gives up after the timeout', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
        }),
    );
    const settings = fetchAuthSettings();
    await jest.advanceTimersByTimeAsync(AUTH_SETTINGS_TIMEOUT_MS);
    await expect(settings).resolves.toEqual(FALLBACK_AUTH_SETTINGS);
  });

  it('returns a copy of the fallback, never the shared object', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    const settings = await fetchAuthSettings();
    expect(settings).not.toBe(FALLBACK_AUTH_SETTINGS);
    expect(Object.isFrozen(FALLBACK_AUTH_SETTINGS)).toBe(true);
  });
});
