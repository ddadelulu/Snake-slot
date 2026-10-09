/**
 * Referential integrity: composite (id, user_id) foreign keys make cross-tenant references
 * impossible even for the service role, deduplication keys hold, and deleting a referenced row
 * clears only the reference (never the owner column).
 */
import { describe, expect, it } from 'vitest';
import {
  type Db,
  type Row,
  SQLSTATE,
  asPostgres,
  asUser,
  countRows,
  createUser,
  expectSqlError,
  make,
  queryOne,
  quoteTable,
  runDeferredChecks,
  withRollback,
} from './db';

/** Users A and B, A owning one row of every kind that can be referenced. */
async function twoTenants(db: Db) {
  const a = await createUser(db);
  const b = await createUser(db);
  const ofA = {
    category: await make.category(db, a),
    period: await make.period(db, a),
    dataSource: await make.dataSource(db, a),
    fixedCost: await make.fixedCost(db, a),
    transaction: await make.transaction(db, a),
    conversation: await make.conversation(db, a),
  };
  const ofB = {
    category: await make.category(db, b),
    period: await make.period(db, b),
    transaction: await make.transaction(db, b),
  };
  return { a, b, ofA, ofB };
}

function insertSql(table: string, values: Row): [string, unknown[]] {
  const columns = Object.keys(values);
  return [
    `insert into ${quoteTable(table)} (${columns.join(', ')})
     values (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
    Object.values(values),
  ];
}

type Tenants = Awaited<ReturnType<typeof twoTenants>>;

/** Rows owned by B that point at one of A's rows. */
const CROSS_TENANT: ReadonlyArray<readonly [string, string, (t: Tenants) => Row]> = [
  [
    'a transaction',
    'A’s category',
    ({ b, ofA }) => ({
      user_id: b,
      amount_rappen: -100,
      booked_at: '2026-10-01',
      source: 'manual',
      category_id: ofA.category,
    }),
  ],
  [
    'a transaction',
    'A’s data source',
    ({ b, ofA }) => ({
      user_id: b,
      amount_rappen: -100,
      booked_at: '2026-10-01',
      source: 'bank',
      data_source_id: ofA.dataSource,
    }),
  ],
  [
    'a transaction',
    'A’s fixed cost',
    ({ b, ofA }) => ({
      user_id: b,
      amount_rappen: -100,
      booked_at: '2026-10-01',
      source: 'manual',
      fixed_cost_id: ofA.fixedCost,
    }),
  ],
  [
    'a transaction',
    'A’s transaction (merged_into_id)',
    ({ b, ofA }) => ({
      user_id: b,
      amount_rappen: -100,
      booked_at: '2026-10-01',
      source: 'manual',
      merged_into_id: ofA.transaction,
    }),
  ],
  [
    'a budget',
    'A’s period',
    ({ b, ofA, ofB }) => ({
      user_id: b,
      period_id: ofA.period,
      category_id: ofB.category,
      amount_rappen: 100,
    }),
  ],
  [
    'a budget',
    'A’s category',
    ({ b, ofA, ofB }) => ({
      user_id: b,
      period_id: ofB.period,
      category_id: ofA.category,
      amount_rappen: 100,
    }),
  ],
  [
    'a split',
    'A’s transaction',
    ({ b, ofA }) => ({ user_id: b, transaction_id: ofA.transaction, amount_rappen: -100 }),
  ],
  [
    'a split',
    'A’s category',
    ({ b, ofA, ofB }) => ({
      user_id: b,
      transaction_id: ofB.transaction,
      category_id: ofA.category,
      amount_rappen: -100,
    }),
  ],
  [
    'a categorization rule',
    'A’s category',
    ({ b, ofA }) => ({
      user_id: b,
      match_field: 'merchant',
      match_type: 'equals',
      pattern: 'Coop',
      category_id: ofA.category,
    }),
  ],
  [
    'an ai message',
    'A’s conversation',
    ({ b, ofA }) => ({
      user_id: b,
      conversation_id: ofA.conversation,
      role: 'user',
      content: 'Hallo',
    }),
  ],
];

const TABLE_OF: Readonly<Record<string, string>> = {
  'a transaction': 'public.transactions',
  'a budget': 'public.budgets',
  'a split': 'public.transaction_splits',
  'a categorization rule': 'public.categorization_rules',
  'an ai message': 'public.ai_messages',
};

function tableOf(kind: string): string {
  const table = TABLE_OF[kind];
  if (table === undefined) throw new Error(`unknown kind ${kind}`);
  return table;
}

describe('cross-tenant references are impossible', () => {
  it.each(CROSS_TENANT)(
    'B cannot insert %s pointing at %s (23503)',
    async (kind, _target, values) => {
      await withRollback(async (db) => {
        const tenants = await twoTenants(db);
        await asUser(db, tenants.b);
        const [sql, params] = insertSql(tableOf(kind), values(tenants));
        await expectSqlError(db, SQLSTATE.foreignKeyViolation, sql, params);
      });
    },
  );

  it.each(CROSS_TENANT)(
    'even postgres cannot insert %s for B pointing at %s (23503)',
    async (kind, _target, values) => {
      await withRollback(async (db) => {
        const tenants = await twoTenants(db);
        await asPostgres(db);
        const [sql, params] = insertSql(tableOf(kind), values(tenants));
        await expectSqlError(db, SQLSTATE.foreignKeyViolation, sql, params);
      });
    },
  );

  it('B cannot re-point its own transaction at A’s category (23503)', async () => {
    await withRollback(async (db) => {
      const { b, ofA, ofB } = await twoTenants(db);
      await asUser(db, b);
      await expectSqlError(
        db,
        SQLSTATE.foreignKeyViolation,
        'update public.transactions set category_id = $1 where id = $2',
        [ofA.category, ofB.transaction],
      );
    });
  });

  it.each([
    ['A’s category', 'category_id', (t: Tenants) => t.ofA.category],
    ['A’s transaction', 'transaction_id', (t: Tenants) => t.ofA.transaction],
    ['A’s period', 'period_id', (t: Tenants) => t.ofA.period],
  ] as const)(
    'the backend cannot create an alert for B pointing at %s (23503)',
    async (_target, column, target) => {
      await withRollback(async (db) => {
        const tenants = await twoTenants(db);
        await asPostgres(db);
        const [sql, params] = insertSql('public.alerts', {
          user_id: tenants.b,
          type: 'category_80',
          dedupe_key: 'x',
          title: 'x',
          body: 'x',
          [column]: target(tenants),
        });
        await expectSqlError(db, SQLSTATE.foreignKeyViolation, sql, params);
      });
    },
  );

  it('the backend cannot store a credential for B on A’s data source (23503)', async () => {
    await withRollback(async (db) => {
      const { b, ofA } = await twoTenants(db);
      await asPostgres(db);
      const [sql, params] = insertSql('private.data_source_credentials', {
        data_source_id: ofA.dataSource,
        user_id: b,
        ciphertext: Buffer.from('x'),
        key_version: 1,
      });
      await expectSqlError(db, SQLSTATE.foreignKeyViolation, sql, params);
    });
  });
});

describe('deduplication', () => {
  function imported(user: string, source: string, externalId: string | null): Row {
    return {
      user_id: user,
      amount_rappen: -4_590,
      booked_at: '2026-10-01T09:00:00Z',
      source,
      external_id: externalId,
    };
  }

  it('the same (source, external_id) twice for one user is rejected (23505)', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await asUser(db, a);
      await make.transaction(db, a, imported(a, 'bank', 'ubs-2026-10-01-001'));
      const [sql, params] = insertSql(
        'public.transactions',
        imported(a, 'bank', 'ubs-2026-10-01-001'),
      );
      await expectSqlError(db, SQLSTATE.uniqueViolation, sql, params);
    });
  });

  it('the same (source, external_id) is allowed for two users', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const b = await createUser(db);
      await make.transaction(db, a, imported(a, 'bank', 'ubs-2026-10-01-001'));
      await asUser(db, b);
      await make.transaction(db, b, imported(b, 'bank', 'ubs-2026-10-01-001'));
    });
  });

  it('the same external_id is allowed from two sources', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await asUser(db, a);
      await make.transaction(db, a, imported(a, 'bank', '4711'));
      await make.transaction(db, a, imported(a, 'email', '4711'));
    });
  });

  it('transactions without external_id are never deduplicated', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await asUser(db, a);
      await make.transaction(db, a, imported(a, 'manual', null));
      await make.transaction(db, a, imported(a, 'manual', null));
      expect(await countRows(db, 'select 1 from public.transactions where user_id = $1', [a])).toBe(
        2,
      );
    });
  });

  it('the same alert dedupe_key twice for one user is rejected (23505)', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await make.alert(db, a, { dedupe_key: 'category_80:groceries:2026-09-25' });
      const [sql, params] = insertSql('public.alerts', {
        user_id: a,
        type: 'category_80',
        dedupe_key: 'category_80:groceries:2026-09-25',
        title: 'Nochmals',
        body: 'Nochmals',
      });
      await expectSqlError(db, SQLSTATE.uniqueViolation, sql, params);
    });
  });

  it('the same alert dedupe_key is allowed for two users', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const b = await createUser(db);
      await make.alert(db, a, { dedupe_key: 'payday:2026-10-25' });
      await make.alert(db, b, { dedupe_key: 'payday:2026-10-25' });
    });
  });
});

describe('deleting a referenced row clears only the reference', () => {
  it('deleting a category sets transactions.category_id to NULL and keeps user_id', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await asUser(db, a);
      const category = await make.category(db, a);
      const tx = await make.transaction(db, a, { category_id: category });
      await db.query('delete from public.categories where id = $1', [category]);
      const row = await queryOne<{ category_id: string | null; user_id: string }>(
        db,
        'select category_id, user_id from public.transactions where id = $1',
        [tx],
      );
      expect(row).toEqual({ category_id: null, user_id: a });
      await runDeferredChecks(db);
    });
  });

  it('deleting a category clears alerts.category_id and keeps the alert', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const category = await make.category(db, a);
      const alert = await make.alert(db, a, { category_id: category });
      await asUser(db, a);
      await db.query('delete from public.categories where id = $1', [category]);
      const row = await queryOne<{ category_id: string | null; user_id: string }>(
        db,
        'select category_id, user_id from public.alerts where id = $1',
        [alert],
      );
      expect(row).toEqual({ category_id: null, user_id: a });
    });
  });

  it('deleting a category deletes its budgets and rules', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const period = await make.period(db, a); // periods are written with owner rights (D-036)
      await asUser(db, a);
      const category = await make.category(db, a);
      await make.budget(db, a, period, category);
      await make.rule(db, a, category);
      await db.query('delete from public.categories where id = $1', [category]);
      expect(
        await countRows(db, 'select 1 from public.budgets where category_id = $1', [category]),
      ).toBe(0);
      expect(
        await countRows(db, 'select 1 from public.categorization_rules where category_id = $1', [
          category,
        ]),
      ).toBe(0);
    });
  });

  it('deleting a data source sets transactions.data_source_id to NULL and keeps user_id', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await asUser(db, a);
      const source = await make.dataSource(db, a);
      const tx = await make.transaction(db, a, { data_source_id: source, source: 'bank' });
      await db.query('delete from public.data_sources where id = $1', [source]);
      const row = await queryOne<{ data_source_id: string | null; user_id: string }>(
        db,
        'select data_source_id, user_id from public.transactions where id = $1',
        [tx],
      );
      expect(row).toEqual({ data_source_id: null, user_id: a });
    });
  });

  it('deleting a data source deletes its stored credentials', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const source = await make.dataSource(db, a);
      await make.credential(db, a, source);
      await asUser(db, a);
      await db.query('delete from public.data_sources where id = $1', [source]);
      await asPostgres(db);
      expect(
        await countRows(
          db,
          'select 1 from private.data_source_credentials where data_source_id = $1',
          [source],
        ),
      ).toBe(0);
    });
  });

  // Clients cannot delete fixed costs (privileges.test.ts); the backend and account deletion can.
  it('deleting a fixed cost (backend) sets transactions.fixed_cost_id to NULL and keeps user_id', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await asUser(db, a);
      const fixedCost = await make.fixedCost(db, a);
      const tx = await make.transaction(db, a, { fixed_cost_id: fixedCost });
      await asPostgres(db);
      await db.query('delete from public.fixed_costs where id = $1', [fixedCost]);
      const row = await queryOne<{ fixed_cost_id: string | null; user_id: string }>(
        db,
        'select fixed_cost_id, user_id from public.transactions where id = $1',
        [tx],
      );
      expect(row).toEqual({ fixed_cost_id: null, user_id: a });
    });
  });

  it('deleting a transaction clears merged_into_id on the rows merged into it', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await asUser(db, a);
      const kept = await make.transaction(db, a);
      const duplicate = await make.transaction(db, a, { merged_into_id: kept });
      await db.query('delete from public.transactions where id = $1', [kept]);
      const row = await queryOne<{ merged_into_id: string | null; user_id: string }>(
        db,
        'select merged_into_id, user_id from public.transactions where id = $1',
        [duplicate],
      );
      expect(row).toEqual({ merged_into_id: null, user_id: a });
    });
  });

  it('deleting a budget period deletes its budgets and clears alerts.period_id', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const period = await make.period(db, a);
      await make.budget(db, a, period, await make.category(db, a));
      const alert = await make.alert(db, a, { period_id: period });
      // Clients cannot delete periods (D-036); account deletion and the owner can.
      await db.query('delete from public.budget_periods where id = $1', [period]);
      expect(
        await countRows(db, 'select 1 from public.budgets where period_id = $1', [period]),
      ).toBe(0);
      expect(
        await countRows(
          db,
          'select 1 from public.alerts where id = $1 and period_id is null and user_id = $2',
          [alert, a],
        ),
      ).toBe(1);
    });
  });

  it('deleting a conversation deletes its messages', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await asUser(db, a);
      const conversation = await make.conversation(db, a);
      await make.message(db, a, conversation);
      await db.query('delete from public.ai_conversations where id = $1', [conversation]);
      expect(
        await countRows(db, 'select 1 from public.ai_messages where conversation_id = $1', [
          conversation,
        ]),
      ).toBe(0);
    });
  });
});
