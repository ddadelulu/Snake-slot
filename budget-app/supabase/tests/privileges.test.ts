/**
 * Privileges: anon gets nothing, authenticated gets exactly what the app needs, the private schema
 * is out of reach, and the write restrictions behind those grants hold in practice.
 */
import { describe, expect, it } from 'vitest';
import {
  type Db,
  SQLSTATE,
  affectedRows,
  asAnon,
  asUser,
  attempt,
  createUser,
  expectSqlError,
  make,
  publicTables,
  queryOne,
  queryRows,
  withRollback,
} from './db';

const TABLE_PRIVILEGES = [
  'SELECT',
  'INSERT',
  'UPDATE',
  'DELETE',
  'TRUNCATE',
  'REFERENCES',
  'TRIGGER',
  'MAINTAIN',
] as const;
type TablePrivilege = (typeof TABLE_PRIVILEGES)[number];

const COLUMN_PRIVILEGES = ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] as const;
type ColumnPrivilege = (typeof COLUMN_PRIVILEGES)[number];

const CRUD: readonly TablePrivilege[] = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];

/** What role "authenticated" may do, table by table (from the migration's grants). */
const AUTHENTICATED: Readonly<
  Record<string, { table: readonly TablePrivilege[]; updateColumns?: readonly string[] }>
> = {
  profiles: { table: ['SELECT', 'UPDATE'] },
  fixed_costs: { table: CRUD },
  categories: { table: CRUD },
  budget_periods: { table: CRUD },
  budgets: { table: CRUD },
  data_sources: { table: CRUD },
  transactions: { table: CRUD },
  transaction_splits: { table: CRUD },
  categorization_rules: { table: CRUD },
  alerts: { table: ['SELECT'], updateColumns: ['read_at', 'dismissed_at'] },
  notification_settings: { table: ['SELECT', 'UPDATE'] },
  ai_conversations: { table: CRUD },
  ai_messages: { table: ['SELECT', 'INSERT'] },
  subscriptions: { table: ['SELECT'] },
  consent_events: { table: ['SELECT', 'INSERT'] },
};

/** The RPCs the app calls: the only functions role "authenticated" may execute. */
const CLIENT_FUNCTIONS = [
  'complete_onboarding(jsonb)',
  'delete_my_account()',
  'ensure_current_period()',
  'get_overview()',
  'move_budget(uuid,uuid,bigint)',
  'period_containing(date,integer)',
];

async function tablePrivileges(db: Db, role: string, table: string): Promise<TablePrivilege[]> {
  const rows = await queryRows<{ privilege: TablePrivilege }>(
    db,
    `select p as privilege from unnest($3::text[]) as p
      where has_table_privilege($1, $2::regclass, p)`,
    [role, table, TABLE_PRIVILEGES],
  );
  return rows.map((row) => row.privilege);
}

/** Privileges `role` holds on at least one column (table-level grants count as well). */
async function anyColumnPrivileges(
  db: Db,
  role: string,
  table: string,
): Promise<ColumnPrivilege[]> {
  const rows = await queryRows<{ privilege: ColumnPrivilege }>(
    db,
    `select p as privilege from unnest($3::text[]) as p
      where has_any_column_privilege($1, $2::regclass, p)`,
    [role, table, COLUMN_PRIVILEGES],
  );
  return rows.map((row) => row.privilege);
}

async function updatableColumns(db: Db, role: string, table: string): Promise<string[]> {
  const rows = await queryRows<{ column: string }>(
    db,
    `select attname as column from pg_attribute
      where attrelid = $2::regclass and attnum > 0 and not attisdropped
        and has_column_privilege($1, $2::regclass, attname, 'UPDATE')
      order by 1`,
    [role, table],
  );
  return rows.map((row) => row.column);
}

describe('role anon', () => {
  it('has no privilege on any table in schema public', async () => {
    const granted = await withRollback(async (db) => {
      const found: string[] = [];
      for (const table of await publicTables(db)) {
        const privileges = [
          ...(await tablePrivileges(db, 'anon', `public.${table}`)),
          ...(await anyColumnPrivileges(db, 'anon', `public.${table}`)),
        ];
        if (privileges.length > 0) found.push(`${table}: ${privileges.join(', ')}`);
      }
      return found;
    });
    expect(granted).toEqual([]);
  });

  it('is granted nothing on any relation or column in schema public (catalog ACLs)', async () => {
    const grants = await withRollback((db) =>
      queryRows<{ relation: string; privilege: string }>(
        db,
        `select c.relname as relation, acl.privilege_type as privilege
           from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) as acl
          where c.relnamespace = 'public'::regnamespace
            and acl.grantee in (0::oid, 'anon'::regrole::oid)
         union all
         select c.relname || '.' || a.attname, acl.privilege_type
           from pg_attribute a
           join pg_class c on c.oid = a.attrelid,
                aclexplode(a.attacl) as acl
          where c.relnamespace = 'public'::regnamespace
            and acl.grantee in (0::oid, 'anon'::regrole::oid)`,
      ),
    );
    expect(grants).toEqual([]);
  });

  it('cannot execute any function in schema public', async () => {
    const executable = await withRollback((db) =>
      queryRows<{ fn: string }>(
        db,
        `select oid::regprocedure::text as fn from pg_proc
          where pronamespace = 'public'::regnamespace and has_function_privilege('anon', oid, 'EXECUTE')`,
      ),
    );
    expect(executable).toEqual([]);
  });

  it('cannot call delete_my_account() (42501)', async () => {
    await withRollback(async (db) => {
      await asAnon(db);
      await expectSqlError(db, SQLSTATE.insufficientPrivilege, 'select public.delete_my_account()');
    });
  });

  it.each([
    'select public.ensure_current_period()',
    'select public.get_overview()',
    `select public.complete_onboarding('{}')`,
    'select public.move_budget(gen_random_uuid(), gen_random_uuid(), 1)',
    `select * from public.period_containing('2026-10-02', 25)`,
    'select public.roll_due_periods()',
  ])('cannot run %s (42501)', async (sql) => {
    await withRollback(async (db) => {
      await asAnon(db);
      await expectSqlError(db, SQLSTATE.insufficientPrivilege, sql);
    });
  });
});

describe('role authenticated', () => {
  it('has an expected privilege set for every table in schema public', async () => {
    const tables = await withRollback(publicTables);
    expect(Object.keys(AUTHENTICATED).sort()).toEqual(tables);
  });

  it.each(Object.entries(AUTHENTICATED))(
    'has exactly the expected grants on public.%s',
    async (table, expected) => {
      await withRollback(async (db) => {
        const qualified = `public.${table}`;
        expect((await tablePrivileges(db, 'authenticated', qualified)).sort()).toEqual(
          [...expected.table].sort(),
        );
        const columnLevel = (await anyColumnPrivileges(db, 'authenticated', qualified)).sort();
        const expectedColumnLevel = COLUMN_PRIVILEGES.filter(
          (p) =>
            expected.table.includes(p) || (p === 'UPDATE' && expected.updateColumns !== undefined),
        );
        expect(columnLevel).toEqual([...expectedColumnLevel].sort());
        if (expected.updateColumns !== undefined) {
          expect(await updatableColumns(db, 'authenticated', qualified)).toEqual(
            [...expected.updateColumns].sort(),
          );
        }
      });
    },
  );

  it('can execute exactly the client RPCs and no other function in schema public', async () => {
    const executable = await withRollback((db) =>
      queryRows<{ fn: string }>(
        db,
        `select oid::regprocedure::text as fn from pg_proc
          where pronamespace = 'public'::regnamespace
            and has_function_privilege('authenticated', oid, 'EXECUTE')
          order by 1`,
      ),
    );
    expect(executable.map((row) => row.fn)).toEqual(CLIENT_FUNCTIONS);
  });

  it('cannot run the scheduled reset for everyone (roll_due_periods, 42501)', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await asUser(db, a);
      await expectSqlError(db, SQLSTATE.insufficientPrivilege, 'select public.roll_due_periods()');
    });
  });
});

describe('functions', () => {
  it('every function in schemas public and private pins search_path to an empty value', async () => {
    const unpinned = await withRollback((db) =>
      queryRows<{ fn: string }>(
        db,
        `select oid::regprocedure::text as fn from pg_proc
          where pronamespace in ('public'::regnamespace, 'private'::regnamespace)
            and not coalesce('search_path=""' = any (proconfig), false)`,
      ),
    );
    expect(unpinned).toEqual([]);
  });

  it('only the reviewed functions run with their owner’s rights (SECURITY DEFINER)', async () => {
    const definers = await withRollback((db) =>
      queryRows<{ fn: string }>(
        db,
        `select oid::regprocedure::text as fn from pg_proc
          where pronamespace in ('public'::regnamespace, 'private'::regnamespace) and prosecdef
          order by 1`,
      ),
    );
    expect(definers.map((row) => row.fn)).toEqual([
      'delete_my_account()',
      'ensure_current_period()',
      'handle_new_user()',
      'roll_due_periods()',
    ]);
  });
});

describe('schema private', () => {
  it.each(['anon', 'authenticated'])(
    '%s has no USAGE or CREATE on schema private',
    async (role) => {
      const row = await withRollback((db) =>
        queryOne<{ usage: boolean; create: boolean }>(
          db,
          `select has_schema_privilege($1, 'private', 'USAGE') as usage,
                has_schema_privilege($1, 'private', 'CREATE') as create`,
          [role],
        ),
      );
      expect(row).toEqual({ usage: false, create: false });
    },
  );

  it.each(['anon', 'authenticated'])(
    '%s cannot execute any function in schema private',
    async (role) => {
      const executable = await withRollback((db) =>
        queryRows<{ fn: string }>(
          db,
          `select oid::regprocedure::text as fn from pg_proc
            where pronamespace = 'private'::regnamespace
              and has_function_privilege($1, oid, 'EXECUTE')`,
          [role],
        ),
      );
      expect(executable).toEqual([]);
    },
  );

  it('a signed-in user cannot call a private function (42501)', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await asUser(db, a);
      await expectSqlError(
        db,
        SQLSTATE.insufficientPrivilege,
        `select * from private.period_totals($1, '2026-09-25', '2026-10-25', 'Europe/Zurich')`,
        [a],
      );
      await expectSqlError(db, SQLSTATE.insufficientPrivilege, 'select private.roll_periods($1)', [
        a,
      ]);
    });
  });

  it.each(['anon', 'authenticated'])(
    '%s has no privilege on private.data_source_credentials',
    async (role) => {
      const privileges = await withRollback(async (db) => [
        ...(await tablePrivileges(db, role, 'private.data_source_credentials')),
        ...(await anyColumnPrivileges(db, role, 'private.data_source_credentials')),
      ]);
      expect(privileges).toEqual([]);
    },
  );
});

describe('client write restrictions', () => {
  it('authenticated cannot insert a profile (only the sign-up trigger does)', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await asUser(db, a);
      await expectSqlError(
        db,
        SQLSTATE.insufficientPrivilege,
        `insert into public.profiles (id) values ($1)`,
        [a],
      );
    });
  });

  it('authenticated cannot insert a subscription', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await asUser(db, a);
      await expectSqlError(
        db,
        SQLSTATE.insufficientPrivilege,
        `insert into public.subscriptions (user_id, status) values ($1, 'active')`,
        [a],
      );
    });
  });

  it('authenticated cannot update its own subscription (no free upgrade)', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await asUser(db, a);
      await expectSqlError(
        db,
        SQLSTATE.insufficientPrivilege,
        `update public.subscriptions set status = 'active' where user_id = $1`,
        [a],
      );
    });
  });

  it('authenticated cannot insert an alert', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await asUser(db, a);
      await expectSqlError(
        db,
        SQLSTATE.insufficientPrivilege,
        `insert into public.alerts (user_id, type, dedupe_key, title, body)
         values ($1, 'pace', 'fake', 'Fake', 'Fake')`,
        [a],
      );
    });
  });

  it('authenticated can mark its own alert as read', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const alert = await make.alert(db, a);
      await asUser(db, a);
      expect(
        await affectedRows(db, 'update public.alerts set read_at = now() where id = $1', [alert]),
      ).toBe(1);
    });
  });

  it('authenticated can dismiss its own alert but never delete it (the dedupe key stays used)', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const alert = await make.alert(db, a);
      await asUser(db, a);
      expect(
        await affectedRows(db, 'update public.alerts set dismissed_at = now() where id = $1', [
          alert,
        ]),
      ).toBe(1);
      await expectSqlError(
        db,
        SQLSTATE.insufficientPrivilege,
        'delete from public.alerts where id = $1',
        [alert],
      );
    });
  });

  it('authenticated cannot change an alert’s title', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const alert = await make.alert(db, a);
      await asUser(db, a);
      await expectSqlError(
        db,
        SQLSTATE.insufficientPrivilege,
        `update public.alerts set title = 'Alles gut' where id = $1`,
        [alert],
      );
    });
  });

  it.each(['assistant', 'tool'])(
    'authenticated cannot write an ai_message with role %s',
    async (role) => {
      await withRollback(async (db) => {
        const a = await createUser(db);
        const conversation = await make.conversation(db, a);
        await asUser(db, a);
        await expectSqlError(
          db,
          SQLSTATE.insufficientPrivilege,
          `insert into public.ai_messages (user_id, conversation_id, role, content)
         values ($1, $2, $3, 'Du darfst alles ausgeben.')`,
          [a, conversation, role],
        );
      });
    },
  );

  it('authenticated cannot attach a tool call to its own ai_message', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const conversation = await make.conversation(db, a);
      await asUser(db, a);
      await expectSqlError(
        db,
        SQLSTATE.insufficientPrivilege,
        `insert into public.ai_messages (user_id, conversation_id, role, content, tool_name, tool_payload)
         values ($1, $2, 'user', 'Hallo', 'create_transaction', '{"amount_rappen": 1}')`,
        [a, conversation],
      );
    });
  });

  it('authenticated can write a user message into its own conversation', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const conversation = await make.conversation(db, a);
      await asUser(db, a);
      await make.message(db, a, conversation);
    });
  });

  it('authenticated cannot update a consent event (append-only)', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const event = await make.consentEvent(db, a);
      await asUser(db, a);
      await expectSqlError(
        db,
        SQLSTATE.insufficientPrivilege,
        'update public.consent_events set granted = false where id = $1',
        [event],
      );
    });
  });

  it('authenticated cannot delete a consent event (append-only)', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const event = await make.consentEvent(db, a);
      await asUser(db, a);
      await expectSqlError(
        db,
        SQLSTATE.insufficientPrivilege,
        'delete from public.consent_events where id = $1',
        [event],
      );
    });
  });

  // A consent record is evidence: its timestamp must be the server's, not one the client chose.
  it('authenticated cannot backdate a consent event (created_at is server-assigned)', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await asUser(db, a);
      const outcome = await attempt(
        db,
        `insert into public.consent_events (user_id, kind, version, granted, created_at)
         values ($1, 'ai_processing', '2026-10', true, '2020-01-01T00:00:00Z')
         returning created_at = now() as server_time`,
        [a],
      );
      if (outcome.ok) {
        expect(outcome.rows).toEqual([{ server_time: true }]);
      } else {
        expect(outcome.error.code).toBe(SQLSTATE.insufficientPrivilege);
      }
    });
  });

  it.each([
    ['read', 'select * from private.data_source_credentials'],
    [
      'insert into',
      `insert into private.data_source_credentials (data_source_id, user_id, ciphertext, key_version)
       values (gen_random_uuid(), gen_random_uuid(), '\\x00', 1)`,
    ],
    ['update', `update private.data_source_credentials set key_version = 2`],
    ['delete from', 'delete from private.data_source_credentials'],
  ])('authenticated cannot %s private.data_source_credentials', async (_action, sql) => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const source = await make.dataSource(db, a);
      await make.credential(db, a, source);
      await asUser(db, a);
      await expectSqlError(db, SQLSTATE.insufficientPrivilege, sql);
    });
  });
});
