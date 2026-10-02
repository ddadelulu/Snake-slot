# Security

Owner: **Tom Cruise**. A security review happens before every release; milestone reviews keep the
foundations honest. Report a vulnerability privately to the repository owner, not in an issue.

## Milestone 1 review (2026-10-01): passed, no open findings

| Area                    | Check                                                                                                                                                                                        | Result |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Data isolation          | RLS on every table; "own rows only" policies; catalog test fails for any new table without RLS                                                                                               | ✅     |
| Least privilege         | Client privileges start from nothing, granted per table/column; `anon` has nothing; future tables too                                                                                        | ✅     |
| Cross-tenant references | Composite `(id, user_id)` foreign keys; tested for clients and for the owner role                                                                                                            | ✅     |
| Server-only data        | Tokens table in schema `private`, RLS without policies, no client privileges                                                                                                                 | ✅     |
| Trusted records         | Subscriptions and alerts not writable by clients; assistant messages only from the backend; consent log append-only with server time                                                         | ✅     |
| Functions               | `security definer` functions pin `search_path = ''`; only `delete_my_account` is callable (authenticated)                                                                                    | ✅     |
| Auth flow               | PKCE for email links and OAuth; Apple sign-in with SHA-256 nonce; deep-link `next` from an allow-list                                                                                        | ✅     |
| Passwords               | Minimum 10 characters, maximum 72 bytes (bcrypt limit), checked in the app and by Auth; secure password change on. Hosted projects: same settings plus leaked-password protection (SETUP.md) | ✅     |
| Token storage           | Keychain/Keystore via expo-secure-store, `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` (no backups); chunked with a generation tag so a torn write reads as "no session"                             | ✅     |
| Keys in the app         | Only the publishable/anon key; `readEnv()` refuses `sb_secret_…` keys and service-role JWTs                                                                                                  | ✅     |
| Transport               | `https` required outside local development (enforced in `readEnv()`)                                                                                                                         | ✅     |
| Logging                 | No `console` output of tokens, emails or passwords                                                                                                                                           | ✅     |
| Secrets in the repo     | None: `.env*` ignored, provider secrets via `env()` in `config.toml` and EAS environment variables                                                                                           | ✅     |
| Account deletion        | Deletes the auth user and cascades every table (tested table by table)                                                                                                                       | ✅     |
| Rate limits             | Supabase Auth limits per IP for sign-in, sign-up, email sending; app shows `rate_limited`                                                                                                    | ✅     |

## Milestone 2 review (2026-10-02)

| Area         | Check                                                                                                                                                                                                                                                                                         | Result |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| New RPCs     | `complete_onboarding`, `get_overview`, `move_budget` run with the caller's rights under RLS; `ensure_current_period` and `roll_due_periods` are SECURITY DEFINER, use only `auth.uid()` (or run as the scheduler) and pin `search_path`; a catalog test allows exactly four definer functions | ✅     |
| Grants       | anon executes nothing; authenticated executes exactly six RPCs; nothing in `private` is executable by clients (tested)                                                                                                                                                                        | ✅     |
| Integrity    | Time zones validated by trigger; an onboarded profile must keep income and payday (CHECK); budget moves only inside the open period, rows locked in id order                                                                                                                                  | ✅     |
| Concurrency  | The payday reset takes a per-user advisory lock; tested with two concurrent connections                                                                                                                                                                                                       | ✅     |
| Client input | Onboarding payload read through a whitelist of keys; every value bounded by table constraints                                                                                                                                                                                                 | ✅     |

**Accepted for M3:** clients still hold the Milestone 1 table grants, so they could set
`onboarding_completed_at` or delete their own periods directly. This only affects their own data;
M3 narrows `profiles` and `budget_periods` to column-level grants.

## Known limits, accepted for M1

- **Access token after deletion or sign-out.** Supabase access tokens are JWTs valid up to one
  hour. After account deletion the user row is gone, so RLS returns nothing and inserts fail their
  foreign keys; after sign-out the refresh token is revoked. Revisit if tokens get longer lives.
- **Web build stores the session in localStorage.** The web build exists for automated tests only
  and is not shipped to users.
- **Reset link vs. a later OAuth start.** supabase-js keeps one PKCE verifier per device, so
  starting a Google sign-in after requesting a reset email invalidates that email's link (the user
  requests a new one). Re-evaluate `appendPkceFlowIdToRedirects` when it leaves experimental status.

## Before release (M7)

Dependency audit, secrets scan, review of every Edge Function (service-role use), token encryption
key management for `private.data_source_credentials`, store privacy labels, penetration test
checklist (OWASP MASVS L1), and a check that the Supabase dashboard settings match SETUP.md.
