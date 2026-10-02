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
  constraint). A payday the month does not have (the 31st in April) falls on the month's last day.
- **Time zone.** `profiles.timezone` is a name from `pg_timezone_names` (trigger `check_timezone`).
  "Today" and the day a transaction belongs to are always taken in that zone.
- **Onboarded profiles** always have `net_income_rappen` and `payday` (CHECK
  `profiles_onboarded_has_income`): the payday reset needs both.

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

Functions: `authenticated` may execute exactly `complete_onboarding`, `delete_my_account`,
`ensure_current_period`, `get_overview`, `move_budget` and `period_containing`; `anon` none.
`roll_due_periods()` is for the scheduler only. Functions in schema `private` and trigger functions
are not callable by clients. Every function pins `search_path` to `''`.

## Functions and triggers

| Name                                          | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `handle_new_user`                             | After sign-up: creates `profiles` (language from sign-up metadata, else `de`), `notification_settings`, `subscriptions` (`none`).                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `delete_my_account()`                         | Deletes the calling user; everything cascades. Raises 42501 when not signed in.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `check_transaction_splits`                    | Deferred constraint trigger enforcing the split rules, also when a part moves between transactions.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `set_updated_at`, `set_created_at`            | Server-assigned timestamps.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `period_containing(date, payday)`             | The period containing a date: payday (inclusive) to the next payday (exclusive). Mirror of `periodContaining` in `@budget/core`, parity-tested for every day of 2024–2027 and every payday.                                                                                                                                                                                                                                                                                                                                                                     |
| `complete_onboarding(p jsonb)`                | Onboarding in one atomic call, with the caller's rights (RLS): profile fields, fixed costs, categories (`sort_order` = 0-based position), the period containing today in the given time zone (fixed costs = their sum, carried 0) with one budget per category, notification settings (missing keys unchanged), `onboarding_completed_at`. Returns the period id. Errors: `already_onboarded` (55000); `no_categories`, `net_income_required`, `invalid_timezone` (22023); CHECK/NOT NULL violations for invalid values. Input shape: comment in the migration. |
| `ensure_current_period()`                     | The payday reset for the signed-in user (`private.roll_periods`). Returns the current period id, or null before onboarding. 42501 when not signed in.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `get_overview()`                              | Home screen JSON, with the caller's rights (RLS): `today`, the current `period` (plan snapshot), `categories` (every active one plus archived ones with spending in the period; budget, rollover and spent, zeros without a budget; by `sort_order`, then `created_at`), `uncategorized_spent_rappen`, the 5 latest `recent_transactions` (not deleted or merged, any period). Calls `ensure_current_period()` first; null before onboarding. Timestamps in UTC.                                                                                                |
| `move_budget(from, to, amount)`               | Moves Rappen between two of the caller's budgets of the same open period (`closed_at` null), atomically. 22023: `invalid_amount`, `same_budget`, `budget_not_found` (also another user's budget), `different_periods`, `period_closed`, `insufficient_budget`.                                                                                                                                                                                                                                                                                                  |
| `roll_due_periods()`                          | The scheduler's reset: rolls every onboarded user whose latest period has ended in their time zone; returns how many were rolled. A user whose reset fails is logged (warning) and skipped. pg_cron job `roll-due-periods`, hourly at minute 5.                                                                                                                                                                                                                                                                                                                 |
| `private.roll_periods(user)`                  | The monthly reset (serialized per user). While the latest period has ended: close it (`closed_at`, `leftover_action` = profile policy, `leftover_rappen`; a period closed earlier keeps its recorded outcome), open the next one from its `ends_on` to the next payday after it (after a payday change: one transition period) with income, active fixed costs and savings from the profile now, the settled carry-over, and copies of its budgets (rollover 0, archived categories left out).                                                                  |
| `private.period_totals(user, from, to, zone)` | Spent per category in a period, by the spending rules below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `private.settle_leftover(policy, leftover)`   | Mirror of `settleLeftover`: `rollover` carries everything (a deficit too), `savings` saves a positive leftover and carries nothing, `reset` carries nothing.                                                                                                                                                                                                                                                                                                                                                                                                    |
| `check_timezone` (trigger)                    | `profiles.timezone` must be a name in `pg_timezone_names`, else 22023 `invalid_timezone`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

## Spending rules

What counts as spending in a period (`private.period_totals`; `get_overview()` applies the same
rules under RLS, and a test keeps both in step):

1. A transaction belongs to the period when its booking time, converted to the user's time zone,
   falls on a date in `[starts_on, ends_on)`. 23:30 UTC on the period's last day is already the
   next day in Zurich, so it counts in the next period.
2. Ignored: deleted transactions (`deleted_at`), merged duplicates (`merged_into_id`) and
   fixed-cost payments (`fixed_cost_id`: fixed costs are already deducted in the plan).
3. A split transaction contributes its parts; any other transaction contributes itself
   (`amount_rappen`, `category_id`).
4. Counted: every negative amount (a purchase), and positive amounts that have a category (a
   refund gives money back to that category). Positive amounts without a category (e.g. a salary
   arriving through a bank feed) do not change the budget.
5. `spent = −Σ amount` per category; uncategorized spending is one total (`category_id` null).
   Categories without counted transactions have no total (0 in the overview).

When a period closes, `leftover = income − fixed costs − savings + carried over − spent` (all
categories and uncategorized), and the profile's `leftover_policy` decides what the next period
carries over (see `private.settle_leftover`).

## Changing the schema

1. Add a new migration in `supabase/migrations/` (never edit an applied one).
2. Grant privileges explicitly; add RLS policies.
3. Mirror any vocabulary in `packages/core/src/constants.ts`.
4. Regenerate types: `npm run gen:types --workspace @budget/db` (Supabase CLI output, formatted with Prettier; CI fails when the file is stale).
5. Extend `supabase/tests` (the catalog-driven tests fail until a new table is covered).
