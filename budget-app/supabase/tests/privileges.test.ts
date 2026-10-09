/**
 * Privileges: anon gets nothing, authenticated gets exactly what the app needs, the private schema
 * is out of reach, schema internal is usable but read-only, and the write restrictions behind
 * those grants hold in practice.
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

/**
 * The profile columns a client may change (D-036): never id, onboarding_completed_at or the
 * timestamps.
 */
const PROFILE_UPDATE_COLUMNS = [
  'display_name',
  'irregular_income',
  'language',
  'leftover_policy',
  'net_income_rappen',
  'pain_level',
  'payday',
  'payment_methods',
  'savings_goal_date',
  'savings_goal_name',
  'savings_goal_rappen',
  'savings_monthly_rappen',
  'sound_enabled',
  'timezone',
  'weekly_work_minutes',
];

/** What role "authenticated" may do, table by table (from the migration's grants). */
const AUTHENTICATED: Readonly<
  Record<string, { table: readonly TablePrivilege[]; updateColumns?: readonly string[] }>
> = {
  profiles: { table: ['SELECT'], updateColumns: PROFILE_UPDATE_COLUMNS },
  // Deactivated, never deleted: deleting would unlink its payments (QA L1).
  fixed_costs: { table: ['SELECT', 'INSERT', 'UPDATE'] },
  categories: { table: CRUD },
  budget_periods: { table: ['SELECT'] },
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

/** The RPCs the app calls: the only functions in schema public role "authenticated" may execute. */
const CLIENT_FUNCTIONS = [
  'add_transactions(jsonb)',
  'complete_onboarding(jsonb)',
  'delete_my_account()',
  'ensure_current_period()',
  'export_my_data()',
  'get_overview()',
  'get_transaction(uuid)',
  'list_transactions(jsonb)',
  'move_budget(uuid,uuid,bigint)',
  'period_containing(date,integer)',
  'remove_import(uuid)',
  'set_transaction_splits(uuid,jsonb)',
  'update_transaction(uuid,jsonb)',
];

/** Helpers in schema internal that the RPCs call with the caller's rights (D-038). */
const INTERNAL_FUNCTIONS = [
  'internal.categorize(text,text,integer,bigint,timestamp with time zone)',
  'internal.fixed_cost_hint(text,text)',
  'internal.generic_words()',
  'internal.hint_words(text,text)',
  'internal.ingest_row(jsonb,integer,text,text)',
  'internal.json_bigint(jsonb,bigint,bigint)',
  'internal.json_string(jsonb)',
  'internal.json_uuid(jsonb)',
  'internal.key_contains(text,text)',
  'internal.key_runs(text,integer)',
  'internal.merchant_key(text)',
  'internal.month_words()',
  'internal.needs_review(bigint,uuid,text,integer,uuid,boolean,boolean,boolean)',
  'internal.payment_words()',
  'internal.same_merchant(text,text)',
  'internal.suggest_rule(text)',
  'internal.transaction_item(uuid)',
  'internal.transaction_key(text,text)',
];

/**
 * What the generated key columns (transactions.merchant_key, categorization_rules.pattern_key,
 * fixed_costs.merchant_hint_key) call: the backend role writes those tables, so it needs exactly
 * these and nothing else of schema internal.
 */
const SERVICE_ROLE_INTERNAL_FUNCTIONS = [
  'internal.hint_words(text,text)',
  'internal.merchant_key(text)',
  'internal.month_words()',
  'internal.payment_words()',
  'internal.transaction_key(text,text)',
];

/** Reference data in schema internal: readable by signed-in users, never writable. */
const INTERNAL_TABLES = ['known_merchants', 'mcc_categories'];

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
    `select public.add_transactions('{"rows": []}')`,
    `select public.list_transactions('{}')`,
    'select public.get_transaction(gen_random_uuid())',
    `select public.update_transaction(gen_random_uuid(), '{}')`,
    `select public.set_transaction_splits(gen_random_uuid(), '[]')`,
    'select public.remove_import(gen_random_uuid())',
    'select public.export_my_data()',
    `select internal.merchant_key('Coop')`,
    'select count(*) from internal.known_merchants',
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
    expect(executable.map((row) => row.fn).sort()).toEqual([...CLIENT_FUNCTIONS].sort());
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
  it('every function in schemas public, private and internal pins search_path to an empty value', async () => {
    const unpinned = await withRollback((db) =>
      queryRows<{ fn: string }>(
        db,
        `select oid::regprocedure::text as fn from pg_proc
          where pronamespace in ('public'::regnamespace, 'private'::regnamespace,
                                 'internal'::regnamespace)
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
          where pronamespace in ('public'::regnamespace, 'private'::regnamespace,
                                 'internal'::regnamespace)
            and prosecdef`,
      ),
    );
    expect(definers.map((row) => row.fn).sort()).toEqual([
      'complete_onboarding(jsonb)',
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

describe('schema internal (D-038)', () => {
  it.each([
    ['anon', { usage: false, create: false }],
    ['authenticated', { usage: true, create: false }],
    // For the generated key columns only (SERVICE_ROLE_INTERNAL_FUNCTIONS).
    ['service_role', { usage: true, create: false }],
  ])('%s: USAGE and CREATE on schema internal', async (role, expected) => {
    const row = await withRollback((db) =>
      queryOne<{ usage: boolean; create: boolean }>(
        db,
        `select has_schema_privilege($1, 'internal', 'USAGE') as usage,
                has_schema_privilege($1, 'internal', 'CREATE') as create`,
        [role],
      ),
    );
    expect(row).toEqual(expected);
  });

  it('is not served by the API (PostgREST exposes public and graphql_public only)', async () => {
    const { readFile } = await import('node:fs/promises');
    const config = await readFile(new URL('../config.toml', import.meta.url), 'utf8');
    const schemas = /^schemas = \[(.*)\]$/m.exec(config)?.[1];
    expect(schemas).toBe('"public", "graphql_public"');
  });

  it('holds exactly the reference tables, readable (SELECT only) by authenticated', async () => {
    await withRollback(async (db) => {
      const tables = await queryRows<{ name: string }>(
        db,
        `select relname as name from pg_class
          where relnamespace = 'internal'::regnamespace and relkind in ('r', 'p', 'v', 'm')
          order by 1`,
      );
      expect(tables.map((t) => t.name)).toEqual(INTERNAL_TABLES);
      for (const table of INTERNAL_TABLES) {
        const qualified = `internal.${table}`;
        expect(await tablePrivileges(db, 'authenticated', qualified)).toEqual(['SELECT']);
        expect(await anyColumnPrivileges(db, 'authenticated', qualified)).toEqual(['SELECT']);
        expect(await tablePrivileges(db, 'anon', qualified)).toEqual([]);
        expect(await anyColumnPrivileges(db, 'anon', qualified)).toEqual([]);
      }
    });
  });

  it('reference tables have RLS with one read-only policy for authenticated', async () => {
    const rows = await withRollback((db) =>
      queryRows<{ table: string; rls: boolean; policies: string }>(
        db,
        `select c.relname as table, c.relrowsecurity as rls,
                (select string_agg(p.cmd || ':' || array_to_string(p.roles, ','), ' ')
                   from pg_policies p
                  where p.schemaname = 'internal' and p.tablename = c.relname) as policies
           from pg_class c
          where c.relnamespace = 'internal'::regnamespace and c.relkind = 'r'
          order by 1`,
      ),
    );
    expect(rows).toEqual(
      INTERNAL_TABLES.map((table) => ({ table, rls: true, policies: 'SELECT:authenticated' })),
    );
  });

  it('authenticated may execute exactly the helpers the RPCs need, anon none', async () => {
    await withRollback(async (db) => {
      const executable = async (role: string) =>
        (
          await queryRows<{ fn: string }>(
            db,
            `select oid::regprocedure::text as fn from pg_proc
              where pronamespace = 'internal'::regnamespace
                and has_function_privilege($1, oid, 'EXECUTE')`,
            [role],
          )
        )
          .map((row) => row.fn)
          .sort();
      expect(await executable('authenticated')).toEqual(INTERNAL_FUNCTIONS);
      expect(await executable('service_role')).toEqual(SERVICE_ROLE_INTERNAL_FUNCTIONS);
      expect(await executable('anon')).toEqual([]);
      const all = await queryRows<{ fn: string }>(
        db,
        `select oid::regprocedure::text as fn from pg_proc
          where pronamespace = 'internal'::regnamespace`,
      );
      expect(all.map((row) => row.fn).sort()).toEqual(INTERNAL_FUNCTIONS);
    });
  });

  it.each([
    [
      `insert into internal.known_merchants (pattern, category_key, confidence) values ('evil', 'other', 99)`,
    ],
    [`update internal.known_merchants set confidence = 100 where pattern = 'manor'`],
    [`delete from internal.known_merchants where pattern = 'manor'`],
    [`insert into internal.mcc_categories values (1, 1, 'other', 99)`],
    [`update internal.mcc_categories set confidence = 100`],
    [`delete from internal.mcc_categories`],
    [`create table internal.mine (id int)`],
    [`create function internal.mine() returns int language sql as 'select 1'`],
  ])('a signed-in user cannot run: %s (42501)', async (sql) => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await asUser(db, a);
      await expectSqlError(db, SQLSTATE.insufficientPrivilege, sql);
    });
  });

  it('a signed-in user reads the reference lists', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await asUser(db, a);
      const row = await queryOne<{ merchants: number; codes: number }>(
        db,
        `select (select count(*)::int from internal.known_merchants) as merchants,
                (select count(*)::int from internal.mcc_categories) as codes`,
      );
      expect(row.merchants).toBeGreaterThan(200);
      expect(row.codes).toBeGreaterThan(50);
    });
  });
});

describe('column-level grants (D-036)', () => {
  it.each([
    ['onboarding_completed_at', 'now()'],
    ['id', 'gen_random_uuid()'],
    ['created_at', `'2000-01-01T00:00:00Z'`],
    ['updated_at', `'2000-01-01T00:00:00Z'`],
  ])('a client cannot set profiles.%s (42501)', async (column, value) => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await asUser(db, a);
      await expectSqlError(
        db,
        SQLSTATE.insufficientPrivilege,
        `update public.profiles set ${column} = ${value} where id = $1`,
        [a],
      );
    });
  });

  it('a client cannot mark itself onboarded, so it gets no overview without onboarding', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await asUser(db, a);
      await expectSqlError(
        db,
        SQLSTATE.insufficientPrivilege,
        `update public.profiles
            set net_income_rappen = 1, payday = 1, onboarding_completed_at = now()
          where id = $1`,
        [a],
      );
      const row = await queryOne<{ overview: unknown }>(
        db,
        'select public.get_overview() as overview',
      );
      expect(row.overview).toBeNull();
    });
  });

  it('a client still changes every user-editable profile field', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await asUser(db, a);
      expect(
        await affectedRows(
          db,
          `update public.profiles
              set display_name = 'Anna', language = 'en', timezone = 'Europe/Berlin',
                  net_income_rappen = 600000, payday = 1, irregular_income = true,
                  weekly_work_minutes = 2520, savings_monthly_rappen = 10000,
                  savings_goal_name = 'Velo', savings_goal_rappen = 200000,
                  savings_goal_date = '2027-01-01', leftover_policy = 'savings',
                  pain_level = 'mild', sound_enabled = false, payment_methods = '{card}'
            where id = $1`,
          [a],
        ),
      ).toBe(1);
    });
  });

  it.each([
    [
      'insert',
      `insert into public.budget_periods
         (user_id, starts_on, ends_on, income_rappen, fixed_costs_rappen, savings_rappen)
       values ($1, '2026-09-25', '2026-10-25', 1, 0, 0)`,
    ],
    ['update', `update public.budget_periods set income_rappen = 9999999 where user_id = $1`],
    ['delete', `delete from public.budget_periods where user_id = $1`],
  ])('a client cannot %s its own budget periods (42501)', async (_action, sql) => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await make.period(db, a);
      await asUser(db, a);
      await expectSqlError(db, SQLSTATE.insufficientPrivilege, sql, [a]);
    });
  });
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

  it('authenticated cannot delete a fixed cost (it is deactivated instead, QA L1)', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const fixedCost = await make.fixedCost(db, a);
      await make.transaction(db, a, { fixed_cost_id: fixedCost });
      await asUser(db, a);
      await expectSqlError(
        db,
        SQLSTATE.insufficientPrivilege,
        'delete from public.fixed_costs where id = $1',
        [fixedCost],
      );
      expect(
        await affectedRows(db, 'update public.fixed_costs set active = false where id = $1', [
          fixedCost,
        ]),
      ).toBe(1);
      const row = await queryOne<{ linked: number }>(
        db,
        'select count(*)::int as linked from public.transactions where fixed_cost_id = $1',
        [fixedCost],
      );
      expect(row.linked).toBe(1);
    });
  });

  it('the backend role can write every table with a generated key column', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const category = await make.category(db, a);
      await db.query('set local role service_role');
      const fixedCost = await make.fixedCost(db, a, { merchant_hint: 'Verwaltung Muster AG' });
      const tx = await make.transaction(db, a, { merchant: 'Bäckerei Hug', fixed_cost_id: null });
      await make.rule(db, a, category, { pattern: 'Bäckerei' });
      const keys = await queryOne<{ tx: string; hint: string }>(
        db,
        `select (select merchant_key from public.transactions where id = $1) as tx,
                (select merchant_hint_key from public.fixed_costs where id = $2) as hint`,
        [tx, fixedCost],
      );
      expect(keys).toEqual({ tx: 'backerei hug', hint: 'verwaltung muster' });
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
