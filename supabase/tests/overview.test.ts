/**
 * get_overview(): the home screen's data. Covers every spending rule with exact numbers (see
 * docs/DATA_MODEL.md, "Spending rules"), which categories are listed, the latest transactions,
 * and that only the caller's rows are ever read.
 */
import { addDays, periodContaining } from '@budget/core';
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
  onboard,
  queryOne,
  queryRows,
  runDeferredChecks,
  todayIn,
  withRollback,
} from './db';

type OverviewCategory = {
  category_id: string;
  default_key: string | null;
  name: string | null;
  icon: string | null;
  sort_order: number;
  archived: boolean;
  budget_id: string | null;
  budget_amount_rappen: number;
  rollover_rappen: number;
  spent_rappen: number;
};

type RecentTransaction = {
  id: string;
  amount_rappen: number;
  booked_at: string;
  merchant: string | null;
  category_id: string | null;
  is_split: boolean;
  source: string;
  note: string | null;
};

type Overview = {
  today: string;
  period: {
    id: string;
    starts_on: string;
    ends_on: string;
    income_rappen: number;
    fixed_costs_rappen: number;
    savings_rappen: number;
    carried_over_rappen: number;
  };
  categories: OverviewCategory[];
  uncategorized_spent_rappen: number;
  recent_transactions: RecentTransaction[];
};

/** get_overview() called by `userId` (leaves the connection acting as that user). */
async function getOverview(db: Db, userId: string): Promise<Overview | null> {
  await asUser(db, userId);
  const row = await queryOne<{ overview: Overview | null }>(
    db,
    'select public.get_overview() as overview',
  );
  return row.overview;
}

async function mustGetOverview(db: Db, userId: string): Promise<Overview> {
  const overview = await getOverview(db, userId);
  if (overview === null) throw new Error('expected an overview, got null');
  return overview;
}

/** spent_rappen per category id, plus the uncategorized total under the key "uncategorized". */
function spending(overview: Overview): Record<string, number> {
  return {
    ...Object.fromEntries(overview.categories.map((c) => [c.category_id, c.spent_rappen])),
    uncategorized: overview.uncategorized_spent_rappen,
  };
}

interface Month {
  id: string;
  startsOn: string;
  endsOn: string;
  today: string;
}

/**
 * An onboarded user (set up as postgres) whose current period runs from 10 days before today to
 * 20 days after it, today being taken in `timeZone`. Leaves the connection acting as postgres.
 */
async function userWithCurrentPeriod(
  db: Db,
  timeZone = 'Europe/Zurich',
): Promise<{ user: string; month: Month }> {
  const user = await createUser(db);
  await onboard(db, user, { timezone: timeZone });
  const today = await todayIn(db, timeZone);
  const startsOn = addDays(today, -10);
  const endsOn = addDays(today, 20);
  const id = await make.period(db, user, {
    starts_on: startsOn,
    ends_on: endsOn,
    income_rappen: 520_000,
    fixed_costs_rappen: 210_000,
    savings_rappen: 50_000,
    carried_over_rappen: 1_234,
  });
  return { user, month: { id, startsOn, endsOn, today } };
}

/** 10:00 UTC on the given day of the period (day 0 = starts_on): that day in every European zone. */
function dayOf(month: Month, day: number, time = '10:00:00'): string {
  return `${addDays(month.startsOn, day)}T${time}Z`;
}

/** Inserts a transaction booked at local midnight of `date` in `timeZone` (+ offset), as postgres. */
async function bookAtLocalMidnight(
  db: Db,
  userId: string,
  date: string,
  timeZone: string,
  amountRappen: number,
  offset = '0 seconds',
): Promise<string> {
  await asPostgres(db);
  const row = await queryOne<{ id: string }>(
    db,
    `insert into public.transactions (user_id, amount_rappen, booked_at, source)
     values ($1, $2, ($3::date::timestamp at time zone $4) + $5::interval, 'manual')
     returning id::text`,
    [userId, amountRappen, date, timeZone, offset],
  );
  return row.id;
}

describe('get_overview() before onboarding', () => {
  it('returns null and opens no period', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      expect(await getOverview(db, a)).toBeNull();
      await asPostgres(db);
      expect(
        await countRows(db, 'select 1 from public.budget_periods where user_id = $1', [a]),
      ).toBe(0);
    });
  });

  it('returns null for an onboarded user without any period', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await onboard(db, a);
      expect(await getOverview(db, a)).toBeNull();
    });
  });
});

describe('get_overview() shape', () => {
  it('returns today, the current period with its plan, and empty lists', async () => {
    await withRollback(async (db) => {
      const { user, month } = await userWithCurrentPeriod(db);
      expect(await getOverview(db, user)).toEqual({
        today: month.today,
        period: {
          id: month.id,
          starts_on: month.startsOn,
          ends_on: month.endsOn,
          income_rappen: 520_000,
          fixed_costs_rappen: 210_000,
          savings_rappen: 50_000,
          carried_over_rappen: 1_234,
        },
        categories: [],
        uncategorized_spent_rappen: 0,
        recent_transactions: [],
      });
    });
  });

  it('rolls the month over first when payday has passed', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await onboard(db, a, { payday: 25 });
      const today = await todayIn(db, 'Europe/Zurich');
      const ended = await make.period(db, a, { starts_on: addDays(today, -30), ends_on: today });
      const overview = await mustGetOverview(db, a);
      expect(overview.period.id).not.toBe(ended);
      expect(overview.period.starts_on).toBe(today);
      expect(overview.period.ends_on).toBe(periodContaining(today, 25).endsOn);
    });
  });
});

describe('spending rules', () => {
  it('categorized purchases add up per category', async () => {
    await withRollback(async (db) => {
      const { user, month } = await userWithCurrentPeriod(db);
      const groceries = await make.category(db, user, { name: 'Lebensmittel' });
      const eatingOut = await make.category(db, user, { name: 'Auswärts' });
      await make.transaction(db, user, {
        amount_rappen: -1_250,
        booked_at: dayOf(month, 1),
        category_id: groceries,
      });
      await make.transaction(db, user, {
        amount_rappen: -3_000,
        booked_at: dayOf(month, 5),
        category_id: groceries,
      });
      await make.transaction(db, user, {
        amount_rappen: -4_500,
        booked_at: dayOf(month, 2),
        category_id: eatingOut,
      });
      expect(spending(await mustGetOverview(db, user))).toEqual({
        [groceries]: 4_250,
        [eatingOut]: 4_500,
        uncategorized: 0,
      });
    });
  });

  it('a refund gives money back to its category (and can make spent negative)', async () => {
    await withRollback(async (db) => {
      const { user, month } = await userWithCurrentPeriod(db);
      const clothes = await make.category(db, user, { name: 'Kleider' });
      const gifts = await make.category(db, user, { name: 'Geschenke' });
      await make.transaction(db, user, {
        amount_rappen: -5_000,
        booked_at: dayOf(month, 1),
        category_id: clothes,
      });
      await make.transaction(db, user, {
        amount_rappen: 1_500,
        booked_at: dayOf(month, 3),
        category_id: clothes,
      });
      await make.transaction(db, user, {
        amount_rappen: 2_000,
        booked_at: dayOf(month, 3),
        category_id: gifts,
      });
      expect(spending(await mustGetOverview(db, user))).toEqual({
        [clothes]: 3_500,
        [gifts]: -2_000,
        uncategorized: 0,
      });
    });
  });

  it('uncategorized purchases count as uncategorized spending', async () => {
    await withRollback(async (db) => {
      const { user, month } = await userWithCurrentPeriod(db);
      await make.transaction(db, user, { amount_rappen: -700, booked_at: dayOf(month, 1) });
      await make.transaction(db, user, { amount_rappen: -300, booked_at: dayOf(month, 2) });
      expect((await mustGetOverview(db, user)).uncategorized_spent_rappen).toBe(1_000);
    });
  });

  it('uncategorized money coming in (a salary in the bank feed) does not change the budget', async () => {
    await withRollback(async (db) => {
      const { user, month } = await userWithCurrentPeriod(db);
      await make.transaction(db, user, {
        amount_rappen: 520_000,
        booked_at: dayOf(month, 0),
        source: 'bank',
        merchant: 'Arbeitgeber AG',
      });
      await make.transaction(db, user, { amount_rappen: -700, booked_at: dayOf(month, 1) });
      expect((await mustGetOverview(db, user)).uncategorized_spent_rappen).toBe(700);
    });
  });

  it('a split transaction counts its parts in their own categories', async () => {
    await withRollback(async (db) => {
      const { user, month } = await userWithCurrentPeriod(db);
      const groceries = await make.category(db, user, { name: 'Lebensmittel' });
      const eatingOut = await make.category(db, user, { name: 'Auswärts' });
      const shop = await make.transaction(db, user, {
        amount_rappen: -10_000,
        booked_at: dayOf(month, 1),
      });
      await make.split(db, user, shop, -6_000, { category_id: groceries });
      await make.split(db, user, shop, -4_000, { category_id: eatingOut });
      const mixed = await make.transaction(db, user, {
        amount_rappen: -5_000,
        booked_at: dayOf(month, 2),
      });
      await make.split(db, user, mixed, -3_000, { category_id: groceries });
      await make.split(db, user, mixed, -2_000);
      // A refund split in two: the categorized part gives money back, the other part is ignored.
      const refund = await make.transaction(db, user, {
        amount_rappen: 3_000,
        booked_at: dayOf(month, 3),
      });
      await make.split(db, user, refund, 2_000, { category_id: groceries });
      await make.split(db, user, refund, 1_000);
      await runDeferredChecks(db);
      expect(spending(await mustGetOverview(db, user))).toEqual({
        [groceries]: 7_000,
        [eatingOut]: 4_000,
        uncategorized: 2_000,
      });
    });
  });

  it('fixed-cost payments are not spending (fixed costs are already in the plan)', async () => {
    await withRollback(async (db) => {
      const { user, month } = await userWithCurrentPeriod(db);
      const other = await make.category(db, user, { name: 'Diverses' });
      const rent = await make.fixedCost(db, user);
      const insurance = await make.fixedCost(db, user, { kind: 'health_insurance' });
      await make.transaction(db, user, {
        amount_rappen: -185_000,
        booked_at: dayOf(month, 1),
        fixed_cost_id: rent,
      });
      await make.transaction(db, user, {
        amount_rappen: -42_000,
        booked_at: dayOf(month, 2),
        fixed_cost_id: insurance,
        category_id: other,
      });
      const split = await make.transaction(db, user, {
        amount_rappen: -1_000,
        booked_at: dayOf(month, 3),
        fixed_cost_id: insurance,
      });
      await make.split(db, user, split, -600, { category_id: other });
      await make.split(db, user, split, -400);
      await make.transaction(db, user, {
        amount_rappen: -900,
        booked_at: dayOf(month, 4),
        category_id: other,
      });
      await runDeferredChecks(db);
      expect(spending(await mustGetOverview(db, user))).toEqual({
        [other]: 900,
        uncategorized: 0,
      });
    });
  });

  it('deleted transactions and merged duplicates are ignored', async () => {
    await withRollback(async (db) => {
      const { user, month } = await userWithCurrentPeriod(db);
      const groceries = await make.category(db, user, { name: 'Lebensmittel' });
      const original = await make.transaction(db, user, {
        amount_rappen: -1_250,
        booked_at: dayOf(month, 1),
        category_id: groceries,
      });
      await make.transaction(db, user, {
        amount_rappen: -1_250,
        booked_at: dayOf(month, 1),
        category_id: groceries,
        source: 'android_notification',
        merged_into_id: original,
      });
      await make.transaction(db, user, {
        amount_rappen: -900,
        booked_at: dayOf(month, 2),
        category_id: groceries,
        deleted_at: '2026-10-01T12:00:00Z',
      });
      await make.transaction(db, user, {
        amount_rappen: -400,
        booked_at: dayOf(month, 2),
        deleted_at: '2026-10-01T12:00:00Z',
      });
      expect(spending(await mustGetOverview(db, user))).toEqual({
        [groceries]: 1_250,
        uncategorized: 0,
      });
    });
  });

  it('counts by the booking day in Europe/Zurich: 23:30 UTC belongs to the next day', async () => {
    await withRollback(async (db) => {
      const { user, month } = await userWithCurrentPeriod(db, 'Europe/Zurich');
      const lastDay = addDays(month.endsOn, -1);
      const dayBefore = addDays(month.startsOn, -1);
      // 21:30 UTC is 22:30 or 23:30 in Zurich (same day); 23:30 UTC is already the next day.
      await make.transaction(db, user, { amount_rappen: -1, booked_at: `${dayBefore}T21:30:00Z` });
      await make.transaction(db, user, { amount_rappen: -10, booked_at: `${dayBefore}T23:30:00Z` });
      await make.transaction(db, user, { amount_rappen: -100, booked_at: `${lastDay}T21:30:00Z` });
      await make.transaction(db, user, {
        amount_rappen: -1_000,
        booked_at: `${lastDay}T23:30:00Z`,
      });
      expect((await mustGetOverview(db, user)).uncategorized_spent_rappen).toBe(110);
    });
  });

  it('the period starts at local midnight of starts_on and ends before local midnight of ends_on', async () => {
    await withRollback(async (db) => {
      const { user, month } = await userWithCurrentPeriod(db, 'Europe/Zurich');
      await bookAtLocalMidnight(db, user, month.startsOn, 'Europe/Zurich', -1);
      await bookAtLocalMidnight(db, user, month.startsOn, 'Europe/Zurich', -2, '-1 microsecond');
      await bookAtLocalMidnight(db, user, month.endsOn, 'Europe/Zurich', -10, '-1 microsecond');
      await bookAtLocalMidnight(db, user, month.endsOn, 'Europe/Zurich', -100);
      expect((await mustGetOverview(db, user)).uncategorized_spent_rappen).toBe(11);
    });
  });

  it('uses the time zone of the profile (America/New_York)', async () => {
    await withRollback(async (db) => {
      const { user, month } = await userWithCurrentPeriod(db, 'America/New_York');
      // 03:00 UTC is 22:00 or 23:00 of the previous day in New York.
      await make.transaction(db, user, {
        amount_rappen: -1,
        booked_at: `${month.startsOn}T03:00:00Z`,
      });
      await make.transaction(db, user, {
        amount_rappen: -10,
        booked_at: `${month.endsOn}T03:00:00Z`,
      });
      await make.transaction(db, user, {
        amount_rappen: -100,
        booked_at: `${month.endsOn}T05:00:00Z`,
      });
      expect((await mustGetOverview(db, user)).uncategorized_spent_rappen).toBe(10);
    });
  });
});

describe('private.period_totals', () => {
  it('puts 23:30 UTC on a period’s last day into the next period (Europe/Zurich)', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const groceries = await make.category(db, a);
      await make.transaction(db, a, {
        amount_rappen: -500,
        booked_at: '2026-10-24T23:30:00Z',
        category_id: groceries,
      });
      await make.transaction(db, a, {
        amount_rappen: -40,
        booked_at: '2026-10-24T21:30:00Z',
        category_id: groceries,
      });
      const totals = (startsOn: string, endsOn: string) =>
        queryRows<{ category_id: string | null; spent_rappen: number }>(
          db,
          `select category_id::text, spent_rappen::int
             from private.period_totals($1, $2, $3, 'Europe/Zurich')`,
          [a, startsOn, endsOn],
        );
      expect(await totals('2026-09-25', '2026-10-25')).toEqual([
        { category_id: groceries, spent_rappen: 40 },
      ]);
      expect(await totals('2026-10-25', '2026-11-25')).toEqual([
        { category_id: groceries, spent_rappen: 500 },
      ]);
    });
  });

  it('returns no row for categories without counted allocations', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await make.category(db, a);
      await make.transaction(db, a, { amount_rappen: 9_000, booked_at: '2026-10-01T10:00:00Z' });
      const rows = await queryRows(
        db,
        `select * from private.period_totals($1, '2026-09-25', '2026-10-25', 'Europe/Zurich')`,
        [a],
      );
      expect(rows).toEqual([]);
    });
  });

  it('agrees with get_overview() for a month that uses every rule', async () => {
    await withRollback(async (db) => {
      const { user, month } = await userWithCurrentPeriod(db);
      const groceries = await make.category(db, user, { name: 'Lebensmittel' });
      const clothes = await make.category(db, user, { name: 'Kleider' });
      const archived = await make.category(db, user, {
        name: 'Alt',
        archived_at: '2026-09-01T00:00:00Z',
      });
      const rent = await make.fixedCost(db, user);
      const tx = (values: Record<string, unknown>) => make.transaction(db, user, values);
      await tx({ amount_rappen: -1_250, booked_at: dayOf(month, 1), category_id: groceries });
      await tx({ amount_rappen: 300, booked_at: dayOf(month, 2), category_id: groceries });
      await tx({ amount_rappen: -4_000, booked_at: dayOf(month, 2), category_id: archived });
      await tx({ amount_rappen: -700, booked_at: dayOf(month, 3) });
      await tx({ amount_rappen: 520_000, booked_at: dayOf(month, 0) });
      await tx({ amount_rappen: -185_000, booked_at: dayOf(month, 1), fixed_cost_id: rent });
      await tx({ amount_rappen: -999, booked_at: dayOf(month, 1), deleted_at: dayOf(month, 2) });
      await tx({ amount_rappen: -50, booked_at: `${addDays(month.endsOn, -1)}T23:30:00Z` });
      const split = await tx({ amount_rappen: -2_000, booked_at: dayOf(month, 4) });
      await make.split(db, user, split, -1_500, { category_id: clothes });
      await make.split(db, user, split, -500);
      await runDeferredChecks(db);

      const totals = await queryRows<{ category_id: string | null; spent_rappen: number }>(
        db,
        `select category_id::text, spent_rappen::int
           from private.period_totals($1, $2, $3, 'Europe/Zurich')`,
        [user, month.startsOn, month.endsOn],
      );
      const fromTotals = Object.fromEntries(
        totals.map((row) => [row.category_id ?? 'uncategorized', row.spent_rappen]),
      );
      expect(fromTotals).toEqual({
        [groceries]: 950,
        [clothes]: 1_500,
        [archived]: 4_000,
        uncategorized: 1_200,
      });
      expect(spending(await mustGetOverview(db, user))).toEqual(fromTotals);
    });
  });
});

describe('categories in the overview', () => {
  it('lists every active category, with its budget in this period or zeros without one', async () => {
    await withRollback(async (db) => {
      const { user, month } = await userWithCurrentPeriod(db);
      const groceries = await make.category(db, user, {
        name: undefined,
        default_key: 'groceries',
        icon: 'cart',
        sort_order: 0,
      });
      const velo = await make.category(db, user, { name: 'Velo', sort_order: 1 });
      const clothes = await make.category(db, user, { name: 'Kleider', sort_order: 2 });
      const budget = await make.budget(db, user, month.id, groceries, {
        amount_rappen: 40_000,
        rollover_rappen: 500,
      });
      // A budget in another period is not this period's budget.
      const older = await make.period(db, user, {
        starts_on: addDays(month.startsOn, -30),
        ends_on: month.startsOn,
      });
      await make.budget(db, user, older, clothes, { amount_rappen: 9_000 });
      await make.transaction(db, user, {
        amount_rappen: -2_500,
        booked_at: dayOf(month, 1),
        category_id: velo,
      });
      const overview = await mustGetOverview(db, user);
      expect(overview.categories).toEqual([
        {
          category_id: groceries,
          default_key: 'groceries',
          name: null,
          icon: 'cart',
          sort_order: 0,
          archived: false,
          budget_id: budget,
          budget_amount_rappen: 40_000,
          rollover_rappen: 500,
          spent_rappen: 0,
        },
        {
          category_id: velo,
          default_key: null,
          name: 'Velo',
          icon: null,
          sort_order: 1,
          archived: false,
          budget_id: null,
          budget_amount_rappen: 0,
          rollover_rappen: 0,
          spent_rappen: 2_500,
        },
        {
          category_id: clothes,
          default_key: null,
          name: 'Kleider',
          icon: null,
          sort_order: 2,
          archived: false,
          budget_id: null,
          budget_amount_rappen: 0,
          rollover_rappen: 0,
          spent_rappen: 0,
        },
      ]);
    });
  });

  it('lists an archived category only while it has spending in the period', async () => {
    await withRollback(async (db) => {
      const { user, month } = await userWithCurrentPeriod(db);
      const archivedAt = '2026-09-01T00:00:00Z';
      const withSpending = await make.category(db, user, {
        name: 'Alt mit',
        archived_at: archivedAt,
      });
      const withBudgetOnly = await make.category(db, user, {
        name: 'Alt Budget',
        archived_at: archivedAt,
      });
      const spentEarlier = await make.category(db, user, {
        name: 'Alt früher',
        archived_at: archivedAt,
      });
      await make.budget(db, user, month.id, withBudgetOnly);
      await make.transaction(db, user, {
        amount_rappen: -800,
        booked_at: dayOf(month, 1),
        category_id: withSpending,
      });
      await make.transaction(db, user, {
        amount_rappen: -800,
        booked_at: dayOf(month, -5),
        category_id: spentEarlier,
      });
      const overview = await mustGetOverview(db, user);
      expect(overview.categories.map((c) => [c.category_id, c.archived, c.spent_rappen])).toEqual([
        [withSpending, true, 800],
      ]);
    });
  });

  it('orders by sort_order, then by creation time', async () => {
    await withRollback(async (db) => {
      const { user } = await userWithCurrentPeriod(db);
      const third = await make.category(db, user, { sort_order: 2 });
      const second = await make.category(db, user, {
        sort_order: 1,
        created_at: '2026-01-02T00:00:00Z',
      });
      const first = await make.category(db, user, { sort_order: 0 });
      const secondEarlier = await make.category(db, user, {
        sort_order: 1,
        created_at: '2026-01-01T00:00:00Z',
      });
      const overview = await mustGetOverview(db, user);
      expect(overview.categories.map((c) => c.category_id)).toEqual([
        first,
        secondEarlier,
        second,
        third,
      ]);
    });
  });
});

describe('recent transactions in the overview', () => {
  it('are the five latest by booking time, newest first, from any period', async () => {
    await withRollback(async (db) => {
      const { user, month } = await userWithCurrentPeriod(db);
      const at = (booked: string, created = '2026-01-01T00:00:00Z') =>
        make.transaction(db, user, { booked_at: booked, created_at: created });
      const lastYear = await at(`${addDays(month.startsOn, -365)}T10:00:00Z`);
      await at(`${addDays(month.startsOn, -400)}T10:00:00Z`);
      const tieOlder = await at(dayOf(month, 2), '2026-01-01T00:00:00Z');
      const tieNewer = await at(dayOf(month, 2), '2026-01-02T00:00:00Z');
      const newest = await at(dayOf(month, 4));
      const middle = await at(dayOf(month, 3));
      const overview = await mustGetOverview(db, user);
      expect(overview.recent_transactions.map((t) => t.id)).toEqual([
        newest,
        middle,
        tieNewer,
        tieOlder,
        lastYear,
      ]);
    });
  });

  it('leave out deleted and merged transactions but show fixed-cost payments and splits', async () => {
    await withRollback(async (db) => {
      const { user, month } = await userWithCurrentPeriod(db);
      const rent = await make.fixedCost(db, user);
      const original = await make.transaction(db, user, { booked_at: dayOf(month, 1) });
      await make.transaction(db, user, {
        booked_at: dayOf(month, 5),
        merged_into_id: original,
      });
      await make.transaction(db, user, { booked_at: dayOf(month, 6), deleted_at: dayOf(month, 6) });
      const fixed = await make.transaction(db, user, {
        amount_rappen: -185_000,
        booked_at: dayOf(month, 2),
        fixed_cost_id: rent,
      });
      const split = await make.transaction(db, user, {
        amount_rappen: -2_000,
        booked_at: dayOf(month, 3),
      });
      await make.split(db, user, split, -1_500);
      await make.split(db, user, split, -500);
      await runDeferredChecks(db);
      const overview = await mustGetOverview(db, user);
      expect(overview.recent_transactions.map((t) => [t.id, t.is_split])).toEqual([
        [split, true],
        [fixed, false],
        [original, false],
      ]);
    });
  });

  it('carry every listed field, with timestamps in UTC', async () => {
    await withRollback(async (db) => {
      const { user, month } = await userWithCurrentPeriod(db);
      const groceries = await make.category(db, user);
      const id = await make.transaction(db, user, {
        amount_rappen: -1_250,
        booked_at: dayOf(month, 1, '08:15:30'),
        merchant: 'Migros',
        category_id: groceries,
        source: 'ios_shortcut',
        note: 'Znüni',
      });
      await db.query(`set local timezone to 'Asia/Tokyo'`);
      const overview = await mustGetOverview(db, user);
      expect(overview.recent_transactions).toEqual([
        {
          id,
          amount_rappen: -1_250,
          booked_at: `${addDays(month.startsOn, 1)}T08:15:30+00:00`,
          merchant: 'Migros',
          category_id: groceries,
          is_split: false,
          source: 'ios_shortcut',
          note: 'Znüni',
        },
      ]);
    });
  });
});

describe('the overview is the caller’s own', () => {
  it('never includes another user’s categories, budgets, spending or transactions', async () => {
    await withRollback(async (db) => {
      const { user: a, month: monthA } = await userWithCurrentPeriod(db);
      const { user: b, month: monthB } = await userWithCurrentPeriod(db);
      const ofA = await make.category(db, a, { name: 'Lebensmittel' });
      const ofB = await make.category(db, b, { name: 'Lebensmittel' });
      await make.budget(db, b, monthB.id, ofB);
      const txA = await make.transaction(db, a, {
        amount_rappen: -1_000,
        booked_at: dayOf(monthA, 1),
        category_id: ofA,
      });
      const txB = await make.transaction(db, b, {
        amount_rappen: -7_000,
        booked_at: dayOf(monthB, 1),
        category_id: ofB,
      });
      await make.transaction(db, b, { amount_rappen: -300, booked_at: dayOf(monthB, 2) });

      const overview = await mustGetOverview(db, a);
      expect(overview.period.id).toBe(monthA.id);
      expect(overview.categories.map((c) => [c.category_id, c.spent_rappen])).toEqual([
        [ofA, 1_000],
      ]);
      expect(overview.uncategorized_spent_rappen).toBe(0);
      expect(overview.recent_transactions.map((t) => t.id)).toEqual([txA]);
      expect(JSON.stringify(overview)).not.toContain(txB);
      expect(JSON.stringify(overview)).not.toContain(ofB);
    });
  });

  it('cannot be called by anon (42501)', async () => {
    await withRollback(async (db) => {
      await userWithCurrentPeriod(db);
      await asAnon(db);
      await expectSqlError(db, SQLSTATE.insufficientPrivilege, 'select public.get_overview()');
    });
  });

  it('raises 42501 without a signed-in user', async () => {
    await withRollback(async (db) => {
      await asAuthenticatedWithoutUser(db);
      const error = await expectSqlError(
        db,
        SQLSTATE.insufficientPrivilege,
        'select public.get_overview()',
      );
      expect(error.message).toBe('not signed in');
    });
  });
});
