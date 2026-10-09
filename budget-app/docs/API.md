# API

Owner: **Keanu Reeves** (contract), **Matt Damon** (backend). The app talks to Supabase only;
there is no custom server yet (Edge Functions start in M2).

## Server endpoints

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

Data hooks for Milestone 2: `useOverview()` (`src/data/overview.ts`: parses `get_overview`,
derives the month with the engine) and `useCompleteOnboarding()` (`src/data/onboarding.ts`).

`get_overview` returns `null` before onboarding, otherwise:

```json
{ "today": "2026-10-02",
  "period": { "id", "starts_on", "ends_on", "income_rappen", "fixed_costs_rappen", "savings_rappen", "carried_over_rappen" },
  "categories": [ { "category_id", "default_key", "name", "icon", "sort_order", "archived",
                    "budget_id", "budget_amount_rappen", "rollover_rappen", "spent_rappen" } ],
  "uncategorized_spent_rappen": 0,
  "recent_transactions": [ { "id", "amount_rappen", "booked_at", "merchant", "category_id", "is_split", "source", "note" } ] }
```

## Transactions (Milestone 3)

Every transaction reaches the database through **one pipeline**, `add_transactions`, whatever its
source: manual entry and statement files today, bank feeds, notifications and receipts from M6
(those call the same steps from server code). The pipeline validates, recognizes re-imports,
merges duplicates across sources, detects fixed-cost payments, categorizes and stores
([CATEGORIZATION.md](CATEGORIZATION.md) explains the rules). All functions below run with the
caller's rights (row-level security applies), need a signed-in user (else `42501`) and raise
`22023` with the message in the error lists for invalid input.

### `add_transactions(p jsonb) → jsonb`

```json
{ "rows": [ IngestRow, … ],                       // 1–2000 rows, processed in order
  "import": { "file_name": "konto.csv", "format": "csv" | "camt053", "bank": "postfinance" | null },
  "dry_run": false }
```

`IngestRow` is built by `toIngestRow()` in `@budget/core` (`packages/core/src/ingest.ts`):

| Key                                            | Meaning                                                                                                                |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `amount_rappen`                                | Signed, non-zero (negative = money out)                                                                                |
| `booked_at` _or_ `booked_on` (+ `booked_time`) | An instant with offset, or a local date (and `HH:MM[:SS]`) placed in the user's time zone; no time means 12:00         |
| `merchant`, `raw_text`, `mcc`                  | What the source knows (`merchant` 1–200, `raw_text` ≤ 4000, `mcc` 0–9999)                                              |
| `source`                                       | `manual` or `statement_import` from the app (`statement_import` exactly when `import` is given)                        |
| `external_id`                                  | The source's own id (statement parsers always set one); a second row with the same source and id is `already_imported` |
| `original_amount_minor`, `original_currency`   | Foreign amount, display only; both or neither                                                                          |
| `items`                                        | `[{ description, amount_rappen, quantity? }]`                                                                          |
| `category_id`                                  | Chosen by the person: one of their active categories; stored as `categorized_by = 'user'`, confidence 100              |
| `splits`                                       | `[{ category_id, amount_rappen, note }]`, ≥ 2 parts, same sign, exact sum; `category_id` must then be absent or null   |
| `note`                                         | ≤ 500 characters                                                                                                       |
| `allow_duplicate`                              | Store even if it looks like a row already stored from the same source                                                  |

Result (`dry_run: true` computes the same without storing anything; ids of new rows are then
null and no data source is created):

```json
{ "data_source_id": "uuid" | null,
  "results": [ { "index": 0,
                 "outcome": "added" | "merged" | "already_imported" | "possible_duplicate",
                 "transaction_id": "uuid" | null,
                 "duplicate_of": { "id", "booked_at", "merchant", "amount_rappen", "source" } | null,
                 "category_id": "uuid" | null, "categorized_by": "none|user|rule|merchant_list|mcc|refund",
                 "category_confidence": 0-100 | null, "fixed_cost_id": "uuid" | null,
                 "needs_review": false } ],
  "counts": { "added": 0, "merged": 0, "already_imported": 0, "possible_duplicate": 0, "needs_review": 0 } }
```

- `added`: stored as a new transaction (`transaction_id`).
- `merged`: the same purchase already came from another source; it is stored as evidence with
  `merged_into_id` and `transaction_id` is the surviving transaction, which gains what it lacked
  (`duplicate_of` describes it too).
- `already_imported`: this source sent this id before; nothing stored.
- `possible_duplicate`: looks like a stored transaction (`duplicate_of`): from the same source
  with the same amount and merchant within four days but a different id, or from another source
  with the same amount within four days when the merchants cannot be compared (no merchant, or a
  split). Days are local dates in the person's time zone.
  Not stored unless the row says `allow_duplicate` (quick add offers "Add anyway").
- With `import`, the call creates one `data_sources` row (kind `statement_import`) for the
  file when anything was stored, and links the stored rows to it. Imported rows are stored as
  already acknowledged (no cash-feel moment for history, D-033).

Errors (`22023`): `invalid_input`, `too_many_rows`, `invalid_row` (detail names the row index
and the problem), `category_not_found`, `invalid_splits`. `55000 not_onboarded` before onboarding.

### Reading

`list_transactions(p jsonb) → { items: TransactionItem[], next_cursor }`. Filters, all optional,
combined with AND (categories and `uncategorized` with OR): `search` (merchant, note or statement
text; accents, case, ae/oe/ue spellings and apostrophes do not matter), `category_ids` (≤ 100; a split matches by any part), `uncategorized`, `sources` (≤ 8), `from` / `to`
(local dates, inclusive), `needs_review`; `limit` 1–100 (default 50); `cursor` from the previous
page. Newest first; deleted and merged rows are left out.

`get_transaction(p_id uuid) → TransactionItem | null` (null for unknown or merged ids; deleted
rows are returned with `deleted_at`).

```json
TransactionItem = { "id", "amount_rappen", "booked_at", "merchant", "raw_text", "note", "mcc",
  "source", "data_source_id", "data_source_name", "category_id", "categorized_by",
  "category_confidence", "fixed_cost_id", "original_amount_minor", "original_currency", "items",
  "suggested_rule": { "match_field": "merchant", "match_type": "contains", "pattern": "manor" } | null,
  "splits": [ { "id", "category_id", "amount_rappen", "note" } ],
  "merged_sources": [ "statement_import" ], "needs_review": true, "deleted_at": null,
  "created_at" }
```

`needs_review` is true when the transaction counts against the budget (money out, or money in
with a category), is not a fixed-cost payment or a split, was not placed by the person or one of
their rules, and has no category or a confidence below 70 (`REVIEW_CONFIDENCE` in
`@budget/core`).

`get_overview()` additionally returns `needs_review_count` (transactions of the current period
that need a category) and, per recent transaction, `categorized_by` and `needs_review`.

### Changing

`update_transaction(p_id uuid, p jsonb) → { transaction, rule_id, recategorized_count }`, keys
all optional:

| Key                          | Effect                                                                                                                                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `category_id`                | The person's choice (`categorized_by = 'user'`, confidence 100; null = "no category", not asked again); ends a fixed-cost link                                                                                                                                |
| `rule`                       | With a non-null `category_id`: `{ match_field: 'merchant' \| 'raw_text', match_type: 'contains' \| 'equals', pattern }` creates (or re-targets) a rule with top priority and applies it to every transaction not placed by the person (`recategorized_count`) |
| `fixed_cost_id`              | Marks the transaction as the payment of one of the person's fixed costs (null removes it); the fixed cost learns the merchant (`merchant_hint`) when it has none                                                                                              |
| `note`, `merchant`           | Text; empty string clears                                                                                                                                                                                                                                     |
| `amount_rappen`, `booked_at` | Manual entries only (`not_editable` otherwise)                                                                                                                                                                                                                |
| `deleted`                    | `true` deletes (soft, `deleted_at`), `false` restores                                                                                                                                                                                                         |

Errors (`22023`): `invalid_input`, `transaction_not_found`, `category_not_found`,
`fixed_cost_not_found`, `transaction_is_split`, `not_editable`, `rule_needs_category`.

`set_transaction_splits(p_id uuid, p_parts jsonb) → TransactionItem`: replaces the parts
(`[{ category_id, amount_rappen, note }]`, ≥ 2, same sign, exact sum) and clears the
transaction's own category; `[]` removes the split. Errors: `transaction_not_found`,
`invalid_splits`, `category_not_found`.

Rules: `categorization_rules` is read and deleted through the REST API (own rows). Deleting a rule
does not change transactions it already placed.

### Imports and export

`remove_import(p_data_source_id uuid) → { removed, restored }`: deletes every transaction stored
from that file for good (D-041), brings back rows that had been merged into them, restores what
its merges had copied into earlier transactions (unless changed since), and marks the source
`revoked`; `removed` counts the visible transactions deleted, `restored` the earlier transactions
put back. Error: `import_not_found`. Imports are listed from
`data_sources` (`kind = 'statement_import'`; `settings` holds `file_name`, `format`, `bank`,
`added`, `merged`).

`export_my_data() → jsonb`: everything stored about the signed-in user, for the data export
(revDSG art. 28, GDPR art. 20): `format_version`, `exported_at`, `profile`,
`notification_settings`, `subscription`, `fixed_costs`, `categories`, `budget_periods`, `budgets`,
`transactions` (all, including deleted and merged rows), `transaction_splits`,
`categorization_rules`, `data_sources` (never tokens), `alerts`, `ai_conversations`,
`ai_messages`, `consent_events`. The app turns it into `transactions.csv` or saves it as JSON.

## Alerts, moments, reminders, editors (Milestone 4)

Contract for M4 (Keanu Reeves). All RPCs `security invoker` unless noted, signed-in only.

**Alert engine (database).** `internal.evaluate_alerts(user, transaction_id null)` runs at the end
of `add_transactions`, `update_transaction` and `set_transaction_splits` (same transaction), and
the hourly job `run_scheduled_alerts()` (pg_cron) handles time-based ones. Each alert is one
`alerts` row with a `dedupe_key` (never twice), `title`/`body` in the profile language (de/en),
`params` (amounts in Rappen, dates). Only enabled types (`notification_settings`) are created.

| Type                                                          | When (once per …)                                                                                                             |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `category_50`, `category_80`, `category_100`, `category_over` | spent crosses 50 / 80 / 100 % / goes over a category's budget (category and period)                                           |
| `total_low`                                                   | balance below 20 % of spendable (period)                                                                                      |
| `pace`                                                        | at the current rate a category or the total runs out before payday ("Eating out runs out on the 18th"); daily                 |
| `unusual_purchase`                                            | a purchase over 3 × the category's median of the last 90 days and over CHF 50 (transaction)                                   |
| `daily_allowance`                                             | today's spending exceeds the day's allowance (day)                                                                            |
| `payday`                                                      | a new period opened, with last period's summary (period)                                                                      |
| `categorize`                                                  | a transaction needs review ("CHF 84 at Manor: what was it?") (transaction)                                                    |
| `reminder_payday`, `reminder_weekly`, `reminder_stale`        | "plan your new month" on payday; weekly "log cash, import your statement" (day/time set); no budget change in 30 days (D-044) |

**Push.** `register_push_token(p_token, p_platform)` / `unregister_push_token(p_token)` (table
`push_tokens`). `claim_pushes(p_limit)` (service role only) returns alerts not yet pushed whose
user is outside quiet hours (in the profile time zone) and under `max_per_day`, and marks them
`pushed_at`; the Edge Function `send-pushes` (scheduled every 5 minutes) sends them to the Expo
push API. Transaction alerts carry `transaction_id`, so tapping opens the cash-feel moment.

**Moments.** `pending_moments()` → recent (7 days) unacknowledged money-out transactions, oldest
first, each with `balance_before/after_rappen`, the category's `remaining_before/after_rappen` and
budget, and `over_budget`. `acknowledge_transactions(p_ids uuid[])` ("I paid this").

**Inbox.** `list_alerts(p jsonb)` (newest first, cursor), `mark_alerts_read(p_ids uuid[])`,
`dismiss_alert(p_id)`; `unread_alert_count` in `get_overview`.

**Editors.** Profile income/payday/hours/savings/leftover/pain/sound via the profile (column
grants); changes to income, fixed costs and saving apply from the next period. Fixed costs:
insert/update, `active = false` instead of delete. Categories: insert, rename, archive
(`archived_at`). `set_budget(p_category_id, p_amount_rappen)` for the open period (creates the
budget row if missing). `get_category_detail(p_category_id)` → budget, rollover, spent, the last 6
periods' budget and spent, and the pace forecast inputs.

**Guard (M4-06).** Clients can no longer insert/update/delete `transactions`,
`transaction_splits` or `data_sources` directly; only the RPCs (which set a transaction-local
flag checked by triggers) can.
