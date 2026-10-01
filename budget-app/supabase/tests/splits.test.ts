/**
 * Split transactions (spec section 7). A split transaction has at least two parts, each with the
 * transaction's sign, adding up to exactly its amount, and no category of its own. The check is a
 * deferred constraint trigger that runs at COMMIT; tests never commit, so they run it with
 * `SET CONSTRAINTS ALL IMMEDIATE` (runDeferredChecks / expectDeferredError).
 */
import { describe, expect, it } from 'vitest';
import {
  type Db,
  SQLSTATE,
  asUser,
  countRows,
  createUser,
  expectDeferredError,
  make,
  queryRows,
  runDeferredChecks,
  withRollback,
} from './db';

/** A signed-in user with two categories, acting as that user. */
async function signedInUser(db: Db) {
  const user = await createUser(db);
  const groceries = await make.category(db, user, { name: null, default_key: 'groceries' });
  const household = await make.category(db, user, { name: 'Haushalt' });
  await asUser(db, user);
  return { user, groceries, household };
}

describe('transaction splits', () => {
  it('two parts adding up to the amount, without a transaction category, commit', async () => {
    await withRollback(async (db) => {
      const { user, groceries, household } = await signedInUser(db);
      const tx = await make.transaction(db, user, { amount_rappen: -10_000 });
      await make.split(db, user, tx, -6_000, { category_id: groceries });
      await make.split(db, user, tx, -4_000, { category_id: household });
      await runDeferredChecks(db);
    });
  });

  it('parts without a category of their own also commit', async () => {
    await withRollback(async (db) => {
      const { user } = await signedInUser(db);
      const tx = await make.transaction(db, user, { amount_rappen: -10_000 });
      await make.split(db, user, tx, -5_000);
      await make.split(db, user, tx, -5_000);
      await runDeferredChecks(db);
    });
  });

  it('a refund (positive amount) splits into positive parts', async () => {
    await withRollback(async (db) => {
      const { user, groceries, household } = await signedInUser(db);
      const tx = await make.transaction(db, user, { amount_rappen: 2_500 });
      await make.split(db, user, tx, 2_000, { category_id: groceries });
      await make.split(db, user, tx, 500, { category_id: household });
      await runDeferredChecks(db);
    });
  });

  it('is checked at commit, not per statement (a first part alone is accepted until then)', async () => {
    await withRollback(async (db) => {
      const { user } = await signedInUser(db);
      const tx = await make.transaction(db, user, { amount_rappen: -10_000 });
      await make.split(db, user, tx, -6_000);
      expect(
        await countRows(db, 'select 1 from public.transaction_splits where transaction_id = $1', [
          tx,
        ]),
      ).toBe(1);
      await make.split(db, user, tx, -4_000);
      await runDeferredChecks(db);
    });
  });

  it('both consistency triggers are deferrable and initially deferred', async () => {
    await withRollback(async (db) => {
      const triggers = await queryRows<{ name: string; deferrable: boolean; deferred: boolean }>(
        db,
        `select tgname as name, tgdeferrable as deferrable, tginitdeferred as deferred
           from pg_trigger
          where tgfoid = 'public.check_transaction_splits()'::regprocedure
          order by 1`,
      );
      expect(triggers).toEqual([
        { name: 'transaction_splits_consistent', deferrable: true, deferred: true },
        { name: 'transactions_splits_consistent', deferrable: true, deferred: true },
      ]);
    });
  });

  it('parts that do not add up to the amount are rejected (23514)', async () => {
    await withRollback(async (db) => {
      const { user } = await signedInUser(db);
      const tx = await make.transaction(db, user, { amount_rappen: -10_000 });
      await make.split(db, user, tx, -6_000);
      await make.split(db, user, tx, -3_999);
      await expectDeferredError(db, SQLSTATE.checkViolation);
    });
  });

  it('a single part is rejected (23514)', async () => {
    await withRollback(async (db) => {
      const { user } = await signedInUser(db);
      const tx = await make.transaction(db, user, { amount_rappen: -10_000 });
      await make.split(db, user, tx, -10_000);
      await expectDeferredError(db, SQLSTATE.checkViolation);
    });
  });

  it('a part with the opposite sign is rejected even if the sum matches (23514)', async () => {
    await withRollback(async (db) => {
      const { user } = await signedInUser(db);
      const tx = await make.transaction(db, user, { amount_rappen: -10_000 });
      await make.split(db, user, tx, -12_000);
      await make.split(db, user, tx, 2_000);
      await expectDeferredError(db, SQLSTATE.checkViolation);
    });
  });

  it('a split transaction that also has a category is rejected (23514)', async () => {
    await withRollback(async (db) => {
      const { user, groceries } = await signedInUser(db);
      const tx = await make.transaction(db, user, {
        amount_rappen: -10_000,
        category_id: groceries,
      });
      await make.split(db, user, tx, -6_000);
      await make.split(db, user, tx, -4_000);
      await expectDeferredError(db, SQLSTATE.checkViolation);
    });
  });

  it('giving an existing split transaction a category is rejected (23514)', async () => {
    await withRollback(async (db) => {
      const { user, groceries } = await signedInUser(db);
      const tx = await make.transaction(db, user, { amount_rappen: -10_000 });
      await make.split(db, user, tx, -6_000);
      await make.split(db, user, tx, -4_000);
      await runDeferredChecks(db);
      await db.query('update public.transactions set category_id = $1 where id = $2', [
        groceries,
        tx,
      ]);
      await expectDeferredError(db, SQLSTATE.checkViolation);
    });
  });

  it('changing a split transaction’s amount without fixing its parts is rejected (23514)', async () => {
    await withRollback(async (db) => {
      const { user } = await signedInUser(db);
      const tx = await make.transaction(db, user, { amount_rappen: -10_000 });
      await make.split(db, user, tx, -6_000);
      await make.split(db, user, tx, -4_000);
      await runDeferredChecks(db);
      await db.query('update public.transactions set amount_rappen = -12000 where id = $1', [tx]);
      await expectDeferredError(db, SQLSTATE.checkViolation);
    });
  });

  it('changing the amount and the parts in the same transaction commits', async () => {
    await withRollback(async (db) => {
      const { user } = await signedInUser(db);
      const tx = await make.transaction(db, user, { amount_rappen: -10_000 });
      const first = await make.split(db, user, tx, -6_000);
      await make.split(db, user, tx, -4_000);
      await runDeferredChecks(db);
      await db.query('update public.transactions set amount_rappen = -12000 where id = $1', [tx]);
      await db.query('update public.transaction_splits set amount_rappen = -8000 where id = $1', [
        first,
      ]);
      await runDeferredChecks(db);
    });
  });

  it('changing one part without the others is rejected (23514)', async () => {
    await withRollback(async (db) => {
      const { user } = await signedInUser(db);
      const tx = await make.transaction(db, user, { amount_rappen: -10_000 });
      const first = await make.split(db, user, tx, -6_000);
      await make.split(db, user, tx, -4_000);
      await runDeferredChecks(db);
      await db.query('update public.transaction_splits set amount_rappen = -5000 where id = $1', [
        first,
      ]);
      await expectDeferredError(db, SQLSTATE.checkViolation);
    });
  });

  it('deleting one of two parts is rejected (23514)', async () => {
    await withRollback(async (db) => {
      const { user } = await signedInUser(db);
      const tx = await make.transaction(db, user, { amount_rappen: -10_000 });
      const first = await make.split(db, user, tx, -6_000);
      await make.split(db, user, tx, -4_000);
      await runDeferredChecks(db);
      await db.query('delete from public.transaction_splits where id = $1', [first]);
      await expectDeferredError(db, SQLSTATE.checkViolation);
    });
  });

  it('deleting all parts (un-splitting) commits', async () => {
    await withRollback(async (db) => {
      const { user, groceries } = await signedInUser(db);
      const tx = await make.transaction(db, user, { amount_rappen: -10_000 });
      await make.split(db, user, tx, -6_000);
      await make.split(db, user, tx, -4_000);
      await runDeferredChecks(db);
      await db.query('delete from public.transaction_splits where transaction_id = $1', [tx]);
      await db.query('update public.transactions set category_id = $1 where id = $2', [
        groceries,
        tx,
      ]);
      await runDeferredChecks(db);
    });
  });

  it('deleting the transaction deletes its parts', async () => {
    await withRollback(async (db) => {
      const { user } = await signedInUser(db);
      const tx = await make.transaction(db, user, { amount_rappen: -10_000 });
      await make.split(db, user, tx, -6_000);
      await make.split(db, user, tx, -4_000);
      await runDeferredChecks(db);
      await db.query('delete from public.transactions where id = $1', [tx]);
      expect(
        await countRows(db, 'select 1 from public.transaction_splits where transaction_id = $1', [
          tx,
        ]),
      ).toBe(0);
      await runDeferredChecks(db);
    });
  });

  it('deleting a part’s category keeps the part, without a category', async () => {
    await withRollback(async (db) => {
      const { user, groceries, household } = await signedInUser(db);
      const tx = await make.transaction(db, user, { amount_rappen: -10_000 });
      const part = await make.split(db, user, tx, -6_000, { category_id: groceries });
      await make.split(db, user, tx, -4_000, { category_id: household });
      await db.query('delete from public.categories where id = $1', [groceries]);
      expect(
        await countRows(
          db,
          'select 1 from public.transaction_splits where id = $1 and category_id is null and user_id = $2',
          [part, user],
        ),
      ).toBe(1);
      await runDeferredChecks(db);
    });
  });

  // Moving parts to another transaction must re-check the transaction they left as well.
  it('moving parts to another transaction re-checks the transaction they came from (23514)', async () => {
    await withRollback(async (db) => {
      const { user } = await signedInUser(db);
      const from = await make.transaction(db, user, { amount_rappen: -10_000 });
      const to = await make.transaction(db, user, { amount_rappen: -5_000 });
      await make.split(db, user, from, -5_000);
      const second = await make.split(db, user, from, -3_000);
      const third = await make.split(db, user, from, -2_000);
      await runDeferredChecks(db);
      // `to` ends up with two parts adding up to -5000 (valid); `from` keeps a single -5000 part
      // for a -10000 transaction (invalid).
      await db.query(
        'update public.transaction_splits set transaction_id = $1 where id in ($2, $3)',
        [to, second, third],
      );
      await expectDeferredError(db, SQLSTATE.checkViolation);
    });
  });
});
