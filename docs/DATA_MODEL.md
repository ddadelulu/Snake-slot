# Data model

Owner: **Keanu Reeves** (design) and **Matt Damon** (migrations). Source of truth:
`supabase/migrations/`. TypeScript types are generated into `packages/core/src/database.types.ts`.

## Conventions

- **Money** is `bigint` Rappen with CHECK bounds of ±10'000'000'000 (CHF 100 million).
  `transactions.amount_rappen` is signed: negative = money out, positive = money in (refund).
- **Ownership.** Every user-owned row has `user_id` referencing `auth.users` with
  `on delete cascade`, so deleting the user deletes everything.
- **Tenant-safe references.** References between user-owned rows are composite foreign keys
  `(x_id, user_id) → x(id, user_id)`. A row can therefore never point at another user's row, even
  with a guessed id. Optional references use `on delete set null (x_id)` (only the id column).
- **Vocabularies** are `text` + CHECK constraints mirroring `packages/core/src/constants.ts`.
- **Timestamps** `created_at`/`updated_at` are set by the database (`set_updated_at` trigger;
  append-only tables get `set_created_at`, so clients cannot backdate them).
- **Periods.** A budget "month" runs from payday to the next payday: `budget_periods.starts_on`
  (inclusive) to `ends_on` (exclusive). Periods of one user can never overlap (exclusion
  constraint).

## Tables

| Table                             | One row per                 | Notes                                                                                                                                                                                                       |
| --------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.users`                      | account                     | Managed by Supabase Auth.                                                                                                                                                                                   |
| `profiles`                        | user                        | Income, payday, irregular income, weekly work minutes, savings amount/goal, leftover policy, pain level, sound, payment methods, language, time zone, onboarding completion. Created by trigger on sign-up. |
| `fixed_costs`                     | fixed cost                  | Kind (rent, health insurance, …), amount, due day, `merchant_hint` for auto-marking as paid.                                                                                                                |
| `categories`                      | category                    | Default categories by `default_key` (translated in the app) or custom `name`; archivable.                                                                                                                   |
| `budget_periods`                  | user and period             | Snapshot of income, fixed costs, savings, carried-over amount; closing records the leftover action.                                                                                                         |
| `budgets`                         | category and period         | Budget amount and rollover for one category in one period.                                                                                                                                                  |
| `transactions`                    | purchase/refund             | Unified output of all sources (see ARCHITECTURE.md), category, categorization source and confidence, items, fixed cost link, dedupe merge link, `acknowledged_at` ("I paid this"), soft delete.             |
| `transaction_splits`              | part of a split transaction | ≥ 2 parts, same sign, exact sum, parent has no category (checked at commit).                                                                                                                                |
| `data_sources`                    | connected source            | Kind, provider, status, consent version/granted/revoked, non-secret settings.                                                                                                                               |
| `private.data_source_credentials` | source with a token         | Encrypted token only. Not reachable by any client role.                                                                                                                                                     |
| `categorization_rules`            | rule                        | "Always do this for Manor?": field, match type, pattern, category, priority.                                                                                                                                |
| `alerts`                          | alert ever raised           | Unique `dedupe_key` per user: the same alert can never be raised twice. Clients may mark read or dismiss, never delete.                                                                                     |
| `notification_settings`           | user                        | Toggle per alert type, quiet hours, max per day.                                                                                                                                                            |
| `ai_conversations`                | conversation                |                                                                                                                                                                                                             |
| `ai_messages`                     | message                     | Clients may only write `user` messages; assistant/tool messages come from the backend.                                                                                                                      |
| `subscriptions`                   | user                        | Written only by the store webhook (service role); clients read their own row.                                                                                                                               |
| `consent_events`                  | consent given or withdrawn  | Append-only evidence log (revDSG/GDPR), server timestamps.                                                                                                                                                  |

## Access rules

Row-level security is enabled on every table; every policy is "own rows only"
(`user_id = auth.uid()`). On top of RLS, table privileges start from nothing and grant only what
the app needs. Future tables also start from nothing (default privileges revoked).

| Table                                                                                                                                    | `authenticated` may                         | `anon` |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------ |
| profiles                                                                                                                                 | select, update                              | –      |
| fixed_costs, categories, budget_periods, budgets, data_sources, transactions, transaction_splits, categorization_rules, ai_conversations | select, insert, update, delete              | –      |
| ai_messages                                                                                                                              | select, insert (`role = 'user'` only)       | –      |
| alerts                                                                                                                                   | select, update `read_at` and `dismissed_at` | –      |
| notification_settings                                                                                                                    | select, update                              | –      |
| subscriptions                                                                                                                            | select                                      | –      |
| consent_events                                                                                                                           | select, insert                              | –      |
| private.data_source_credentials                                                                                                          | –                                           | –      |

Functions: `delete_my_account()` (authenticated only). Trigger functions are not callable.

## Functions and triggers

| Name                               | What it does                                                                                                                      |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `handle_new_user`                  | After sign-up: creates `profiles` (language from sign-up metadata, else `de`), `notification_settings`, `subscriptions` (`none`). |
| `delete_my_account()`              | Deletes the calling user; everything cascades. Raises 42501 when not signed in.                                                   |
| `check_transaction_splits`         | Deferred constraint trigger enforcing the split rules, also when a part moves between transactions.                               |
| `set_updated_at`, `set_created_at` | Server-assigned timestamps.                                                                                                       |

## Changing the schema

1. Add a new migration in `supabase/migrations/` (never edit an applied one).
2. Grant privileges explicitly; add RLS policies.
3. Mirror any vocabulary in `packages/core/src/constants.ts`.
4. Regenerate types: `supabase gen types typescript --local > packages/core/src/database.types.ts`.
5. Extend `supabase/tests` (the catalog-driven tests fail until a new table is covered).
