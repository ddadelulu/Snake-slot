/**
 * Row-level security: every table has RLS, and for every user table a signed-in user sees and
 * writes only their own rows, while anonymous clients see nothing at all.
 */
import { describe, expect, it } from 'vitest';
import {
  type Db,
  SQLSTATE,
  affectedRows,
  asAnon,
  asPostgres,
  asUser,
  countRows,
  createUser,
  expectSqlError,
  insertRow,
  newRowValues,
  publicTables,
  queryOne,
  queryRows,
  seedRow,
  withRollback,
} from './db';

describe('RLS is enabled everywhere', () => {
  it('every table in schema public has row-level security enabled', async () => {
    const withoutRls = await withRollback((db) =>
      queryRows<{ name: string }>(
        db,
        `select relname as name from pg_class
          where relnamespace = 'public'::regnamespace and relkind in ('r', 'p')
            and not relrowsecurity`,
      ),
    );
    expect(withoutRls).toEqual([]);
  });

  it('private.data_source_credentials has row-level security enabled', async () => {
    const row = await withRollback((db) =>
      queryOne<{ enabled: boolean }>(
        db,
        `select relrowsecurity as enabled from pg_class
          where oid = 'private.data_source_credentials'::regclass`,
      ),
    );
    expect(row.enabled).toBe(true);
  });

  it('private.data_source_credentials has no policies (only the backend may read it)', async () => {
    const policies = await withRollback((db) =>
      countRows(db, `select 1 from pg_policies where schemaname = 'private'`),
    );
    expect(policies).toBe(0);
  });

  it('every policy in schema public applies to role authenticated only (never anon/public)', async () => {
    const policies = await withRollback((db) =>
      queryRows<{ table: string; policy: string; roles: string[] }>(
        db,
        `select tablename as table, policyname as policy, roles::text[] as roles
           from pg_policies where schemaname = 'public'`,
      ),
    );
    expect(policies.length).toBeGreaterThan(0);
    expect(policies.filter((p) => p.roles.join(',') !== 'authenticated')).toEqual([]);
  });
});

describe('RLS applies inside the client RPCs', () => {
  it('the RPCs that read or write user rows run with the caller’s rights (SECURITY INVOKER)', async () => {
    const rows = await withRollback((db) =>
      queryRows<{ fn: string; definer: boolean }>(
        db,
        `select oid::regprocedure::text as fn, prosecdef as definer from pg_proc
          where oid in ('public.get_overview()'::regprocedure,
                        'public.move_budget(uuid, uuid, bigint)'::regprocedure,
                        'public.add_transactions(jsonb)'::regprocedure,
                        'public.list_transactions(jsonb)'::regprocedure,
                        'public.get_transaction(uuid)'::regprocedure,
                        'public.update_transaction(uuid, jsonb)'::regprocedure,
                        'public.set_transaction_splits(uuid, jsonb)'::regprocedure,
                        'public.remove_import(uuid)'::regprocedure,
                        'public.export_my_data()'::regprocedure,
                        'internal.categorize(text, text, integer, bigint)'::regprocedure,
                        'internal.ingest_row(jsonb, integer, text, text)'::regprocedure,
                        'internal.transaction_item(uuid)'::regprocedure)
          order by 1`,
      ),
    );
    expect([...rows].sort((x, y) => (x.fn < y.fn ? -1 : 1))).toEqual(
      [
        'add_transactions(jsonb)',
        'export_my_data()',
        'get_overview()',
        'get_transaction(uuid)',
        'internal.categorize(text,text,integer,bigint)',
        'internal.ingest_row(jsonb,integer,text,text)',
        'internal.transaction_item(uuid)',
        'list_transactions(jsonb)',
        'move_budget(uuid,uuid,bigint)',
        'remove_import(uuid)',
        'set_transaction_splits(uuid,jsonb)',
        'update_transaction(uuid,jsonb)',
      ]
        .sort()
        .map((fn) => ({ fn, definer: false })),
    );
  });

  // D-036: clients cannot write periods, so onboarding opens the first one with owner rights.
  it('complete_onboarding runs with the owner’s rights (SECURITY DEFINER, reviewed)', async () => {
    const row = await withRollback((db) =>
      queryOne<{ definer: boolean }>(
        db,
        `select prosecdef as definer from pg_proc
          where oid = 'public.complete_onboarding(jsonb)'::regprocedure`,
      ),
    );
    expect(row.definer).toBe(true);
  });

  it('a user cannot move budget out of or into another user’s budget (it is invisible)', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const b = await createUser(db);
      const ofA = await seedRow(db, 'budgets', a);
      const ofB = await seedRow(db, 'budgets', b);
      await asUser(db, a);
      for (const [from, to] of [
        [ofB, ofA],
        [ofA, ofB],
      ]) {
        const error = await expectSqlError(
          db,
          SQLSTATE.invalidParameterValue,
          'select public.move_budget($1, $2, 1)',
          [from, to],
        );
        expect(error.message).toBe('budget_not_found');
      }
      await asPostgres(db);
      const amounts = await queryRows<{ amount: number }>(
        db,
        'select amount_rappen::int as amount from public.budgets where id in ($1, $2)',
        [ofA, ofB],
      );
      expect(amounts).toEqual([{ amount: 30_000 }, { amount: 30_000 }]);
    });
  });
});

/** How the RLS matrix exercises one table. */
interface TableCase {
  table: string;
  /** Column holding the owning user's id. */
  owner: 'id' | 'user_id';
  /** Column identifying a row (returned by seedRow). */
  key: 'id' | 'user_id';
  /** Clients may insert rows (otherwise rows come from the sign-up trigger or the backend). */
  insert: boolean;
  /** A SET clause the owner may run, or null when clients cannot update. */
  update: string | null;
  delete: boolean;
}

const CASES: readonly TableCase[] = [
  {
    table: 'profiles',
    owner: 'id',
    key: 'id',
    insert: false,
    update: `display_name = 'Anna'`,
    delete: false,
  },
  {
    table: 'notification_settings',
    owner: 'user_id',
    key: 'user_id',
    insert: false,
    update: 'max_per_day = 3',
    delete: false,
  },
  {
    table: 'subscriptions',
    owner: 'user_id',
    key: 'user_id',
    insert: false,
    update: null,
    delete: false,
  },
  {
    table: 'fixed_costs',
    owner: 'user_id',
    key: 'id',
    insert: true,
    update: 'amount_rappen = 190000',
    delete: true,
  },
  {
    table: 'categories',
    owner: 'user_id',
    key: 'id',
    insert: true,
    update: `icon = 'bike'`,
    delete: true,
  },
  // Written by onboarding and the payday reset with owner rights only (D-036).
  {
    table: 'budget_periods',
    owner: 'user_id',
    key: 'id',
    insert: false,
    update: null,
    delete: false,
  },
  {
    table: 'budgets',
    owner: 'user_id',
    key: 'id',
    insert: true,
    update: 'amount_rappen = 35000',
    delete: true,
  },
  {
    table: 'data_sources',
    owner: 'user_id',
    key: 'id',
    insert: true,
    update: `display_name = 'Mail'`,
    delete: true,
  },
  {
    table: 'transactions',
    owner: 'user_id',
    key: 'id',
    insert: true,
    update: `note = 'Znüni'`,
    delete: true,
  },
  {
    table: 'transaction_splits',
    owner: 'user_id',
    key: 'id',
    insert: true,
    update: `note = 'Teil'`,
    delete: true,
  },
  {
    table: 'categorization_rules',
    owner: 'user_id',
    key: 'id',
    insert: true,
    update: 'priority = 5',
    delete: true,
  },
  {
    table: 'alerts',
    owner: 'user_id',
    key: 'id',
    insert: false,
    update: 'read_at = now()',
    delete: false,
  },
  {
    table: 'ai_conversations',
    owner: 'user_id',
    key: 'id',
    insert: true,
    update: `title = 'Ferien'`,
    delete: true,
  },
  { table: 'ai_messages', owner: 'user_id', key: 'id', insert: true, update: null, delete: false },
  {
    table: 'consent_events',
    owner: 'user_id',
    key: 'id',
    insert: true,
    update: null,
    delete: false,
  },
];

/** Creates users A and B and a row of `table` owned by A; leaves the connection acting as postgres. */
async function setup(db: Db, table: string) {
  const a = await createUser(db);
  const b = await createUser(db);
  const keyOfA = await seedRow(db, table, a);
  return { a, b, keyOfA };
}

describe('the RLS matrix covers every table', () => {
  it('has a case for every table in schema public', async () => {
    const tables = await withRollback(publicTables);
    expect(CASES.map((c) => c.table).sort()).toEqual(tables);
  });
});

describe.each(CASES)('RLS on public.$table', (spec) => {
  const table = `public.${spec.table}`;

  it('the owner reads their own row', async () => {
    await withRollback(async (db) => {
      const { a, keyOfA } = await setup(db, spec.table);
      await asUser(db, a);
      expect(await countRows(db, `select 1 from ${table} where ${spec.key} = $1`, [keyOfA])).toBe(
        1,
      );
    });
  });

  it('another user sees none of the owner’s rows', async () => {
    await withRollback(async (db) => {
      const { a, b } = await setup(db, spec.table);
      await asUser(db, b);
      expect(await countRows(db, `select 1 from ${table} where ${spec.owner} = $1`, [a])).toBe(0);
    });
  });

  it('an anonymous client cannot read it at all', async () => {
    await withRollback(async (db) => {
      await setup(db, spec.table);
      await asAnon(db);
      await expectSqlError(db, SQLSTATE.insufficientPrivilege, `select * from ${table}`);
    });
  });

  if (spec.insert) {
    it('the owner inserts a row for themselves', async () => {
      await withRollback(async (db) => {
        const a = await createUser(db);
        const values = await newRowValues(db, spec.table, a);
        await asUser(db, a);
        await insertRow(db, table, values);
        expect(await countRows(db, `select 1 from ${table} where user_id = $1`, [a])).toBe(1);
      });
    });

    it('another user cannot insert a row owned by the owner (42501)', async () => {
      await withRollback(async (db) => {
        const a = await createUser(db);
        const b = await createUser(db);
        const values = await newRowValues(db, spec.table, a);
        await asUser(db, b);
        const columns = Object.keys(values);
        await expectSqlError(
          db,
          SQLSTATE.insufficientPrivilege,
          `insert into ${table} (${columns.join(', ')})
           values (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
          Object.values(values),
        );
      });
    });
  }

  if (spec.update !== null) {
    const setClause = spec.update;

    it('the owner updates their own row', async () => {
      await withRollback(async (db) => {
        const { a, keyOfA } = await setup(db, spec.table);
        await asUser(db, a);
        expect(
          await affectedRows(db, `update ${table} set ${setClause} where ${spec.key} = $1`, [
            keyOfA,
          ]),
        ).toBe(1);
      });
    });

    it('another user’s update affects none of the owner’s rows', async () => {
      await withRollback(async (db) => {
        const { a, b, keyOfA } = await setup(db, spec.table);
        await asPostgres(db);
        const before = await queryOne<{ row: string }>(
          db,
          `select to_jsonb(t)::text as row from ${table} t where ${spec.key} = $1`,
          [keyOfA],
        );
        await asUser(db, b);
        expect(
          await affectedRows(db, `update ${table} set ${setClause} where ${spec.owner} = $1`, [a]),
        ).toBe(0);
        await asPostgres(db);
        const after = await queryOne<{ row: string }>(
          db,
          `select to_jsonb(t)::text as row from ${table} t where ${spec.key} = $1`,
          [keyOfA],
        );
        expect(after.row).toBe(before.row);
      });
    });
  }

  if (spec.delete) {
    it('the owner deletes their own row', async () => {
      await withRollback(async (db) => {
        const { a, keyOfA } = await setup(db, spec.table);
        await asUser(db, a);
        expect(
          await affectedRows(db, `delete from ${table} where ${spec.key} = $1`, [keyOfA]),
        ).toBe(1);
      });
    });

    it('another user’s delete affects none of the owner’s rows', async () => {
      await withRollback(async (db) => {
        const { a, b, keyOfA } = await setup(db, spec.table);
        await asUser(db, b);
        expect(await affectedRows(db, `delete from ${table} where ${spec.owner} = $1`, [a])).toBe(
          0,
        );
        await asPostgres(db);
        expect(await countRows(db, `select 1 from ${table} where ${spec.key} = $1`, [keyOfA])).toBe(
          1,
        );
      });
    });
  }
});

describe('profiles', () => {
  it('user B cannot read user A’s profile', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const b = await createUser(db);
      await asUser(db, b);
      expect(await countRows(db, 'select 1 from public.profiles where id = $1', [a])).toBe(0);
      expect(await countRows(db, 'select 1 from public.profiles')).toBe(1);
    });
  });

  it('user B cannot update user A’s profile', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const b = await createUser(db);
      await asUser(db, b);
      expect(
        await affectedRows(
          db,
          `update public.profiles set display_name = 'Mallory' where id = $1`,
          [a],
        ),
      ).toBe(0);
      await asPostgres(db);
      const profile = await queryOne<{ display_name: string | null }>(
        db,
        'select display_name from public.profiles where id = $1',
        [a],
      );
      expect(profile.display_name).toBeNull();
    });
  });

  it('a user cannot move their profile to another user id (42501)', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const b = await createUser(db);
      await asUser(db, a);
      await expectSqlError(
        db,
        SQLSTATE.insufficientPrivilege,
        'update public.profiles set id = $1 where id = $2',
        [b, a],
      );
    });
  });

  it('a user cannot hand one of their rows to another user (42501)', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const b = await createUser(db);
      const id = await seedRow(db, 'ai_conversations', a);
      await asUser(db, a);
      await expectSqlError(
        db,
        SQLSTATE.insufficientPrivilege,
        'update public.ai_conversations set user_id = $1 where id = $2',
        [b, id],
      );
    });
  });
});
