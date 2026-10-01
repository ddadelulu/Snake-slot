import {
  AuthApiError,
  AuthError,
  AuthImplicitGrantRedirectError,
  AuthInvalidCredentialsError,
  AuthPKCECodeVerifierMissingError,
  AuthPKCEGrantCodeExchangeError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  AuthUnknownError,
  AuthWeakPasswordError,
} from '@supabase/supabase-js';

import { AUTH_ERROR_CODES, isOAuthCancellation, toAuthErrorCode } from './errors';

describe('AUTH_ERROR_CODES', () => {
  it('is the full, duplicate-free list screens translate', () => {
    expect(AUTH_ERROR_CODES).toEqual([
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
    ]);
    expect(new Set(AUTH_ERROR_CODES).size).toBe(AUTH_ERROR_CODES.length);
  });
});

describe('toAuthErrorCode', () => {
  it.each([
    ['invalid_credentials', 400, 'invalid_credentials'],
    ['email_not_confirmed', 400, 'email_not_confirmed'],
    ['provider_email_needs_verification', 400, 'email_not_confirmed'],
    ['user_already_exists', 422, 'user_already_exists'],
    ['email_exists', 422, 'user_already_exists'],
    ['identity_already_exists', 422, 'user_already_exists'],
    ['weak_password', 422, 'weak_password'],
    ['same_password', 422, 'weak_password'],
    ['over_request_rate_limit', 429, 'rate_limited'],
    ['over_email_send_rate_limit', 429, 'rate_limited'],
    ['request_timeout', 504, 'network'],
    ['hook_timeout', 422, 'network'],
    ['provider_disabled', 400, 'provider_disabled'],
    ['email_provider_disabled', 400, 'provider_disabled'],
    ['oauth_provider_not_supported', 400, 'provider_disabled'],
    ['signup_disabled', 422, 'signup_disabled'],
    ['session_expired', 401, 'session_expired'],
    ['session_not_found', 401, 'session_expired'],
    ['refresh_token_not_found', 400, 'session_expired'],
    ['refresh_token_already_used', 400, 'session_expired'],
    ['bad_jwt', 401, 'session_expired'],
    ['user_not_found', 404, 'session_expired'],
    ['reauthentication_needed', 400, 'session_expired'],
    ['otp_expired', 403, 'link_invalid'],
    ['flow_state_not_found', 404, 'link_invalid'],
    ['flow_state_expired', 400, 'link_invalid'],
    ['bad_code_verifier', 400, 'link_invalid'],
    ['bad_oauth_state', 400, 'link_invalid'],
    ['bad_oauth_callback', 400, 'link_invalid'],
    ['unexpected_failure', 500, 'unknown'],
    ['captcha_failed', 400, 'unknown'],
  ] as const)('maps server code %s (%i) to %s', (code, status, expected) => {
    expect(toAuthErrorCode(new AuthApiError('message', status, code))).toBe(expected);
  });

  it('maps a 429 without a code to rate_limited', () => {
    expect(toAuthErrorCode(new AuthApiError('Too many requests', 429, undefined))).toBe(
      'rate_limited',
    );
  });

  it.each([
    [new AuthRetryableFetchError('Network request failed', 0), 'network'],
    [new AuthRetryableFetchError('Bad gateway', 502), 'network'],
    [new AuthSessionMissingError(), 'session_expired'],
    [new AuthInvalidCredentialsError('missing email or phone'), 'invalid_credentials'],
    [new AuthWeakPasswordError('weak', 422, ['pwned']), 'weak_password'],
    [new AuthPKCECodeVerifierMissingError(), 'link_invalid'],
    [new AuthPKCEGrantCodeExchangeError('no code'), 'link_invalid'],
    [new AuthImplicitGrantRedirectError('denied'), 'link_invalid'],
    [new AuthUnknownError('Unexpected token <', new SyntaxError('x')), 'unknown'],
    [new AuthError('Something odd'), 'unknown'],
  ])('maps %p by class', (error, expected) => {
    expect(toAuthErrorCode(error)).toBe(expected);
  });

  it('prefers the redirect details of grant errors over the class', () => {
    const error = new AuthPKCEGrantCodeExchangeError('failed', {
      error: 'invalid_request',
      code: 'provider_disabled',
    });
    expect(toAuthErrorCode(error)).toBe('provider_disabled');
  });

  it.each([
    ['Invalid login credentials', 'invalid_credentials'],
    ['Email not confirmed', 'email_not_confirmed'],
    ['User already registered', 'user_already_exists'],
    ['Signups not allowed for this instance', 'signup_disabled'],
    ['Unsupported provider: provider is not enabled', 'provider_disabled'],
    ['Email rate limit exceeded', 'rate_limited'],
  ])('falls back to the message %j for code-less errors', (message, expected) => {
    expect(toAuthErrorCode(new AuthApiError(message, 400, undefined))).toBe(expected);
  });

  it('uses the message only when the code is unknown', () => {
    expect(
      toAuthErrorCode(new AuthApiError('Invalid login credentials', 400, 'validation_failed')),
    ).toBe('invalid_credentials');
    expect(
      toAuthErrorCode(new AuthApiError('Invalid login credentials', 400, 'email_not_confirmed')),
    ).toBe('email_not_confirmed');
  });

  it.each([
    new TypeError('Network request failed'),
    new TypeError('Failed to fetch'),
    new TypeError('NetworkError when attempting to fetch resource.'),
    new TypeError('Load failed'),
    new TypeError('fetch failed'),
  ])('maps fetch failure %p to network', (error) => {
    expect(toAuthErrorCode(error)).toBe('network');
  });

  it('maps OAuth redirect parameters', () => {
    expect(toAuthErrorCode({ error: 'access_denied', error_code: 'otp_expired' })).toBe(
      'link_invalid',
    );
    expect(toAuthErrorCode({ error: 'invalid_request', error_code: 'bad_oauth_state' })).toBe(
      'link_invalid',
    );
    expect(toAuthErrorCode({ error: 'server_error', error_code: 'signup_disabled' })).toBe(
      'signup_disabled',
    );
    expect(toAuthErrorCode({ error: 'temporarily_unavailable' })).toBe('network');
    expect(
      toAuthErrorCode({
        error: 'server_error',
        error_description: 'Unsupported provider: provider is not enabled',
      }),
    ).toBe('provider_disabled');
    expect(toAuthErrorCode({ error: 'access_denied' })).toBe('unknown');
  });

  it('maps PostgREST errors from auth-related data calls', () => {
    expect(
      toAuthErrorCode({ code: '42501', message: 'not signed in', details: '', hint: '' }),
    ).toBe('session_expired');
    expect(
      toAuthErrorCode({ code: 'PGRST303', message: 'JWT expired', details: '', hint: '' }),
    ).toBe('session_expired');
    expect(
      toAuthErrorCode({
        code: '',
        message: 'TypeError: Network request failed',
        details: '',
        hint: '',
      }),
    ).toBe('network');
  });

  it('maps bare server codes given as strings', () => {
    expect(toAuthErrorCode('over_email_send_rate_limit')).toBe('rate_limited');
    expect(toAuthErrorCode('Failed to fetch')).toBe('network');
    expect(toAuthErrorCode('nonsense')).toBe('unknown');
  });

  it.each([undefined, null, 42, true, {}, [], new Error('boom'), { code: 7 }, { status: 0 }])(
    'maps anything else (%p) to unknown without throwing',
    (value) => {
      expect(toAuthErrorCode(value)).toBe('unknown');
    },
  );

  it('does not let inherited object keys match a code', () => {
    expect(toAuthErrorCode({ code: 'constructor' })).toBe('unknown');
    expect(toAuthErrorCode({ error_code: 'toString' })).toBe('unknown');
  });
});

describe('isOAuthCancellation', () => {
  it('treats a plain access_denied as the person declining', () => {
    expect(isOAuthCancellation({ error: 'access_denied' })).toBe(true);
    expect(isOAuthCancellation({ error: 'access_denied', error_code: 'something_new' })).toBe(true);
    expect(isOAuthCancellation({ error: 'user_cancelled_authorize' })).toBe(true);
  });

  it('does not hide real failures', () => {
    expect(isOAuthCancellation({ error: 'access_denied', error_code: 'signup_disabled' })).toBe(
      false,
    );
    expect(isOAuthCancellation({ error: 'server_error' })).toBe(false);
    expect(isOAuthCancellation({})).toBe(false);
  });
});
