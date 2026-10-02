/**
 * The monthly reset on payday (spec section 4): ensure_current_period() and the hourly
 * roll_due_periods() job close ended periods, settle the leftover by the user's policy and open
 * the next period with a fresh plan snapshot and copied budgets. Also move_budget().
 *
 * Past periods are created directly (as postgres) relative to the database's now(), so every
 * test works on any day of the year.
 */
import { randomUUID } from 'node:crypto';
import {
  type LeftoverPolicy,
  addDays,
  compareLocalDates,
  daysBetween,
  periodContaining,
  type Period,
} from '@budget/core';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import {
  DATABASE_URL,
  type Db,
  type Row,
  SQLSTATE,
  asAnon,
  asAuthenticatedWithoutUser,
  asPostgres,
  asUser,
  createUser,
  expectSqlError,
  make,
  onboard,
  queryOne,
  queryRows,
  todayIn,
  withRollback,
} from './db';

const ZONE = 'Europe/Zurich';

type PeriodRow = {
  id: string;
  starts_on: string;
  ends_on: string;
  income_rappen: number;
  fixed_costs_rappen: number;
  savings_rappen: number;
  carried_over_rappen: number;
  closed_now: boolean | null;
  leftover_action: string | null;
  leftover_rappen: number | null;
};

/** The user's periods, oldest first (read as postgres). closed_now: closed_at = now(). */
async function periodsOf(db: Db, userId: string): Promise<PeriodRow[]> {
  await asPostgres(db);
  return queryRows<PeriodRow>(
    db,
    `select id::text, starts_on::text, ends_on::text, income_rappen::float8 as income_rappen,
            fixed_costs_rappen::float8 as fixed_costs_rappen, savings_rappen::float8 as savings_rappen,
            carried_over_rappen::float8 as carried_over_rappen, closed_at = now() as closed_now,
            leftover_action, leftover_rappen::float8 as leftover_rappen
       from public.budget_periods where user_id = $1 order by starts_on`,
    [userId],
  );
}

/** category_id → [amount_rappen, rollover_rappen] of a period's budgets (as postgres). */
async function budgetsOf(db: Db, periodId: string): Promise<Record<string, [number, number]>> {
  await asPostgres(db);
  const rows = await queryRows<{ category_id: string; amount: number; rollover: number }>(
    db,
    `select category_id::text, amount_rappen::float8 as amount, rollover_rappen::float8 as rollover
       from public.budgets where period_id = $1`,
    [periodId],
  );
  return Object.fromEntries(rows.map((row) => [row.category_id, [row.amount, row.rollover]]));
}

/** ensure_current_period() called by `userId`. */
async function ensureCurrentPeriod(db: Db, userId: string): Promise<string | null> {
  await asUser(db, userId);
  const row = await queryOne<{ id: string | null }>(
    db,
    'select public.ensure_current_period()::text as id',
  );
  return row.id;
}

/** The period `count` periods before the one containing `today` (payday unchanged). */
function periodsBefore(today: string, payday: number, count: number): Period {
  let period = periodContaining(today, payday);
  for (let i = 0; i < count; i += 1) period = periodContaining(addDays(period.startsOn, -1), payday);
  return period;
}

/**
 * A user who last used the app `missed` periods ago: onboarded (income 6'000, savings 700,
 * payday 25, Europe/Zurich), active fixed costs 2'270 (+ an inactive 99), four categories (one
 * archived) and one period that started `missed` periods before today's and was never closed:
 *
 *   plan 5'200 − 2'100 − 500 + 10 carried = 2'610; spent 120 + 30 − 20 + 10 = 140
 *   (rent payment and salary do not count)  →  leftover 2'470 = 247'000 Rappen.
 *
 * Its budgets: groceries 400 (+5 rollover), velo 200, clothes (archived) 100; books has none.
 */
async function lapsedUser(
  db: Db,
  options: { missed?: number; policy?: LeftoverPolicy; payday?: number } = {},
) {
  const { missed = 1, policy = 'rollover', payday = 25 } = options;
  const user = await createUser(db);
  await onboard(db, user, {
    net_income_rappen: 600_000,
    savings_monthly_rappen: 70_000,
    payday,
    leftover_policy: policy,
    timezone: ZONE,
  });
  const today = await todayIn(db, ZONE);
  const first = periodsBefore(today, payday, missed);

  const rent = await make.fixedCost(db, user, { amount_rappen: 185_000 });
  await make.fixedCost(db, user, { kind: 'health_insurance', amount_rappen: 42_000 });
  await make.fixedCost(db, user, { kind: 'subscriptions', amount_rappen: 9_900, active: false });

  const groceries = await make.category(db, user, { name: 'Lebensmittel' });
  const velo = await make.category(db, user, { name: 'Velo' });
  const clothes = await make.category(db, user, {
    name: 'Kleider',
    archived_at: '2026-01-01T00:00:00Z',
  });
  const books = await make.category(db, user, { name: 'Bücher' });

  const firstId = await make.period(db, user, {
    starts_on: first.startsOn,
    ends_on: first.endsOn,
    income_rappen: 520_000,
    fixed_costs_rappen: 210_000,
    savings_rappen: 50_000,
    carried_over_rappen: 1_000,
  });
  await make.budget(db, user, firstId, groceries, { amount_rappen: 40_000, rollover_rappen: 500 });
  await make.budget(db, user, firstId, velo, { amount_rappen: 20_000 });
  await make.budget(db, user, firstId, clothes, { amount_rappen: 10_000 });

  const on = (period: Period, day: number) => `${addDays(period.startsOn, day)}T10:00:00Z`;
  await make.transaction(db, user, {
    amount_rappen: -12_000,
    booked_at: on(first, 1),
    category_id: groceries,
  });
  await make.transaction(db, user, { amount_rappen: -3_000, booked_at: on(first, 2) });
  await make.transaction(db, user, {
    amount_rappen: 2_000,
    booked_at: on(first, 3),
    category_id: groceries,
  });
  await make.transaction(db, user, {
    amount_rappen: -1_000,
    booked_at: on(first, 3),
    category_id: clothes,
  });
  await make.transaction(db, user, {
    amount_rappen: -185_000,
    booked_at: on(first, 0),
    fixed_cost_id: rent,
  });
  await make.transaction(db, user, {
    amount_rappen: 600_000,
    booked_at: on(first, 0),
    source: 'bank',
  });

  return { user, today, first, firstId, on, categories: { groceries, velo, clothes, books } };
}

describe('ensure_current_period()', () => {
  it('returns null before onboarding, even with a past period', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await make.period(db, a, { starts_on: '2026-01-25', ends_on: '2026-02-25' });
      expect(await ensureCurrentPeriod(db, a)).toBeNull();
      expect(await periodsOf(db, a)).toHaveLength(1);
    });
  });

  it('returns null for an onboarded user without a period', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await onboard(db, a);
      expect(await ensureCurrentPeriod(db, a)).toBeNull();
    });
  });

  it('returns the current period unchanged while it has not ended', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await onboard(db, a, { payday: 25 });
      const current = periodContaining(await todayIn(db, ZONE), 25);
      const id = await make.period(db, a, { starts_on: current.startsOn, ends_on: current.endsOn });
      const before = await periodsOf(db, a);
      expect(await ensureCurrentPeriod(db, a)).toBe(id);
      expect(await periodsOf(db, a)).toEqual(before);
    });
  });

  it('rolls one missed period: closes it and opens the current one from today’s profile', async () => {
    await withRollback(async (db) => {
      const { user, today, first, firstId, categories } = await lapsedUser(db);
      const current = periodContaining(today, 25);
      // Spending in the new period does not change the old period's leftover.
      await make.transaction(db, user, {
        amount_rappen: -50_000,
        booked_at: `${current.startsOn}T10:00:00Z`,
      });

      const id = await ensureCurrentPeriod(db, user);
      expect(await periodsOf(db, user)).toEqual([
        {
          id: firstId,
          starts_on: first.startsOn,
          ends_on: first.endsOn,
          income_rappen: 520_000,
          fixed_costs_rappen: 210_000,
          savings_rappen: 50_000,
          carried_over_rappen: 1_000,
          closed_now: true,
          leftover_action: 'rollover',
          leftover_rappen: 247_000,
        },
        {
          id,
          starts_on: current.startsOn,
          ends_on: current.endsOn,
          income_rappen: 600_000,
          fixed_costs_rappen: 185_000 + 42_000,
          savings_rappen: 70_000,
          carried_over_rappen: 247_000,
          closed_now: null,
          leftover_action: null,
          leftover_rappen: null,
        },
      ]);
      expect(first.endsOn).toBe(current.startsOn);
      expect(await budgetsOf(db, id ?? '')).toEqual({
        [categories.groceries]: [40_000, 0],
        [categories.velo]: [20_000, 0],
      });
    });
  });

  it('rolls several missed periods one by one, each with its own spending', async () => {
    await withRollback(async (db) => {
      const { user, today, first, on, categories } = await lapsedUser(db, { missed: 3 });
      const second = periodContaining(first.endsOn, 25);
      await make.transaction(db, user, { amount_rappen: -10_000, booked_at: on(second, 1) });

      const id = await ensureCurrentPeriod(db, user);
      const periods = await periodsOf(db, user);
      const third = periodContaining(second.endsOn, 25);
      const current = periodContaining(today, 25);
      expect(third.endsOn).toBe(current.startsOn);
      // Plan of each new period: 6'000 − 2'270 − 700 = 3'030.
      expect(
        periods.map((p) => [
          p.starts_on,
          p.ends_on,
          p.carried_over_rappen,
          p.leftover_action,
          p.leftover_rappen,
        ]),
      ).toEqual([
        [first.startsOn, first.endsOn, 1_000, 'rollover', 247_000],
        [second.startsOn, second.endsOn, 247_000, 'rollover', 303_000 + 247_000 - 10_000],
        [third.startsOn, third.endsOn, 540_000, 'rollover', 303_000 + 540_000],
        [current.startsOn, current.endsOn, 843_000, null, null],
      ]);
      expect(periods.map((p) => p.closed_now)).toEqual([true, true, true, null]);
      expect(periods[3]?.id).toBe(id);
      for (const period of periods.slice(1)) {
        expect(await budgetsOf(db, period.id)).toEqual({
          [categories.groceries]: [40_000, 0],
          [categories.velo]: [20_000, 0],
        });
      }
    });
  });

  it.each([
    ['rollover', 247_000],
    ['savings', 0],
    ['reset', 0],
  ] as const)(
    'with policy %s records the leftover and carries %i',
    async (policy, carried) => {
      await withRollback(async (db) => {
        const { user } = await lapsedUser(db, { policy });
        await ensureCurrentPeriod(db, user);
        const [closed, opened] = await periodsOf(db, user);
        expect([closed?.closed_now, closed?.leftover_action, closed?.leftover_rappen]).toEqual([
          true,
          policy,
          247_000,
        ]);
        expect(opened?.carried_over_rappen).toBe(carried);
      });
    },
  );

  it.each([
    ['rollover', -53_000],
    ['savings', 0],
    ['reset', 0],
  ] as const)('after an overspent month, policy %s carries %i', async (policy, carried) => {
    await withRollback(async (db) => {
      const { user, first, on } = await lapsedUser(db, { policy });
      await make.transaction(db, user, { amount_rappen: -300_000, booked_at: on(first, 5) });
      await ensureCurrentPeriod(db, user);
      const [closed, opened] = await periodsOf(db, user);
      expect([closed?.leftover_action, closed?.leftover_rappen]).toEqual([policy, -53_000]);
      expect(opened?.carried_over_rappen).toBe(carried);
    });
  });

  it('uses the policy of the profile at the time of the reset', async () => {
    await withRollback(async (db) => {
      const { user } = await lapsedUser(db, { policy: 'rollover' });
      await db.query(`update public.profiles set leftover_policy = 'reset' where id = $1`, [user]);
      await ensureCurrentPeriod(db, user);
      const [closed, opened] = await periodsOf(db, user);
      expect(closed?.leftover_action).toBe('reset');
      expect(opened?.carried_over_rappen).toBe(0);
    });
  });

  it('keeps the recorded outcome of a period that was already closed', async () => {
    await withRollback(async (db) => {
      const { user, firstId } = await lapsedUser(db, { policy: 'reset' });
      await db.query(
        `update public.budget_periods
            set closed_at = '2026-01-01T00:00:00Z', leftover_action = 'rollover', leftover_rappen = 5000
          where id = $1`,
        [firstId],
      );
      await ensureCurrentPeriod(db, user);
      const [closed, opened] = await periodsOf(db, user);
      expect([closed?.closed_now, closed?.leftover_action, closed?.leftover_rappen]).toEqual([
        false,
        'rollover',
        5_000,
      ]);
      expect(opened?.carried_over_rappen).toBe(5_000);
    });
  });

  it('after a payday change, opens one transition period up to the new payday', async () => {
    await withRollback(async (db) => {
      const { user, today, first } = await lapsedUser(db, { payday: 25 });
      await db.query('update public.profiles set payday = 1 where id = $1', [user]);
      await ensureCurrentPeriod(db, user);

      const expected: Period[] = [];
      let latestEnd = first.endsOn;
      while (compareLocalDates(latestEnd, today) <= 0) {
        const endsOn = periodContaining(latestEnd, 1).endsOn;
        expected.push({ startsOn: latestEnd, endsOn });
        latestEnd = endsOn;
      }
      const opened = (await periodsOf(db, user)).slice(1);
      expect(opened.map((p) => ({ startsOn: p.starts_on, endsOn: p.ends_on }))).toEqual(expected);
      const [transition] = expected;
      // From the old payday (the 25th) to the 1st: a short transition period.
      expect(transition?.startsOn.endsWith('-25')).toBe(true);
      expect(transition?.endsOn.endsWith('-01')).toBe(true);
      expect(daysBetween(transition?.startsOn ?? '', transition?.endsOn ?? '')).toBeLessThan(8);
      expect(expected.at(-1)).toEqual(periodContaining(today, 1));
    });
  });

  it('is idempotent: a second call returns the same period and changes nothing', async () => {
    await withRollback(async (db) => {
      const { user } = await lapsedUser(db, { missed: 2 });
      const id = await ensureCurrentPeriod(db, user);
      await asPostgres(db);
      const snapshot = async () =>
        queryOne<Row>(
          db,
          `select (select jsonb_agg(to_jsonb(p) order by p.starts_on)
                     from public.budget_periods p where p.user_id = $1) as periods,
                  (select jsonb_agg(to_jsonb(b) order by b.id)
                     from public.budgets b where b.user_id = $1) as budgets`,
          [user],
        );
      const before = await snapshot();
      expect(await ensureCurrentPeriod(db, user)).toBe(id);
      await asPostgres(db);
      expect(await snapshot()).toEqual(before);
    });
  });

  it('rolls only the caller’s periods', async () => {
    await withRollback(async (db) => {
      const { user: a } = await lapsedUser(db);
      const { user: b } = await lapsedUser(db);
      const before = await periodsOf(db, b);
      await ensureCurrentPeriod(db, a);
      expect(await periodsOf(db, a)).toHaveLength(2);
      expect(await periodsOf(db, b)).toEqual(before);
    });
  });

  it('raises 42501 without a signed-in user and cannot be called by anon', async () => {
    await withRollback(async (db) => {
      await asAuthenticatedWithoutUser(db);
      const error = await expectSqlError(
        db,
        SQLSTATE.insufficientPrivilege,
        'select public.ensure_current_period()',
      );
      expect(error.message).toBe('not signed in');
      await asAnon(db);
      await expectSqlError(
        db,
        SQLSTATE.insufficientPrivilege,
        'select public.ensure_current_period()',
      );
    });
  });
});

describe('concurrent resets', () => {
  async function connect(): Promise<pg.Client> {
    const client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();
    return client;
  }

  /** Waits until backend `pid` is blocked on a lock (here: the other call's advisory lock). */
  async function waitUntilBlocked(observer: pg.Client, pid: number): Promise<void> {
    for (let attempt = 0; attempt < 400; attempt += 1) {
      const { rows } = await observer.query<{ wait: string | null }>(
        'select wait_event_type as wait from pg_stat_activity where pid = $1',
        [pid],
      );
      if (rows[0]?.wait === 'Lock') return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`backend ${pid} never waited for the other call`);
  }

  it('two connections rolling the same user at once open the next period only once', async () => {
    const admin = await connect();
    const userId = randomUUID();
    try {
      // Committed fixture: an onboarded user whose period ended (removed again in `finally`).
      await admin.query('begin');
      await admin.query(
        `insert into auth.users (id, email, aud, role)
         values ($1, $2, 'authenticated', 'authenticated')`,
        [userId, `${userId}@example.test`],
      );
      await onboard(admin, userId, { payday: 25 });
      const today = await todayIn(admin, ZONE);
      const previous = periodsBefore(today, 25, 1);
      await make.period(admin, userId, { starts_on: previous.startsOn, ends_on: previous.endsOn });
      await admin.query('commit');

      const first = await connect();
      const second = await connect();
      try {
        for (const client of [first, second]) {
          await client.query('begin');
          await asUser(client, userId);
        }
        const { rows: pidRows } = await second.query<{ pid: number }>(
          'select pg_backend_pid() as pid',
        );
        const secondPid = pidRows[0]?.pid ?? 0;
        const call = 'select public.ensure_current_period()::text as id';
        const firstResult = await first.query<{ id: string }>(call);
        const secondPending = second.query<{ id: string }>(call);
        await waitUntilBlocked(admin, secondPid);
        await first.query('commit');
        const secondResult = await secondPending;
        await second.query('commit');

        expect(secondResult.rows[0]?.id).toBe(firstResult.rows[0]?.id);
        const { rows } = await admin.query<{ starts_on: string; closed: boolean }>(
          `select starts_on::text, closed_at is not null as closed
             from public.budget_periods where user_id = $1 order by starts_on`,
          [userId],
        );
        expect(rows).toEqual([
          { starts_on: previous.startsOn, closed: true },
          { starts_on: previous.endsOn, closed: false },
        ]);
      } finally {
        await first.end();
        await second.end();
      }
    } finally {
      await admin.query('rollback').catch(() => undefined);
      await admin.query('delete from auth.users where id = $1', [userId]);
      await admin.end();
    }
  });
});

describe('roll_due_periods()', () => {
  /** An onboarded user (as postgres) whose latest period ends on `endsOn`. */
  async function userWithPeriodEnding(
    db: Db,
    endsOn: string,
    profile: Row = {},
  ): Promise<{ user: string; periodId: string }> {
    const user = await createUser(db);
    await onboard(db, user, profile);
    const periodId = await make.period(db, user, { starts_on: addDays(endsOn, -30), ends_on: endsOn });
    return { user, periodId };
  }

  it('rolls exactly the onboarded users whose period has ended in their time zone', async () => {
    await withRollback(async (db) => {
      await asPostgres(db);
      // Anything already due in this database is rolled first, inside this test's transaction.
      await db.query('select public.roll_due_periods()');

      const todayZurich = await todayIn(db, ZONE);
      const todayKiritimati = await todayIn(db, 'Pacific/Kiritimati');
      const due = await userWithPeriodEnding(db, todayZurich);
      // UTC+14: the period ending "today" there has ended; in UTC−11 that day has not begun.
      const dueEast = await userWithPeriodEnding(db, todayKiritimati, {
        timezone: 'Pacific/Kiritimati',
      });
      const notYetWest = await userWithPeriodEnding(db, todayKiritimati, {
        timezone: 'Pacific/Pago_Pago',
      });
      const running = await userWithPeriodEnding(db, addDays(todayZurich, 1));
      const notOnboarded = await createUser(db);
      await make.period(db, notOnboarded, {
        starts_on: addDays(todayZurich, -60),
        ends_on: addDays(todayZurich, -30),
      });
      // Fixed costs beyond the money bounds: this user's reset fails and is skipped.
      const failing = await userWithPeriodEnding(db, todayZurich);
      await make.fixedCost(db, failing.user, { amount_rappen: 6_000_000_000 });
      await make.fixedCost(db, failing.user, { amount_rappen: 6_000_000_000 });

      const count = await queryOne<{ rolled: number }>(
        db,
        'select public.roll_due_periods() as rolled',
      );
      expect(count.rolled).toBe(2);

      for (const { user, periodId } of [due, dueEast]) {
        const periods = await periodsOf(db, user);
        expect(periods.map((p) => [p.id === periodId, p.closed_now])).toEqual([
          [true, true],
          [false, null],
        ]);
      }
      for (const { user } of [notYetWest, running, failing]) {
        const periods = await periodsOf(db, user);
        expect(periods.map((p) => p.closed_now)).toEqual([null]);
      }
      expect(await periodsOf(db, notOnboarded)).toHaveLength(1);

      const again = await queryOne<{ rolled: number }>(
        db,
        'select public.roll_due_periods() as rolled',
      );
      expect(again.rolled).toBe(0);
    });
  });

  it('cannot be called by clients', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await asUser(db, a);
      await expectSqlError(db, SQLSTATE.insufficientPrivilege, 'select public.roll_due_periods()');
      await asAnon(db);
      await expectSqlError(db, SQLSTATE.insufficientPrivilege, 'select public.roll_due_periods()');
    });
  });

  it('is scheduled hourly at minute 5 as pg_cron job roll-due-periods', async () => {
    const jobs = await withRollback((db) =>
      queryRows<Row>(
        db,
        `select schedule, command, active, database = current_database() as this_database,
                username
           from cron.job where jobname = 'roll-due-periods'`,
      ),
    );
    expect(jobs).toEqual([
      {
        schedule: '5 * * * *',
        command: 'select public.roll_due_periods()',
        active: true,
        this_database: true,
        username: 'postgres',
      },
    ]);
  });
});

describe('move_budget()', () => {
  /** User A with two budgets in one period and one in another, user B with one budget. */
  async function budgets(db: Db) {
    const a = await createUser(db);
    const b = await createUser(db);
    const period = await make.period(db, a);
    const otherPeriod = await make.period(db, a);
    const groceries = await make.budget(db, a, period, await make.category(db, a), {
      amount_rappen: 40_000,
    });
    const velo = await make.budget(db, a, period, await make.category(db, a), {
      amount_rappen: 10_000,
    });
    const clothes = await make.budget(db, a, otherPeriod, await make.category(db, a), {
      amount_rappen: 5_000,
    });
    const ofB = await make.budget(db, b, await make.period(db, b), await make.category(db, b), {
      amount_rappen: 9_000,
    });
    return { a, b, groceries, velo, clothes, ofB };
  }

  async function amounts(db: Db, ids: string[]): Promise<number[]> {
    await asPostgres(db);
    const rows = await queryRows<{ amount: number }>(
      db,
      `select amount_rappen::float8 as amount
         from unnest($1::uuid[]) with ordinality as wanted(id, n)
         join public.budgets b on b.id = wanted.id
        order by wanted.n`,
      [ids],
    );
    return rows.map((row) => row.amount);
  }

  const MOVE = 'select public.move_budget($1, $2, $3)';

  it('moves an amount between two budgets of the same period', async () => {
    await withRollback(async (db) => {
      const { a, groceries, velo } = await budgets(db);
      await asUser(db, a);
      await db.query(MOVE, [groceries, velo, 15_000]);
      expect(await amounts(db, [groceries, velo])).toEqual([25_000, 25_000]);
      await asUser(db, a);
      await db.query(MOVE, [groceries, velo, 25_000]);
      expect(await amounts(db, [groceries, velo])).toEqual([0, 50_000]);
    });
  });

  it.each([
    ['nothing (0)', 'groceries', 'velo', 0, 'invalid_amount'],
    ['a negative amount', 'groceries', 'velo', -100, 'invalid_amount'],
    ['no amount', 'groceries', 'velo', null, 'invalid_amount'],
    ['more than the budget has', 'groceries', 'velo', 40_001, 'insufficient_budget'],
    ['onto the same budget', 'groceries', 'groceries', 100, 'same_budget'],
    ['into another period', 'groceries', 'clothes', 100, 'different_periods'],
    ['into another user’s budget', 'groceries', 'ofB', 100, 'budget_not_found'],
    ['out of another user’s budget', 'ofB', 'groceries', 100, 'budget_not_found'],
    ['from a budget that does not exist', 'missing', 'velo', 100, 'budget_not_found'],
    ['without a target budget', 'groceries', 'none', 100, 'budget_not_found'],
  ] as const)('refuses to move %s (22023 %s)', async (_label, from, to, amount, message) => {
    await withRollback(async (db) => {
      const fixture = await budgets(db);
      const ids: Record<string, string | null> = {
        groceries: fixture.groceries,
        velo: fixture.velo,
        clothes: fixture.clothes,
        ofB: fixture.ofB,
        missing: randomUUID(),
        none: null,
      };
      const all = [fixture.groceries, fixture.velo, fixture.clothes, fixture.ofB];
      const before = await amounts(db, all);
      await asUser(db, fixture.a);
      const error = await expectSqlError(db, SQLSTATE.invalidParameterValue, MOVE, [
        ids[from],
        ids[to],
        amount,
      ]);
      expect(error.message).toBe(message);
      expect(await amounts(db, all)).toEqual(before);
    });
  });

  it('cannot be called by anon (42501)', async () => {
    await withRollback(async (db) => {
      const { groceries, velo } = await budgets(db);
      await asAnon(db);
      await expectSqlError(db, SQLSTATE.insufficientPrivilege, MOVE, [groceries, velo, 100]);
      expect(await amounts(db, [groceries, velo])).toEqual([40_000, 10_000]);
    });
  });
});
