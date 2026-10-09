# Architecture

Owner: **Keanu Reeves**. Shared contracts (data model, API, vocabularies, design tokens, source
plug-in contract) change only through the architect; see "Shared contracts" below.

## Stack

| Layer         | Choice                                                                       | Why                                                                                  |
| ------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| App           | React Native 0.86 + Expo SDK 57, TypeScript (strict), Expo Router 57         | Spec default. One codebase for iOS and Android; the web build is used for E2E tests. |
| Server state  | TanStack Query 5                                                             | Caching, retries, optimistic updates; the cache is cleared on sign-out.              |
| App state     | React context (auth, theme, language, notices)                               | Small and explicit; no global store needed yet.                                      |
| i18n          | i18next + react-i18next, typed keys                                          | German + English now, French/Italian by adding a catalogue.                          |
| Backend       | Supabase: Postgres 17, Auth, PostgREST, Edge Functions (from M2)             | Spec default. Row-level security puts the access rules next to the data.             |
| Auth          | Supabase Auth, PKCE; email/password, Google, Apple                           | Spec section 3.                                                                      |
| Tests         | Vitest (core, database), Jest + Testing Library (app), Playwright (E2E, web) | See [TESTING.md](TESTING.md).                                                        |
| Builds        | EAS Build profiles `development`, `staging`, `production`                    | See [RELEASE.md](RELEASE.md).                                                        |
| Subscriptions | RevenueCat (M7)                                                              | Spec default.                                                                        |

No stack changes from the spec defaults were needed.

## Repository layout

```
(repository root, branch budget-app)
├── package.json              npm workspaces, root scripts used by CI
├── tsconfig.base.json        strict compiler settings shared by all packages
├── packages/core/            @budget/core: shared contracts, no React, no I/O
│   └── src/
│       ├── app-identity.json   app name + deep-link scheme (the only place to rename the app)
│       ├── constants.ts        vocabularies mirrored by database CHECK constraints
│       ├── money.ts            integer Rappen: parse, format, sum, exact division
│       ├── budgetStatus.ts     green/orange/red thresholds (80 %, 100 %)
│       ├── sources.ts          transaction source plug-in contract + validator
│       ├── engine/             budget engine: dates, periods, plan, suggestion, pace,
│       │                       overview, leftover, hours of work, overspend cover
│       ├── import/             statement parsers: text decoding, CSV layouts, camt.053
│       ├── export/             CSV writer for the data export
│       ├── ingest.ts           the add_transactions row shape (every source)
│       ├── merchant.ts         merchant keys (mirror of internal.merchant_key)
│       ├── model.ts            row types with narrowed vocabularies
│       └── database.types.ts   generated from the schema (never edit by hand)
├── supabase/                 @budget/db: Supabase project
│   ├── config.toml             local stack configuration
│   ├── migrations/             SQL migrations (the schema is defined only here)
│   └── tests/                  schema, RLS, privilege and integrity tests
├── apps/mobile/              @budget/mobile: the Expo app
│   ├── app.config.ts           name, bundle ids per environment, plugins
│   ├── eas.json                build profiles
│   ├── e2e/                    Playwright tests of the web build
│   └── src/
│       ├── app/                routes only (Expo Router); each file is a screen
│       ├── components/         reusable UI, styled only through tokens
│       ├── theme/              tokens.ts (the design-token file), ThemeProvider
│       ├── i18n/               catalogues (en.ts defines the shape), language state
│       ├── features/           feature logic (auth, settings, config)
│       ├── data/               TanStack Query hooks per table
│       └── lib/                env, Supabase client, secure storage, query client
└── docs/
```

Rule: route files stay thin; logic lives in `features/`, data access in `data/`, and nothing in
`components/` knows about Supabase or i18n (components receive translated strings and Rappen).

## How the pieces talk

```
Screen (src/app) ──uses──▶ feature API (features/auth/authApi) ──▶ Supabase Auth (PKCE)
      │                                                         └─▶ RPC delete_my_account
      └──uses──▶ data hooks (src/data/*) ──TanStack Query──▶ PostgREST ──RLS──▶ Postgres
AuthProvider ◀── supabase-js auth events (SIGNED_IN, SIGNED_OUT, PASSWORD_RECOVERY)
Root layout ── guards (Stack.Protected) ──▶ (auth) | (tabs) | reset-password | auth/callback
```

- **Auth state drives navigation.** The root layout waits for the stored session, then mounts the
  navigator with protected groups: signed out → `(auth)`, signed in → `(tabs)`, signed in through
  a reset link → `reset-password` only. `auth/callback` (email links, OAuth) is reachable in every
  state. Mounting after the session is known keeps cold-start deep links intact (needed for push
  notifications in M4).
- **Session storage.** The supabase-js session is kept in the keychain/keystore
  (`expo-secure-store`, `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`), split into chunks because sessions
  exceed SecureStore's 2 KB guidance. The web build (tests only) uses localStorage.
- **Configuration.** `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_KEY` (publishable or
  legacy anon key). `readEnv()` validates them at start; a missing, insecure (http outside local
  development) or secret key shows a configuration screen instead of starting.
- **Language.** UI language = the user's pick on this device, else the phone language (German if
  unsupported). The account's `profiles.language` (used later for push texts and the assistant)
  mirrors it; a new device follows the account (see `ProfileLanguageSync`).

## Budget engine and the month (Milestone 2)

| Concern                                                  | Where                                                                                                                                                       | Why there                                                                                                                    |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Period boundaries (payday to payday, short months)       | `engine/period.ts` and `public.period_containing`                                                                                                           | The app shows the period before saving; the database creates periods. Parity-tested for every payday × every date 2024–2027. |
| Spending totals per category (rules in DATA_MODEL.md)    | `public.get_overview` (SQL, under RLS)                                                                                                                      | One query over all transactions; the same rules close a period on payday.                                                    |
| Balance, daily allowance, days to payday, statuses, pace | `engine/overview.ts`, `engine/pace.ts`                                                                                                                      | Derived from the totals; pure functions with 100 % coverage.                                                                 |
| Budget suggestion, allocation check                      | `engine/suggest.ts`, `engine/plan.ts`                                                                                                                       | Onboarding works on the device before anything is saved.                                                                     |
| Leftover on payday (rollover / savings / reset)          | `engine/leftover.ts` and `private.settle_leftover`                                                                                                          | Parity-tested.                                                                                                               |
| Monthly reset                                            | `private.roll_periods`, run hourly (`roll_due_periods`, pg_cron) and on demand when the app loads the month (`ensure_current_period` inside `get_overview`) | Works when the app is closed; never shows a stale month when it is open.                                                     |

Navigation: signed in but not onboarded → `/onboarding/*` (questionnaire, answers kept on the
device per account until saved); onboarded → tabs. `complete_onboarding` stores profile, fixed
costs, categories, the first period and its budgets in one transaction.

## Transactions (Milestone 3)

```
statement file ──▶ readStatement (on the phone, @budget/core) ─┐
quick add (+, batzen://add) ───────────────────────────────────┤── toIngestRow ──▶ add_transactions
                                                               │      (dry run for the preview)
bank, notifications, email, receipts (M6, server) ─────────────┘
add_transactions: validate → already imported? → same purchase from another source (merge,
  keep the richest data) → look-alike? → fixed-cost payment? → rules → known merchants → MCC
  → (AI guess, M5) → store; anything unsure is "to review"
```

| Concern                                              | Where                                                                                     | Why there                                                                |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Reading statement files (CSV layouts, camt.053)      | `packages/core/src/import`                                                                | The file never leaves the phone (D-032); pure functions, 100 % coverage  |
| Deduplication, fixed-cost detection, categorization  | `public.add_transactions` + schema `internal` (merchant keys, known merchants, MCC table) | One pipeline for every source (D-028), under row-level security (D-038)  |
| Questions ("CHF 84 at Manor: what was it?")          | `needs_review` in the database; Home banner, Transactions tab, `/review`                  | One definition for Home, the list and (M4) push questions                |
| Rules ("Always do this for Manor?")                  | `update_transaction` with `rule`; the database proposes the pattern (`suggested_rule`)    | The rule is applied to earlier purchases in the same transaction (D-042) |
| Listing, search, filters, splits, edits, delete/undo | `list_transactions`, `get_transaction`, `update_transaction`, `set_transaction_splits`    | Filters by split parts and by local day need the database                |
| Undo an import                                       | `remove_import`                                                                           | Deletes the file's rows and restores what merges changed (D-041)         |
| Export                                               | `export_my_data` → `features/export` (CSV via `toCsv`, JSON) → share sheet or download    | One server call; files built on the phone (D-034)                        |

App routes added in M3 (all behind the signed-in-and-onboarded guard): `/add` (modal),
`/transaction/[id]`, `/review`, `/import`, `/data-sources`, `/rules`, `/export`, and the onboarding
step `/onboarding/sources`. Data hooks: `src/data/transactions.ts`, `categories.ts`,
`fixedCosts.ts`, `rules.ts`, `imports.ts`, `exportData.ts`.

## Shared contracts

| Contract                     | Source of truth                                           | Guarded by                                        |
| ---------------------------- | --------------------------------------------------------- | ------------------------------------------------- |
| Data model                   | `supabase/migrations/*.sql`                               | `supabase/tests/*`, generated `database.types.ts` |
| Vocabularies (categories, …) | `packages/core/src/constants.ts` + SQL CHECKs             | `supabase/tests/contracts.test.ts`                |
| Money                        | `packages/core/src/money.ts`                              | `money.test.ts`; DB `bigint` + bounds             |
| Design tokens                | `apps/mobile/src/theme/tokens.ts`                         | `noColorLiterals.test.ts`, `contrast.test.ts`     |
| Transaction source plug-ins  | `packages/core/src/sources.ts`                            | `sources.test.ts`                                 |
| Transaction pipeline rows    | `packages/core/src/ingest.ts` + docs/API.md               | `pipeline.test.ts` (database)                     |
| Merchant keys                | `packages/core/src/merchant.ts` + `internal.merchant_key` | `categorization.test.ts` (parity)                 |
| Translation keys             | `apps/mobile/src/i18n/en.ts`                              | type checker + `catalogue.test.ts`                |

Changing one: open the change with the architect, update both sides (e.g. constant and CHECK),
regenerate types (`npm run gen:types --workspace @budget/db`),
and tell the agents whose code uses it.

## Transaction source plug-ins (spec section 6)

Every source is an adapter implementing `TransactionSourceAdapter<Input>` from
`packages/core/src/sources.ts`: it reads its own input (bank API page, notification text, Shortcut
payload, email, OCR result, CSV/camt.053 file, manual form) and returns `SourceTransaction`s:

| Field                                 | Meaning                                                          |
| ------------------------------------- | ---------------------------------------------------------------- |
| `amountRappen`                        | signed CHF amount as booked (negative = money out)               |
| `currency`                            | always `CHF`; `original` carries a foreign amount for display    |
| `bookedAt`                            | ISO 8601 with offset                                             |
| `merchant`, `rawText`, `mcc`, `items` | what the source knows                                            |
| `source`, `sourceId`                  | which adapter, and its own id (re-imports are ignored by the DB) |

`validateSourceTransaction` checks every adapter's output at the boundary. Statement files may
give a local day (`bookedOn`, optional `bookedTime`) instead of an instant; the database places it
in the person's time zone. After that the pipeline is shared (`add_transactions`, see above):
deduplicate, detect fixed-cost payments, categorize, store (`transactions`), queue the cash-feel
moment (`acknowledged_at is null`, M4), evaluate alerts (M4). Adapters never write to the database
directly.

## Money

All amounts are integer Rappen (`number`, safe integers bounded by ±CHF 100 million; `bigint` in
Postgres with the same CHECK bounds). No floats anywhere in money math: parsing works on digits,
formatting on integer division, and thresholds compare `spent * 100` against `budget * 80`.
Display: `CHF 1’240.50` in German (Swiss apostrophe), `CHF 1,240.50` in English.
