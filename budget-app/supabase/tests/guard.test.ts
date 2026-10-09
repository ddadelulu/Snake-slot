/**
 * Guard M4-06: clients write transactions, transaction_splits and data_sources only through the
 * RPCs. Direct inserts, updates and deletes by role authenticated fail with 42501; the RPCs, owner
 * rights (account deletion, foreign-key actions) and the service role still work, and the RPCs'
 * flag does not outlive their call.
 */
import { describe, expect, it } from 'vitest';
import {
  type Db,
  SQLSTATE,
  asPostgres,
  asUser,
  attempt,
  countRows,
  createUser,
  expectSqlError,
  make,
  queryOne,
  withRollback,
} from './db';
import { budgetUser } from './m4';

async function expectGuarded(db: Db, sql: string, params: unknown[] = []): Promise<void> {
  const error = await expectSqlError(db, SQLSTATE.insufficientPrivilege, sql, params);
  expect(error.message).toBe('direct_write_not_allowed');
}

describe('direct writes by clients (42501 direct_write_not_allowed)', () => {
  it.each([
    [
      'insert into transactions',
      `insert into public.transactions (user_id, amount_rappen, booked_at, source)
       values ($1, -100, now(), 'manual')`,
    ],
    ['update transactions', `update public.transactions set note = 'x' where user_id = $1`],
    ['delete from transactions', `delete from public.transactions where user_id = $1`],
    [
      'insert into transaction_splits',
      `insert into public.transaction_splits (user_id, transaction_id, amount_rappen)
       select $1, id, -50 from public.transactions where user_id = $1`,
    ],
    [
      'update transaction_splits',
      `update public.transaction_splits set note = 'x' where user_id = $1`,
    ],
    ['delete from transaction_splits', `delete from public.transaction_splits where user_id = $1`],
    [
      'insert into data_sources',
      `insert into public.data_sources (user_id, kind, consent_version) values ($1, 'email', 'v1')`,
    ],
    ['update data_sources', `update public.data_sources set display_name = 'x' where user_id = $1`],
    ['delete from data_sources', `delete from public.data_sources where user_id = $1`],
  ])('%s', async (_name, sql) => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const tx = await make.transaction(db, a, { amount_rappen: -100 });
      await make.split(db, a, tx, -50);
      await make.split(db, a, tx, -50);
      await make.dataSource(db, a);
      await asUser(db, a);
      await expectGuarded(db, sql, [a]);
    });
  });

  it('the acknowledged flag cannot be set directly either (only acknowledge_transactions)', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const tx = await make.transaction(db, a);
      await asUser(db, a);
      await expectGuarded(
        db,
        'update public.transactions set acknowledged_at = now() where id = $1',
        [tx],
      );
    });
  });
});

describe('what still writes', () => {
  it('the RPCs, and the flag is back off after each call (also after a failed one)', async () => {
    await withRollback(async (db) => {
      const f = await budgetUser(db);
      await asUser(db, f.user);
      const added = await queryOne<{ id: string }>(
        db,
        `select (public.add_transactions($1::jsonb) -> 'results' -> 0 ->> 'transaction_id') as id`,
        [
          JSON.stringify({
            rows: [
              { source: 'manual', booked_at: new Date().toISOString(), amount_rappen: -1_250 },
            ],
          }),
        ],
      );
      await db.query(`select public.update_transaction($1, '{"note": "Znüni"}')`, [added.id]);
      await db.query(`select public.acknowledge_transactions(array[$1::uuid])`, [added.id]);
      await expectGuarded(db, `update public.transactions set note = 'x' where id = $1`, [
        added.id,
      ]);

      const failed = await attempt(
        db,
        `select public.update_transaction($1, '{"amount_rappen": 0}')`,
        [added.id],
      );
      expect(failed.ok).toBe(false);
      await expectGuarded(db, `delete from public.transactions where id = $1`, [added.id]);
      const flag = await queryOne<{ flag: string | null }>(
        db,
        `select nullif(current_setting('batzen.via_rpc', true), '') as flag`,
      );
      expect(flag.flag).toBeNull();
    });
  });

  it('deleting a category or the account (foreign-key actions as the owner) still works', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const category = await make.category(db, a);
      const source = await make.dataSource(db, a);
      const tx = await make.transaction(db, a, { category_id: category, data_source_id: source });
      await asUser(db, a);
      await db.query('delete from public.categories where id = $1', [category]);
      await asPostgres(db);
      const row = await queryOne<{ category_id: string | null }>(
        db,
        'select category_id from public.transactions where id = $1',
        [tx],
      );
      expect(row.category_id).toBeNull();
      await asUser(db, a);
      await db.query('select public.delete_my_account()');
      await asPostgres(db);
      expect(await countRows(db, 'select 1 from public.transactions where user_id = $1', [a])).toBe(
        0,
      );
      expect(await countRows(db, 'select 1 from public.data_sources where user_id = $1', [a])).toBe(
        0,
      );
    });
  });

  it('the service role (backend) writes directly', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await db.query('set local role service_role');
      const source = await make.dataSource(db, a);
      const tx = await make.transaction(db, a, { data_source_id: source, amount_rappen: -100 });
      await make.split(db, a, tx, -60);
      await make.split(db, a, tx, -40);
      await db.query(`update public.transactions set note = 'Bank' where id = $1`, [tx]);
      await db.query('delete from public.transactions where id = $1', [tx]);
    });
  });

  it('every guarded table has the statement-level trigger', async () => {
    const rows = await withRollback((db) =>
      queryOne<{ tables: string[] }>(
        db,
        `select array_agg(tgrelid::regclass::text order by tgrelid::regclass::text) as tables
           from pg_trigger where tgname = 'guard_client_writes'`,
      ),
    );
    expect(rows.tables).toEqual(['data_sources', 'transaction_splits', 'transactions']);
  });
});
