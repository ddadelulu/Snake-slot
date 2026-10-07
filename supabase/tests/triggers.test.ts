/**
 * Triggers: the sign-up trigger creates every per-user row, and updated_at is maintained by the
 * database rather than trusted from clients.
 */
import { describe, expect, it } from 'vitest';
import {
  type Row,
  asPostgres,
  asUser,
  createUser,
  make,
  queryOne,
  queryRows,
  quoteTable,
  seedRow,
  withRollback,
} from './db';

describe('new user (handle_new_user)', () => {
  it.each([
    ['en', { language: 'en' }, 'en'],
    ['de', { language: 'de' }, 'de'],
    ['an unsupported language (fr)', { language: 'fr' }, 'de'],
    ['a non-text language', { language: 42 }, 'de'],
    ['no language', {}, 'de'],
    ['no metadata at all', null, 'de'],
  ] as const)(
    'creates a profile; signing up with %s gives language %s',
    async (_label, metadata, expected) => {
      await withRollback(async (db) => {
        const id = await createUser(db, { metadata: metadata === null ? null : { ...metadata } });
        const profile = await queryOne<{ language: string }>(
          db,
          'select language from public.profiles where id = $1',
          [id],
        );
        expect(profile.language).toBe(expected);
      });
    },
  );

  it('creates the profile with the documented defaults', async () => {
    await withRollback(async (db) => {
      const id = await createUser(db);
      const profile = await queryOne<Row>(
        db,
        `select timezone, leftover_policy, pain_level, sound_enabled, irregular_income,
                payment_methods, savings_monthly_rappen::int as savings_monthly_rappen,
                onboarding_completed_at
           from public.profiles where id = $1`,
        [id],
      );
      expect(profile).toEqual({
        timezone: 'Europe/Zurich',
        leftover_policy: 'rollover',
        pain_level: 'normal',
        sound_enabled: true,
        irregular_income: false,
        payment_methods: [],
        savings_monthly_rappen: 0,
        onboarding_completed_at: null,
      });
    });
  });

  it('creates notification settings with every alert on, quiet hours 22:00–07:00 and 6 per day', async () => {
    await withRollback(async (db) => {
      const id = await createUser(db);
      const settings = await queryOne<Row>(
        db,
        `select transaction_moments, category_thresholds, total_low, pace, unusual_purchase,
                daily_allowance, payday, weekly_review, categorize_requests, quiet_hours_enabled,
                quiet_hours_start::text as quiet_hours_start, quiet_hours_end::text as quiet_hours_end,
                max_per_day
           from public.notification_settings where user_id = $1`,
        [id],
      );
      expect(settings).toEqual({
        transaction_moments: true,
        category_thresholds: true,
        total_low: true,
        pace: true,
        unusual_purchase: true,
        daily_allowance: true,
        payday: true,
        weekly_review: true,
        categorize_requests: true,
        quiet_hours_enabled: true,
        quiet_hours_start: '22:00:00',
        quiet_hours_end: '07:00:00',
        max_per_day: 6,
      });
    });
  });

  it('creates a subscription row with status none', async () => {
    await withRollback(async (db) => {
      const id = await createUser(db);
      const subscription = await queryOne<Row>(
        db,
        'select status, store, product_id, will_renew from public.subscriptions where user_id = $1',
        [id],
      );
      expect(subscription).toEqual({
        status: 'none',
        store: null,
        product_id: null,
        will_renew: null,
      });
    });
  });

  it('creates nothing else for the new user', async () => {
    await withRollback(async (db) => {
      const id = await createUser(db);
      const counts = await queryOne<Row>(
        db,
        `select (select count(*)::int from public.categories where user_id = $1) as categories,
                (select count(*)::int from public.alerts where user_id = $1) as alerts,
                (select count(*)::int from public.consent_events where user_id = $1) as consent_events`,
        [id],
      );
      expect(counts).toEqual({ categories: 0, alerts: 0, consent_events: 0 });
    });
  });
});

/** Tables a signed-in user may update, with a harmless change to make. */
const CLIENT_UPDATES: ReadonlyArray<readonly [string, string]> = [
  ['profiles', `display_name = 'Anna'`],
  ['notification_settings', 'pace = false'],
  ['fixed_costs', 'amount_rappen = 1'],
  ['categories', `icon = 'cart'`],
  ['budgets', 'amount_rappen = 1'],
  ['data_sources', `display_name = 'UBS'`],
  ['transactions', `note = 'Zmittag'`],
  ['transaction_splits', `note = 'Hälfte'`],
  ['categorization_rules', 'priority = 1'],
  ['ai_conversations', `title = 'Ferienbudget'`],
];

/** Column identifying the row seedRow returns (the per-user tables are keyed by user). */
const KEY_COLUMN: Readonly<Record<string, string>> = {
  profiles: 'id',
  notification_settings: 'user_id',
};

const OLD = '2001-02-03T04:05:06Z';

describe('updated_at (set_updated_at)', () => {
  it.each(CLIENT_UPDATES)('is bumped when a user updates public.%s', async (table, setClause) => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const key = await seedRow(db, table, a);
      const keyColumn = KEY_COLUMN[table] ?? 'id';
      const qualified = quoteTable(`public.${table}`);
      await db.query(`update ${qualified} set updated_at = $1 where ${keyColumn} = $2`, [OLD, key]);
      await asUser(db, a);
      const row = await queryOne<{ bumped: boolean }>(
        db,
        `update ${qualified} set ${setClause} where ${keyColumn} = $1
         returning updated_at = now() and updated_at > $2::timestamptz as bumped`,
        [key, OLD],
      );
      expect(row.bumped).toBe(true);
    });
  });

  it('cannot be set to another value by the client', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const category = await make.category(db, a);
      await asUser(db, a);
      const row = await queryOne<{ bumped: boolean }>(
        db,
        `update public.categories set updated_at = $1 where id = $2
         returning updated_at = now() as bumped`,
        [OLD, category],
      );
      expect(row.bumped).toBe(true);
    });
  });

  // Clients cannot write budget periods (D-036); onboarding and the payday reset do, as owner.
  it('is bumped when the owner updates public.budget_periods', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const period = await seedRow(db, 'budget_periods', a);
      await db.query('update public.budget_periods set updated_at = $1 where id = $2', [
        OLD,
        period,
      ]);
      const row = await queryOne<{ bumped: boolean }>(
        db,
        `update public.budget_periods set savings_rappen = 1 where id = $1
         returning updated_at = now() and updated_at > $2::timestamptz as bumped`,
        [period, OLD],
      );
      expect(row.bumped).toBe(true);
    });
  });

  it('is bumped when the backend updates a subscription', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await db.query('update public.subscriptions set updated_at = $1 where user_id = $2', [
        OLD,
        a,
      ]);
      const row = await queryOne<{ bumped: boolean }>(
        db,
        `update public.subscriptions set status = 'trialing' where user_id = $1
         returning updated_at = now() as bumped`,
        [a],
      );
      expect(row.bumped).toBe(true);
    });
  });

  it('is bumped when the backend updates a data source credential', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const source = await make.dataSource(db, a);
      await make.credential(db, a, source, { updated_at: OLD });
      await asPostgres(db);
      const row = await queryOne<{ bumped: boolean }>(
        db,
        `update private.data_source_credentials set key_version = 2 where data_source_id = $1
         returning updated_at = now() as bumped`,
        [source],
      );
      expect(row.bumped).toBe(true);
    });
  });

  it('every table with an updated_at column has the set_updated_at trigger', async () => {
    const missing = await withRollback((db) =>
      queryRows<{ table: string }>(
        db,
        `select c.oid::regclass::text as table
           from pg_class c
           join pg_attribute a on a.attrelid = c.oid and a.attname = 'updated_at' and not a.attisdropped
          where c.relnamespace in ('public'::regnamespace, 'private'::regnamespace)
            and c.relkind in ('r', 'p')
            and not exists (
              select 1 from pg_trigger t
               where t.tgrelid = c.oid and not t.tgisinternal
                 and t.tgfoid = 'public.set_updated_at()'::regprocedure
                 and t.tgtype & 2 = 2      -- BEFORE
                 and t.tgtype & 1 = 1      -- FOR EACH ROW
                 and t.tgtype & 16 = 16    -- UPDATE
            )`,
      ),
    );
    expect(missing).toEqual([]);
  });
});
