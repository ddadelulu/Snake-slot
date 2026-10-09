/**
 * Account deletion (spec section 15): delete_my_account() removes the signed-in user and, through
 * ON DELETE CASCADE, every row they owned in every table, and nothing else.
 */
import { describe, expect, it } from 'vitest';
import {
  type Db,
  SQLSTATE,
  asAnon,
  asAuthenticatedWithoutUser,
  asPostgres,
  asUser,
  countRows,
  createUser,
  expectSqlError,
  make,
  queryRows,
  quoteTable,
  runDeferredChecks,
  withRollback,
} from './db';

/** Tables that hold no per-user data (none yet). Every other table must have an owner column. */
const SHARED_TABLES: readonly string[] = [];

interface OwnedTable {
  table: string;
  owner: string | null;
}

/**
 * Every table in schemas public and private with the column that names its owner: user_id, or
 * the single-column foreign key to auth.users (profiles.id).
 */
async function ownedTables(db: Db): Promise<OwnedTable[]> {
  return queryRows<OwnedTable>(
    db,
    `select c.oid::regclass::text as table,
            coalesce(
              (select a.attname::text from pg_attribute a
                where a.attrelid = c.oid and a.attname = 'user_id' and not a.attisdropped),
              (select a.attname::text from pg_constraint k
                 join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
                where k.conrelid = c.oid and k.contype = 'f'
                  and k.confrelid = 'auth.users'::regclass and cardinality(k.conkey) = 1
                limit 1)
            ) as owner
       from pg_class c
      where c.relnamespace in ('public'::regnamespace, 'private'::regnamespace)
        and c.relkind in ('r', 'p')
      order by 1`,
  );
}

/** Rows `userId` owns, table by table (as postgres). */
async function rowCounts(db: Db, userId: string): Promise<Record<string, number>> {
  await asPostgres(db);
  const counts: Record<string, number> = {};
  for (const { table, owner } of await ownedTables(db)) {
    if (owner === null) continue;
    counts[table] = await countRows(
      db,
      `select 1 from ${quoteTable(table)} where "${owner}" = $1`,
      [userId],
    );
  }
  return counts;
}

/** Gives `userId` at least one row in every table (as postgres). */
async function seedEverything(db: Db, userId: string): Promise<void> {
  await asPostgres(db);
  const category = await make.category(db, userId);
  const period = await make.period(db, userId);
  await make.budget(db, userId, period, category);
  const source = await make.dataSource(db, userId);
  await make.credential(db, userId, source);
  const fixedCost = await make.fixedCost(db, userId);
  const tx = await make.transaction(db, userId, {
    amount_rappen: -1_250,
    source: 'bank',
    external_id: 'ubs-1',
    data_source_id: source,
    fixed_cost_id: fixedCost,
  });
  await make.split(db, userId, tx, -1_000, { category_id: category });
  await make.split(db, userId, tx, -250);
  await make.transaction(db, userId, { category_id: category, merged_into_id: tx });
  await make.rule(db, userId, category);
  await make.alert(db, userId, { category_id: category, transaction_id: tx, period_id: period });
  const conversation = await make.conversation(db, userId);
  await make.message(db, userId, conversation);
  await make.message(db, userId, conversation, {
    role: 'assistant',
    content: 'Dir bleiben CHF 412.',
  });
  await make.consentEvent(db, userId);
  await make.pushToken(db, userId);
}

describe('delete_my_account()', () => {
  it('every table in public and private has an owner column (so deletion can reach it)', async () => {
    const tables = await withRollback(ownedTables);
    const unowned = tables.filter((t) => t.owner === null && !SHARED_TABLES.includes(t.table));
    expect(unowned).toEqual([]);
  });

  it('the test fixture gives a user rows in every table', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await seedEverything(db, a);
      const empty = Object.entries(await rowCounts(db, a)).filter(([, n]) => n === 0);
      expect(empty).toEqual([]);
    });
  });

  it('deletes the signed-in user from auth.users', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await asUser(db, a);
      await db.query('select public.delete_my_account()');
      await asPostgres(db);
      expect(await countRows(db, 'select 1 from auth.users where id = $1', [a])).toBe(0);
    });
  });

  it('deletes every row the user owned, in every table', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await seedEverything(db, a);
      await asUser(db, a);
      await db.query('select public.delete_my_account()');
      const remaining = Object.entries(await rowCounts(db, a)).filter(([, n]) => n > 0);
      expect(remaining).toEqual([]);
    });
  });

  it('leaves other users’ data untouched', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const b = await createUser(db);
      await seedEverything(db, a);
      await seedEverything(db, b);
      const before = await rowCounts(db, b);
      await asUser(db, a);
      await db.query('select public.delete_my_account()');
      expect(await rowCounts(db, b)).toEqual(before);
      expect(await countRows(db, 'select 1 from auth.users where id = $1', [b])).toBe(1);
    });
  });

  it('deletes everything onboarding and the payday reset created, and nothing of others', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const b = await createUser(db);
      await seedEverything(db, b);
      const othersBefore = await rowCounts(db, b);

      await asUser(db, a);
      await db.query('select public.complete_onboarding($1::jsonb)', [
        JSON.stringify({
          profile: { net_income_rappen: 520_000, payday: 25 },
          fixed_costs: [{ kind: 'rent', label: null, amount_rappen: 185_000 }],
          categories: [{ default_key: 'groceries', name: null, budget_rappen: 40_000 }],
        }),
      ]);
      // Move the first period one month back, so the reset closes it and opens the next one.
      await asPostgres(db);
      await db.query(
        `update public.budget_periods p
            set starts_on = previous.starts_on, ends_on = previous.ends_on
           from public.period_containing(
                  (select starts_on - 1 from public.budget_periods where user_id = $1), 25
                ) as previous
          where p.user_id = $1`,
        [a],
      );
      await asUser(db, a);
      await db.query('select public.ensure_current_period()');
      const created = await rowCounts(db, a);
      expect([created.budget_periods, created.budgets]).toEqual([2, 2]);

      await asUser(db, a);
      await db.query('select public.delete_my_account()');
      const remaining = Object.entries(await rowCounts(db, a)).filter(([, n]) => n > 0);
      expect(remaining).toEqual([]);
      await db.query('select public.roll_due_periods()');
      expect(await rowCounts(db, b)).toEqual(othersBefore);
      await runDeferredChecks(db);
    });
  });

  it('passes the commit-time checks (split transactions included)', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await seedEverything(db, a);
      await runDeferredChecks(db);
      await asUser(db, a);
      await db.query('select public.delete_my_account()');
      await runDeferredChecks(db);
    });
  });

  it('raises 42501 without a signed-in user', async () => {
    await withRollback(async (db) => {
      await createUser(db);
      await asAuthenticatedWithoutUser(db);
      const error = await expectSqlError(
        db,
        SQLSTATE.insufficientPrivilege,
        'select public.delete_my_account()',
      );
      expect(error.message).toBe('not signed in');
    });
  });

  it('cannot be executed by anon (42501) and deletes nothing', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await asAnon(db);
      const error = await expectSqlError(
        db,
        SQLSTATE.insufficientPrivilege,
        'select public.delete_my_account()',
      );
      expect(error.message).toMatch(/permission denied for function delete_my_account/);
      await asPostgres(db);
      expect(await countRows(db, 'select 1 from auth.users where id = $1', [a])).toBe(1);
    });
  });
});
