/**
 * complete_onboarding(): one atomic call writes the profile, fixed costs, categories, the first
 * period with its budgets and the notification settings, for the caller only.
 */
import { periodContaining } from '@budget/core';
import { describe, expect, it } from 'vitest';
import {
  type Db,
  type Row,
  SQLSTATE,
  type SqlState,
  asAnon,
  asAuthenticatedWithoutUser,
  asPostgres,
  asUser,
  createUser,
  expectSqlError,
  make,
  queryOne,
  queryRows,
  todayIn,
  withRollback,
} from './db';

const PROFILE = {
  net_income_rappen: 520_000,
  payday: 25,
  irregular_income: false,
  weekly_work_minutes: 2_520,
  savings_monthly_rappen: 50_000,
  savings_goal_name: 'Ferien',
  savings_goal_rappen: 300_000,
  savings_goal_date: '2027-06-30',
  leftover_policy: 'savings',
  payment_methods: ['card', 'twint'],
  pain_level: 'brutal',
  sound_enabled: false,
  language: 'en',
  timezone: 'Europe/Zurich',
};

const FIXED_COSTS = [
  { kind: 'rent', label: null, amount_rappen: 185_000 },
  { kind: 'health_insurance', label: null, amount_rappen: 42_000 },
  { kind: 'other', label: 'Fitnessabo', amount_rappen: 9_900 },
];

const CATEGORIES = [
  { default_key: 'groceries', name: null, budget_rappen: 60_000 },
  { default_key: 'eating_out', name: null, budget_rappen: 20_000 },
  { default_key: null, name: 'Velo', budget_rappen: 5_000 },
];

const NOTIFICATIONS = {
  transaction_moments: true,
  category_thresholds: true,
  total_low: false,
  pace: true,
  unusual_purchase: false,
  daily_allowance: true,
  payday: true,
  weekly_review: false,
  categorize_requests: true,
  quiet_hours_enabled: true,
  quiet_hours_start: '21:30',
  quiet_hours_end: '06:45',
  max_per_day: 4,
};

/** A complete, valid payload; `profile` entries are merged into the default profile. */
function payload(
  overrides: { profile?: Row; fixed_costs?: unknown; categories?: unknown } & Row = {},
): Row {
  const { profile, ...rest } = overrides;
  return {
    profile: { ...PROFILE, ...profile },
    fixed_costs: FIXED_COSTS,
    categories: CATEGORIES,
    notification_settings: NOTIFICATIONS,
    ...rest,
  };
}

const CALL = 'select public.complete_onboarding($1::jsonb)::text as id';

/** Calls complete_onboarding as `userId`, returns the new period id (leaves acting as the user). */
async function completeOnboarding(db: Db, userId: string, input: unknown): Promise<string> {
  await asUser(db, userId);
  const row = await queryOne<{ id: string }>(db, CALL, [JSON.stringify(input)]);
  return row.id;
}

/** Everything onboarding may write for `userId` (read as postgres). */
async function footprint(db: Db, userId: string): Promise<Row> {
  await asPostgres(db);
  return queryOne<Row>(
    db,
    `select (select to_jsonb(p) from public.profiles p where p.id = $1) as profile,
            (select to_jsonb(n) from public.notification_settings n where n.user_id = $1) as settings,
            (select count(*)::int from public.fixed_costs where user_id = $1) as fixed_costs,
            (select count(*)::int from public.categories where user_id = $1) as categories,
            (select count(*)::int from public.budget_periods where user_id = $1) as periods,
            (select count(*)::int from public.budgets where user_id = $1) as budgets`,
    [userId],
  );
}

/** Expects the call to fail with `code` (and `message`, when given) and to leave nothing behind. */
async function expectRejected(
  db: Db,
  userId: string,
  input: unknown,
  code: SqlState,
  message?: string,
): Promise<void> {
  const before = await footprint(db, userId);
  await asUser(db, userId);
  const error = await expectSqlError(db, code, CALL, [JSON.stringify(input)]);
  if (message !== undefined) expect(error.message).toBe(message);
  expect(await footprint(db, userId)).toEqual(before);
}

describe('complete_onboarding() happy path', () => {
  it('writes the profile fields and marks onboarding complete', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await completeOnboarding(db, a, payload());
      await asPostgres(db);
      const profile = await queryOne<Row>(
        db,
        `select net_income_rappen::int, payday, irregular_income, weekly_work_minutes,
                savings_monthly_rappen::int, savings_goal_name, savings_goal_rappen::int,
                savings_goal_date::text, leftover_policy, payment_methods, pain_level,
                sound_enabled, language, timezone, display_name,
                onboarding_completed_at = now() as completed_now
           from public.profiles where id = $1`,
        [a],
      );
      expect(profile).toEqual({ ...PROFILE, display_name: null, completed_now: true });
    });
  });

  it('creates exactly the given fixed costs, all active', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await completeOnboarding(db, a, payload());
      await asPostgres(db);
      const rows = await queryRows<Row>(
        db,
        `select kind, label, amount_rappen::int, due_day, merchant_hint, active
           from public.fixed_costs where user_id = $1 order by amount_rappen desc`,
        [a],
      );
      expect(rows).toEqual(
        FIXED_COSTS.map((cost) => ({ ...cost, due_day: null, merchant_hint: null, active: true })),
      );
    });
  });

  it('creates the categories in the given order (sort_order = 0-based position)', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await completeOnboarding(db, a, payload());
      await asPostgres(db);
      const rows = await queryRows<Row>(
        db,
        `select default_key, name, icon, sort_order, archived_at
           from public.categories where user_id = $1 order by sort_order`,
        [a],
      );
      expect(rows).toEqual(
        CATEGORIES.map((category, index) => ({
          default_key: category.default_key,
          name: category.name,
          icon: null,
          sort_order: index,
          archived_at: null,
        })),
      );
    });
  });

  it('opens the period containing today (in the given time zone) with the plan snapshot', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const periodId = await completeOnboarding(db, a, payload());
      await asPostgres(db);
      const today = await todayIn(db, 'Europe/Zurich');
      const expected = periodContaining(today, PROFILE.payday);
      const rows = await queryRows<Row>(
        db,
        `select id::text, starts_on::text, ends_on::text, income_rappen::int,
                fixed_costs_rappen::int, savings_rappen::int, carried_over_rappen::int,
                closed_at, leftover_action, leftover_rappen
           from public.budget_periods where user_id = $1`,
        [a],
      );
      expect(rows).toEqual([
        {
          id: periodId,
          starts_on: expected.startsOn,
          ends_on: expected.endsOn,
          income_rappen: 520_000,
          fixed_costs_rappen: 185_000 + 42_000 + 9_900,
          savings_rappen: 50_000,
          carried_over_rappen: 0,
          closed_at: null,
          leftover_action: null,
          leftover_rappen: null,
        },
      ]);
    });
  });

  it('creates one budget per category in the new period', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const periodId = await completeOnboarding(db, a, payload());
      await asPostgres(db);
      const rows = await queryRows<Row>(
        db,
        `select c.sort_order, b.period_id::text, b.amount_rappen::int, b.rollover_rappen::int
           from public.budgets b join public.categories c on c.id = b.category_id
          where b.user_id = $1 order by c.sort_order`,
        [a],
      );
      expect(rows).toEqual(
        CATEGORIES.map((category, index) => ({
          sort_order: index,
          period_id: periodId,
          amount_rappen: category.budget_rappen,
          rollover_rappen: 0,
        })),
      );
    });
  });

  it('saves the notification settings', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await completeOnboarding(db, a, payload());
      await asPostgres(db);
      const settings = await queryOne<Row>(
        db,
        `select transaction_moments, category_thresholds, total_low, pace, unusual_purchase,
                daily_allowance, payday, weekly_review, categorize_requests, quiet_hours_enabled,
                to_char(quiet_hours_start, 'HH24:MI') as quiet_hours_start,
                to_char(quiet_hours_end, 'HH24:MI') as quiet_hours_end, max_per_day
           from public.notification_settings where user_id = $1`,
        [a],
      );
      expect(settings).toEqual(NOTIFICATIONS);
    });
  });

  it('computes today in the given time zone (Pacific/Kiritimati, UTC+14)', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await completeOnboarding(
        db,
        a,
        payload({ profile: { timezone: 'Pacific/Kiritimati', payday: 1 } }),
      );
      await asPostgres(db);
      const expected = periodContaining(await todayIn(db, 'Pacific/Kiritimati'), 1);
      const row = await queryOne<Row>(
        db,
        `select starts_on::text, ends_on::text from public.budget_periods where user_id = $1`,
        [a],
      );
      expect(row).toEqual({ starts_on: expected.startsOn, ends_on: expected.endsOn });
    });
  });

  it('works without fixed costs and keeps current settings for missing keys', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const { fixed_costs: _fixed, notification_settings: _settings, ...rest } = payload();
      await completeOnboarding(db, a, { ...rest, notification_settings: { pace: false } });
      await asPostgres(db);
      const row = await queryOne<Row>(
        db,
        `select (select fixed_costs_rappen::int from public.budget_periods where user_id = $1)
                  as fixed_costs_rappen,
                (select count(*)::int from public.fixed_costs where user_id = $1) as fixed_costs,
                n.pace, n.total_low, n.max_per_day, n.quiet_hours_start::text
           from public.notification_settings n where n.user_id = $1`,
        [a],
      );
      expect(row).toEqual({
        fixed_costs_rappen: 0,
        fixed_costs: 0,
        pace: false,
        total_low: true,
        max_per_day: 6,
        quiet_hours_start: '22:00:00',
      });
    });
  });

  it('ignores profile fields that are not onboarding answers', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const b = await createUser(db);
      await completeOnboarding(
        db,
        a,
        payload({
          profile: {
            id: b,
            display_name: 'Mallory',
            onboarding_completed_at: '2000-01-01T00:00:00Z',
            created_at: '2000-01-01T00:00:00Z',
          },
        }),
      );
      await asPostgres(db);
      const row = await queryOne<Row>(
        db,
        `select display_name, onboarding_completed_at = now() as completed_now,
                created_at < now() - interval '1 year' as backdated
           from public.profiles where id = $1`,
        [a],
      );
      expect(row).toEqual({ display_name: null, completed_now: true, backdated: false });
      const other = await queryOne<Row>(
        db,
        'select onboarding_completed_at from public.profiles where id = $1',
        [b],
      );
      expect(other.onboarding_completed_at).toBeNull();
    });
  });
});

describe('complete_onboarding() refuses', () => {
  it('a second onboarding (55000 already_onboarded)', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await completeOnboarding(db, a, payload());
      await expectRejected(
        db,
        a,
        payload({ profile: { payday: 1 } }),
        SQLSTATE.objectNotInPrerequisiteState,
        'already_onboarded',
      );
    });
  });

  it.each([
    ['an empty category list', { categories: [] }],
    ['a missing category list', { categories: undefined }],
    ['a category list that is not a list', { categories: { default_key: 'groceries' } }],
  ])('%s (22023 no_categories)', async (_label, overrides) => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await expectRejected(
        db,
        a,
        payload(overrides),
        SQLSTATE.invalidParameterValue,
        'no_categories',
      );
    });
  });

  it.each([
    [
      '51 categories',
      { categories: Array.from({ length: 51 }, (_, i) => ({ name: `K${i}`, budget_rappen: 0 })) },
    ],
    [
      '51 fixed costs',
      {
        fixed_costs: Array.from({ length: 51 }, () => ({
          kind: 'other',
          label: null,
          amount_rappen: 100,
        })),
      },
    ],
  ])('%s (22023 too_many_items, checked before anything is stored)', async (_label, overrides) => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await expectRejected(
        db,
        a,
        payload(overrides),
        SQLSTATE.invalidParameterValue,
        'too_many_items',
      );
    });
  });

  it.each([
    ['net income missing', { profile: { net_income_rappen: undefined } }],
    ['net income null', { profile: { net_income_rappen: null } }],
    ['payday missing', { profile: { payday: undefined } }],
    ['payday null', { profile: { payday: null } }],
  ])('%s (22023 net_income_required)', async (_label, overrides) => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await expectRejected(
        db,
        a,
        payload(overrides),
        SQLSTATE.invalidParameterValue,
        'net_income_required',
      );
    });
  });

  it('a missing profile (22023 net_income_required)', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const { profile: _profile, ...rest } = payload();
      await expectRejected(db, a, rest, SQLSTATE.invalidParameterValue, 'net_income_required');
    });
  });

  it('an unknown time zone (22023 invalid_timezone)', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await expectRejected(
        db,
        a,
        payload({ profile: { timezone: 'Mars/Olympus' } }),
        SQLSTATE.invalidParameterValue,
        'invalid_timezone',
      );
    });
  });

  it('an invalid category key, and rolls back everything written before it', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await expectRejected(
        db,
        a,
        payload({
          categories: [...CATEGORIES, { default_key: 'yachts', name: null, budget_rappen: 1 }],
        }),
        SQLSTATE.checkViolation,
      );
      await asPostgres(db);
      const profile = await queryOne<Row>(
        db,
        'select net_income_rappen, payday, onboarding_completed_at from public.profiles where id = $1',
        [a],
      );
      expect(profile).toEqual({
        net_income_rappen: null,
        payday: null,
        onboarding_completed_at: null,
      });
    });
  });

  it.each([
    ['payday 32', { profile: { payday: 32 } }, SQLSTATE.checkViolation],
    ['a negative net income', { profile: { net_income_rappen: -1 } }, SQLSTATE.checkViolation],
    [
      'net income in francs',
      { profile: { net_income_rappen: 5200.5 } },
      SQLSTATE.invalidTextRepresentation,
    ],
    [
      'an unknown leftover policy',
      { profile: { leftover_policy: 'yolo' } },
      SQLSTATE.checkViolation,
    ],
    [
      'an unknown payment method',
      { profile: { payment_methods: ['bitcoin'] } },
      SQLSTATE.checkViolation,
    ],
    ['an unsupported language', { profile: { language: 'fr' } }, SQLSTATE.checkViolation],
    ['a null pain level', { profile: { pain_level: null } }, SQLSTATE.notNullViolation],
    [
      'an unknown fixed cost kind',
      { fixed_costs: [{ kind: 'yacht', label: null, amount_rappen: 1 }] },
      SQLSTATE.checkViolation,
    ],
    [
      'a negative fixed cost',
      { fixed_costs: [{ kind: 'rent', label: null, amount_rappen: -1 }] },
      SQLSTATE.checkViolation,
    ],
    [
      'a category without key or name',
      { categories: [{ default_key: null, name: null, budget_rappen: 1 }] },
      SQLSTATE.checkViolation,
    ],
    [
      'a category without budget',
      { categories: [{ default_key: 'groceries', name: null }] },
      SQLSTATE.notNullViolation,
    ],
    [
      'the same category twice',
      {
        categories: [
          { default_key: 'groceries', name: null, budget_rappen: 1 },
          { default_key: 'groceries', name: null, budget_rappen: 2 },
        ],
      },
      SQLSTATE.uniqueViolation,
    ],
    [
      'max_per_day 0',
      { notification_settings: { ...NOTIFICATIONS, max_per_day: 0 } },
      SQLSTATE.checkViolation,
    ],
  ] as const)('%s, leaving nothing behind', async (_label, overrides, code) => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await expectRejected(db, a, payload(overrides as Row), code);
    });
  });

  it('anon (42501)', async () => {
    await withRollback(async (db) => {
      await asAnon(db);
      await expectSqlError(db, SQLSTATE.insufficientPrivilege, CALL, [JSON.stringify(payload())]);
    });
  });

  it('a request without a signed-in user (42501)', async () => {
    await withRollback(async (db) => {
      await asAuthenticatedWithoutUser(db);
      const error = await expectSqlError(db, SQLSTATE.insufficientPrivilege, CALL, [
        JSON.stringify(payload()),
      ]);
      expect(error.message).toBe('not signed in');
    });
  });
});

describe('complete_onboarding() and other users', () => {
  it('only ever writes the caller’s rows', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const b = await createUser(db);
      await make.category(db, b, { default_key: 'groceries', name: undefined });
      const before = await footprint(db, b);
      await completeOnboarding(db, a, payload());
      expect(await footprint(db, b)).toEqual(before);
      // Rows created in this transaction (created_at = now()), by table and owner.
      await asPostgres(db);
      const created = await queryRows<{ table: string; owner: string; rows: number }>(
        db,
        `select 'fixed_costs' as table, user_id::text as owner, count(*)::int as rows
           from public.fixed_costs where created_at = now() group by user_id
         union all
         select 'categories', user_id::text, count(*)::int
           from public.categories where created_at = now() group by user_id
         union all
         select 'budget_periods', user_id::text, count(*)::int
           from public.budget_periods where created_at = now() group by user_id
         union all
         select 'budgets', user_id::text, count(*)::int
           from public.budgets where created_at = now() group by user_id`,
      );
      const byKey = (x: { table: string; owner: string }, y: { table: string; owner: string }) =>
        `${x.table}/${x.owner}`.localeCompare(`${y.table}/${y.owner}`);
      expect(created.sort(byKey)).toEqual(
        [
          { table: 'fixed_costs', owner: a, rows: FIXED_COSTS.length },
          { table: 'categories', owner: a, rows: CATEGORIES.length },
          { table: 'categories', owner: b, rows: 1 }, // B's own, created before the call
          { table: 'budget_periods', owner: a, rows: 1 },
          { table: 'budgets', owner: a, rows: CATEGORIES.length },
        ].sort(byKey),
      );
    });
  });
});

describe('complete_onboarding() with owner rights (D-036)', () => {
  it('runs as SECURITY DEFINER with an empty search_path', async () => {
    const row = await withRollback((db) =>
      queryOne<Row>(
        db,
        `select prosecdef as definer, proconfig as config from pg_proc
          where oid = 'public.complete_onboarding(jsonb)'::regprocedure`,
      ),
    );
    expect(row).toEqual({ definer: true, config: ['search_path=""'] });
  });

  it('cannot be steered at another user’s rows through the payload', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const b = await createUser(db);
      const before = await footprint(db, b);
      await completeOnboarding(db, a, {
        ...payload(),
        user_id: b,
        id: b,
        fixed_costs: FIXED_COSTS.map((cost) => ({ ...cost, user_id: b, id: b })),
        categories: CATEGORIES.map((category) => ({ ...category, user_id: b, id: b })),
        notification_settings: { ...NOTIFICATIONS, user_id: b },
      });
      expect(await footprint(db, b)).toEqual(before);
      await asPostgres(db);
      const owners = await queryRows<{ owner: string }>(
        db,
        `select distinct user_id::text as owner from (
           select user_id from public.fixed_costs where created_at = now()
           union all select user_id from public.categories where created_at = now()
           union all select user_id from public.budget_periods where created_at = now()
           union all select user_id from public.budgets where created_at = now()
         ) as created`,
      );
      expect(owners).toEqual([{ owner: a }]);
    });
  });

  it('opens the first period although clients cannot write budget_periods themselves', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await asUser(db, a);
      await expectSqlError(
        db,
        SQLSTATE.insufficientPrivilege,
        `insert into public.budget_periods
           (user_id, starts_on, ends_on, income_rappen, fixed_costs_rappen, savings_rappen)
         values ($1, '2026-09-25', '2026-10-25', 1, 0, 0)`,
        [a],
      );
      const periodId = await completeOnboarding(db, a, payload());
      const row = await queryOne<{ n: number }>(
        db,
        'select count(*)::int as n from public.budget_periods where id = $1',
        [periodId],
      );
      expect(row.n).toBe(1);
    });
  });
});

describe('an onboarded profile keeps its income and payday', () => {
  it.each(['net_income_rappen', 'payday'])('clearing %s is refused (23514)', async (column) => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await completeOnboarding(db, a, payload());
      await expectSqlError(
        db,
        SQLSTATE.checkViolation,
        `update public.profiles set ${column} = null where id = $1`,
        [a],
      );
    });
  });
});
