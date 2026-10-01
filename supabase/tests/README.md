# Database tests

Tests for the Supabase schema in `supabase/migrations`: the contracts shared with `@budget/core`,
row-level security, privileges, constraints, triggers and account deletion. They run against a
real Postgres with the Supabase roles (`anon`, `authenticated`, `service_role`) and the `auth`
schema, so what passes here is what the app gets in production.

## Running locally

```sh
supabase start          # local Supabase; applies the migrations
cd budget-app
npm run test:db         # = vitest run in the @budget/db workspace
```

The suite connects to `DATABASE_URL`, which defaults to the local Supabase database
`postgresql://postgres:postgres@127.0.0.1:54322/postgres`. Point it elsewhere to test another
database (never production):

```sh
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run test:db
npm run typecheck --workspace @budget/db
```

## How the tests work

- Each test runs in `withRollback` (`db.ts`): its own connection, `BEGIN … ROLLBACK`. Nothing a
  test writes survives it, so tests are independent and the database stays empty.
- Tests switch roles inside the transaction the way PostgREST does: `asUser(db, id)` sets role
  `authenticated` plus the JWT claims (`request.jwt.claim.sub` and `request.jwt.claims`),
  `asAnon(db)` sets role `anon`, `asPostgres(db)` goes back to the owner role to set up fixtures.
- `expectSqlError(db, code, sql)` runs a statement in a SAVEPOINT and checks its SQLSTATE
  (`42501` privilege/RLS, `23503` foreign key, `23505` unique, `23514` check, `23P01` exclusion),
  so an expected failure does not abort the rest of the test.
- The split checks are deferred constraint triggers that fire at `COMMIT`, which a rolled-back test
  never reaches. `runDeferredChecks` / `expectDeferredError` run them with
  `SET CONSTRAINTS ALL IMMEDIATE`.
- `make.*` builds rows with sensible defaults; `seedRow` / `NEW_ROW` give one row per user table.
- Files run one after another (`fileParallelism: false`) because they share one database.

## What each file checks

| File                  | Checks                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contracts.test.ts`   | Every vocabulary CHECK equals its list in `@budget/core` (`LANGUAGES`, `ALERT_TYPES`, …), compared as sets; `profiles.language` defaults to `DEFAULT_LANGUAGE`; every `*_rappen` column is `bigint` and bounded by `MAX_ABS_RAPPEN`.                                                                                                                                                                |
| `rls.test.ts`         | RLS is enabled on every public table and on `private.data_source_credentials`; policies target `authenticated` only. For every user table: the owner can read/insert/update/delete (as far as grants allow), another user sees and changes nothing and cannot insert rows for the owner, anon cannot read.                                                                                          |
| `privileges.test.ts`  | `anon` has no privilege on any public table or function (catalog-wide, so new tables are covered); `authenticated` has exactly the migration's grants (alerts: only `read_at` and `dismissed_at` may change, never deleted); no access to schema `private`. Client write restrictions: no profile/subscription/alert inserts, no assistant/tool messages, append-only consent log with server time. |
| `triggers.test.ts`    | Sign-up creates the profile (language from metadata, else `de`), notification settings and subscription (`none`) with their defaults; `updated_at` is set by the database on every update.                                                                                                                                                                                                          |
| `constraints.test.ts` | Money bounds (±10'000'000'000), no zero transactions, CHF only, original amount/currency pairs, `mcc`, `payday`, `weekly_work_minutes`, payment methods, category naming and uniqueness, MCC rule shape, budget periods (no overlap, order, all-or-nothing closing), data-source revocation.                                                                                                        |
| `integrity.test.ts`   | Composite foreign keys make cross-tenant references impossible (for clients and for postgres); deduplication of imported transactions and alerts; deleting a category, data source, fixed cost, transaction, period or conversation clears or cascades as designed.                                                                                                                                 |
| `splits.test.ts`      | Split transactions: at least two parts, same sign, exact sum, no own category; checked at commit; amount changes, part edits, un-splitting, deletion, and moving parts between transactions.                                                                                                                                                                                                        |
| `account.test.ts`     | `delete_my_account()` deletes the user and every row they owned in every table (found from the catalog), leaves other users alone, passes the commit-time checks, and refuses anon and signed-out callers.                                                                                                                                                                                          |

Tables are discovered from the catalog where possible: a new table without RLS, with grants to
`anon`, without an entry in the privilege/RLS matrices, or not reachable by account deletion makes
the suite fail until it is covered.
