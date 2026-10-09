# Test plan

Owner: **Daniel Craig** (QA). Nothing ships without QA sign-off; every milestone adds its tests
and the edge cases below before sign-off.

## Layers

| Layer                                                    | Tool                                                               | Where                             | Runs in CI job |
| -------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------- | -------------- |
| Money & contracts                                        | Vitest                                                             | `packages/core/src/*.test.ts`     | checks         |
| Components, theme, i18n, auth logic, routes              | Jest (jest-expo) + Testing Library + expo-router `renderRouter`    | `apps/mobile/src/**/*.test.ts(x)` | checks         |
| Database: schema, RLS, privileges, constraints, deletion | Vitest + `pg` against Supabase Postgres                            | `supabase/tests/`                 | database       |
| Generated types match the schema                         | `supabase gen types` + diff                                        | CI step                           | database       |
| End-to-end                                               | Playwright against the web build + local Supabase (auth, REST, DB) | `apps/mobile/e2e/`                | e2e            |
| Native end-to-end (iOS, Android)                         | Maestro on development builds                                      | added in M7 with release builds   | –              |

## Running

```sh
cd budget-app
npm test                 # core + mobile unit/component/route tests
npm run test:db          # needs `supabase start` (or DATABASE_URL to a disposable database)
```

### End-to-end tests

```sh
supabase start
eval "$(supabase status -o env)"
export EXPO_PUBLIC_SUPABASE_URL="$API_URL" EXPO_PUBLIC_SUPABASE_KEY="${PUBLISHABLE_KEY:-$ANON_KEY}"
npm run build:web --workspace @budget/mobile
cd apps/mobile && npx playwright install chromium && npm run test:e2e
```

Every E2E test creates its own uniquely named account, so runs never depend on each other or on
leftover data.

## Milestone 1 results

Run on 2026-10-01 against Supabase Postgres 17 (`supabase/postgres:17.11.0.002`), Supabase Auth
v2.197.0 and PostgREST 14.1:

| Suite                                         | Result                      |
| --------------------------------------------- | --------------------------- |
| Core (`@budget/core`)                         | 3 files, 91 tests passed    |
| App (`@budget/mobile`, Jest)                  | 33 suites, 591 tests passed |
| Database (`@budget/db`)                       | 8 files, 357 tests passed   |
| End-to-end (Playwright, Pixel 7 web viewport) | 12 tests passed             |
| Format, lint (0 warnings), typecheck          | clean                       |

What the end-to-end suite proves: sign-up lands on Home, every tab opens, sign-out and sign-in,
session survives a reload, a deep link survives a cold start, account deletion removes the account
for good (old password fails), cancelling deletion changes nothing, field validation, wrong
password, duplicate sign-up, signed-out visitors cannot open tabs, switching to German switches the
app and a second device follows the account language, dark mode applies and persists, a German
phone starts in German.

Bugs found and fixed during M1 QA:

1. Moving a split part to another transaction skipped the check on the transaction it left
   (database test → migration fixed).
2. Clients could backdate consent records (database test → server-assigned `created_at`).
3. Deleting an alert would have let the same alert fire again → alerts are dismissed, never deleted.
4. A deep link opened during a cold start was replaced by the sign-in screen while the session
   loaded (route test → navigator mounts once the auth state is known).
5. A second device's default language overwrote the language chosen on the first device (E2E →
   sync rule now respects an account that was ever changed).

## Milestone 2 results

Run on 2026-10-02 against the same local stack:

| Suite                                | Result                                                                                              |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Core (`@budget/core`)                | 14 files, 229 tests; coverage 100 % statements, branches, functions, lines (enforced by `npm test`) |
| App (`@budget/mobile`, Jest)         | 44 suites, 706 tests                                                                                |
| Database (`@budget/db`)              | 12 files, 510 tests (incl. engine ↔ SQL parity for every payday × every date 2024–2027)             |
| End-to-end (Playwright)              | 15 tests                                                                                            |
| Format, lint (0 warnings), typecheck | clean                                                                                               |

New end-to-end proof: sign-up → all nine onboarding screens → Home shows CHF 3’429.50 left
(6’200 − 2’270.50 fixed − 500 saving) in well under five minutes; then a purchase, a refund, an
uncategorized purchase, the rent payment and the salary are booked through the API and Home shows
exactly 3’350.50 left, with the groceries budget down by 64.00 and rent and salary changing nothing.
Also: answers survive closing the app; over-commitment is flagged.

Bugs found and fixed during M2 QA: moving budget inside a closed period (now refused); the total status not turning red with a
negative balance; a duplicate test id on the pain-level step; `settleLeftover` returning −0.

## Milestone 3 results

Run on 2026-10-09 against the same local stack (clean database from all migrations):

| Suite                                | Result                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------ |
| Core (`@budget/core`)                | 26 files, 572 tests; coverage 100 % (import and export modules included) |
| App (`@budget/mobile`, Jest)         | 83 suites, 1016 tests                                                    |
| Database (`@budget/db`)              | 15 files, 999 tests                                                      |
| End-to-end (Playwright)              | 20 tests                                                                 |
| Format, lint (0 warnings), typecheck | clean; generated types match the schema                                  |

New end-to-end proof: a cash purchase added in under five seconds (amount, category, Save) with
delete and undo; a PostFinance CSV (Windows-1252) imported, categorized (Coop → Groceries by the
merchant list), re-imported without duplicates and undone; a camt.053 line merged with the same
purchase typed in by hand (counted once, statement text added); the "what was it?" question with
"Always do this for Manor?" re-sorting the second Manor purchase; CSV and JSON export downloaded
and checked; onboarding step 9 opening the import after setup.

QA (Daniel Craig) reviewed the pipeline and parsers adversarially: 3 high, 7 medium and 15 low
findings, every one turned into a permanent test. Fixed: salaries and transfers counted as
refunds (D-039); the same statement as CSV and camt.053 double-counting (D-043); typed-in
purchases without a merchant or with a split counting twice (D-040); weekend bookings, umlaut
spellings and generic first words in deduplication (D-040); known-merchant over-matching; several
payments linked to one fixed cost; learned merchant hints that failed the next month; over-broad
rule suggestions (D-042); debit/credit columns; balance lines; US dates; encodings; camt edge
cases; accent-insensitive search. Accepted: removing an older of two overlapping imports takes
the shared rows with it (re-import the other file, IMPORT_GUIDE.md); a typed rule pattern is used
as typed.

## Edge cases owned by later milestones

These are in the plan now so each milestone's sign-off checks them:

| Edge case                                                    | Milestone | Covered by                          |
| ------------------------------------------------------------ | --------- | ----------------------------------- |
| Payday on the 29th–31st in short months; payday on a weekend | M2        | engine unit tests                   |
| Month change while the app is open; time zone of the period  | M2        | engine + E2E                        |
| Refund in a later period than the purchase                   | M2/M3     | engine unit tests                   |
| Overspending a category, covering it from another            | M2        | engine + E2E                        |
| Foreign currency purchase (CHF booked amount vs. original)   | M3/M6     | import + adapter tests              |
| Split payments across categories                             | M3        | DB (done) + UI tests                |
| Same purchase from bank, notification and email (dedupe)     | M3/M6     | dedupe tests                        |
| Re-import of the same statement                              | M3        | DB unique key (done) + import tests |
| Several transactions arriving at once (queued cash moments)  | M4        | component + E2E                     |
| Alert thresholds crossed twice, quiet hours, daily cap       | M4        | alert engine tests                  |
| Expired subscription: read-only mode                         | M7        | E2E                                 |

## QA sign-off, Milestone 3

Signed off by Daniel Craig on 2026-10-09: all suites green on a clean database, every finding of
the M3 review fixed or accepted above.

## QA sign-off, Milestone 2

Signed off by Daniel Craig on 2026-10-02: all suites green, the bugs above fixed and covered.

## QA sign-off, Milestone 1

Signed off by Daniel Craig on 2026-10-01: all suites above green, the five bugs found are fixed
and covered by tests, no open defects.
