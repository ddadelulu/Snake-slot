# API

Owner: **Keanu Reeves** (contract), **Matt Damon** (backend). The app talks to Supabase only;
there is no custom server yet (Edge Functions start in M2).

## Server endpoints used in Milestone 1

| Endpoint                                  | Used for                                  | Auth                       |
| ----------------------------------------- | ----------------------------------------- | -------------------------- |
| `POST /auth/v1/signup`                    | Email sign-up (`data.language` → profile) | publishable key            |
| `POST /auth/v1/token?grant_type=password` | Email sign-in                             | publishable key            |
| `POST /auth/v1/token?grant_type=pkce`     | Exchange of email-link / OAuth codes      | publishable key + verifier |
| `POST /auth/v1/token?grant_type=id_token` | Native Sign in with Apple (with nonce)    | publishable key            |
| `GET /auth/v1/authorize?provider=…`       | Google / Apple browser flow (PKCE)        | –                          |
| `POST /auth/v1/recover`                   | Password reset email                      | publishable key            |
| `PUT /auth/v1/user`                       | New password                              | user JWT                   |
| `POST /auth/v1/logout?scope=local`        | Sign out on this device                   | user JWT                   |
| `GET /auth/v1/settings`                   | Which sign-in methods are enabled         | publishable key            |
| `GET/PATCH /rest/v1/profiles?id=eq.<uid>` | Read profile, update language             | user JWT + RLS             |
| `POST /rest/v1/rpc/delete_my_account`     | Delete account and all data               | user JWT                   |

All table access goes through PostgREST under row-level security; the rules per table are in
[DATA_MODEL.md](DATA_MODEL.md#access-rules).

## Redirect URLs

Email links and OAuth return to `batzen://auth/callback` (an `exp://…` URL in Expo Go, the web
origin in the web build). A password reset adds `next=reset-password`. The Supabase project's
redirect allow-list must contain `batzen://auth/callback**` plus the development variants (already
in `supabase/config.toml` for local use).

## App-side API (for screen code)

`apps/mobile/src/features/auth/authApi.ts`: none of these functions throw for expected failures.
Each resolves to `{ ok: true, … }` or one of:

- `{ ok: false, kind: 'field', fields: { email?, password? } }`: input problems, nothing was sent;
  show `t('auth.validation.<code>')` under the field.
- `{ ok: false, kind: 'auth', code }`: show `t('auth.errors.<code>')`. Codes: `invalid_credentials`,
  `email_not_confirmed`, `user_already_exists`, `weak_password`, `rate_limited`, `network`,
  `provider_disabled`, `signup_disabled`, `session_expired`, `link_invalid`, `unknown`.
- `{ ok: false, kind: 'cancelled' }`: the person closed the provider sheet; show nothing.

| Function                                         | Result                                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `signUpWithEmail({ email, password, language })` | `ok` with `status: 'signed_in' \| 'confirm_email'`                                 |
| `signInWithEmail({ email, password })`           | `ok` (navigation follows the auth state)                                           |
| `resendSignUpConfirmation(email)`                | `ok`                                                                               |
| `sendPasswordReset(email)`                       | `ok` whether or not the address has an account                                     |
| `updatePassword(password)`                       | `ok`                                                                               |
| `signOut()`                                      | `ok` once the local session is gone (also offline)                                 |
| `deleteAccount(queryClient)`                     | `ok`; RPC first, then local sign-out and cache clear                               |
| `signInWithOAuthProvider('google' \| 'apple')`   | `ok`, `cancelled` or error                                                         |
| `signInWithApple()`                              | native sheet on iOS, browser elsewhere                                             |
| `completeAuthFromUrl(url)`                       | `ok` with optional `next: 'reset-password'`                                        |
| `fetchAuthSettings()`                            | `{ email, google, apple, signupEnabled, emailConfirmationRequired }`, never throws |

Data hooks (`apps/mobile/src/data/profile.ts`): `useProfile()` and `useUpdateProfile()`
(optimistic, rolls back on error). Auth state: `useAuth()` from `features/auth/AuthProvider`.
