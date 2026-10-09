/**
 * The Milestone 4 client RPCs besides the alert engine: cash-feel moments (pending_moments,
 * acknowledge_transactions), the inbox (list_alerts, mark_alerts_read, dismiss_alert,
 * unread_alert_count) and the editors (set_budget, get_category_detail, categories, fixed costs).
 * Each only ever sees the caller's rows.
 */
import { describe, expect, it } from 'vitest';
import {
  type Db,
  SQLSTATE,
  affectedRows,
  asAnon,
  asPostgres,
  asUser,
  createUser,
  expectSqlError,
  make,
  queryOne,
  withRollback,
} from './db';
import { EATING_OUT_BUDGET, GROCERIES_BUDGET, SPENDABLE, addDays, budgetUser, spend } from './m4';

interface Moment {
  transaction_id: string;
  amount_rappen: number;
  booked_at: string;
  merchant: string | null;
  source: string;
  category_id: string | null;
  is_split: boolean;
  period_id: string | null;
  budget_rappen: number | null;
  balance_before_rappen: number | null;
  balance_after_rappen: number | null;
  remaining_before_rappen: number | null;
  remaining_after_rappen: number | null;
  over_budget: boolean | null;
}

interface AlertItem {
  id: string;
  type: string;
  title: string;
  body: string;
  params: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

interface AlertPage {
  items: AlertItem[];
  next_cursor: { created_at: string; id: string } | null;
}

async function moments(db: Db, user: string): Promise<Moment[]> {
  await asUser(db, user);
  return (await queryOne<{ m: Moment[] }>(db, 'select public.pending_moments() as m')).m;
}

async function listAlerts(db: Db, user: string, input: object = {}): Promise<AlertPage> {
  await asUser(db, user);
  return (
    await queryOne<{ page: AlertPage }>(db, 'select public.list_alerts($1::jsonb) as page', [
      JSON.stringify(input),
    ])
  ).page;
}

describe('pending_moments()', () => {
  it('lists unacknowledged purchases oldest first, with balance and budget before and after', async () => {
    await withRollback(async (db) => {
      const f = await budgetUser(db);
      const earlier = await spend(db, f, 30_000, {
        category_id: f.groceries,
        on: addDays(f.today, -3),
        acknowledged_at: '2026-10-01T00:00:00Z',
      });
      const first = await spend(db, f, 8_000, { category_id: f.groceries, time: '09:00' });
      const second = await spend(db, f, 4_000, {
        category_id: f.groceries,
        time: '10:00',
        merchant: 'Coop',
      });
      const result = await moments(db, f.user);
      expect(result.map((m) => m.transaction_id)).toEqual([first, second]);
      expect(earlier).not.toBe(first);
      expect(result[0]).toMatchObject({
        amount_rappen: -8_000,
        category_id: f.groceries,
        is_split: false,
        period_id: f.periodId,
        budget_rappen: GROCERIES_BUDGET,
        balance_before_rappen: SPENDABLE - 30_000,
        balance_after_rappen: SPENDABLE - 38_000,
        remaining_before_rappen: GROCERIES_BUDGET - 30_000,
        remaining_after_rappen: GROCERIES_BUDGET - 38_000,
        over_budget: false,
      });
      expect(result[1]).toMatchObject({
        merchant: 'Coop',
        source: 'manual',
        balance_before_rappen: SPENDABLE - 38_000,
        balance_after_rappen: SPENDABLE - 42_000,
        remaining_before_rappen: 2_000,
        remaining_after_rappen: -2_000,
        over_budget: true,
      });
    });
  });

  it('leaves out acknowledged, older than 7 days, money in, fixed costs, deleted and merged rows', async () => {
    await withRollback(async (db) => {
      const f = await budgetUser(db, { startsDaysAgo: 20 });
      const rent = await make.fixedCost(db, f.user);
      const sixDaysAgo = await spend(db, f, 100, { on: addDays(f.today, -6) });
      await spend(db, f, 100, { on: addDays(f.today, -7) });
      await spend(db, f, -100, { category_id: f.groceries });
      await spend(db, f, 100, { fixed_cost_id: rent });
      await spend(db, f, 100, { deleted_at: '2026-10-01T00:00:00Z' });
      await spend(db, f, 100, { merged_into_id: sixDaysAgo });
      await spend(db, f, 100, { acknowledged_at: '2026-10-01T00:00:00Z' });
      const result = await moments(db, f.user);
      expect(result.map((m) => m.transaction_id)).toEqual([sixDaysAgo]);
    });
  });

  it('a purchase without category compares with the balance; a split has no single category', async () => {
    await withRollback(async (db) => {
      const f = await budgetUser(db);
      await spend(db, f, SPENDABLE, {
        on: addDays(f.today, -1),
        acknowledged_at: '2026-10-01T00:00:00Z',
      });
      const loose = await spend(db, f, 500, { category_id: null, time: '09:00' });
      const split = await spend(db, f, 1_000, { category_id: null, time: '10:00' });
      await make.split(db, f.user, split, -600, { category_id: f.groceries });
      await make.split(db, f.user, split, -400, { category_id: f.eatingOut });
      const [first, second] = await moments(db, f.user);
      expect(first).toMatchObject({
        transaction_id: loose,
        category_id: null,
        budget_rappen: null,
        remaining_after_rappen: null,
        balance_before_rappen: 0,
        balance_after_rappen: -500,
        over_budget: true,
      });
      expect(second).toMatchObject({
        transaction_id: split,
        is_split: true,
        category_id: null,
        budget_rappen: null,
        balance_after_rappen: -1_500,
      });
    });
  });

  it('only the caller’s; acknowledge_transactions skips other users’ and repeated ids', async () => {
    await withRollback(async (db) => {
      const a = await budgetUser(db);
      const b = await budgetUser(db);
      const ofA = await spend(db, a, 1_000);
      const ofB = await spend(db, b, 1_000);
      expect((await moments(db, a.user)).map((m) => m.transaction_id)).toEqual([ofA]);
      const row = await queryOne<{ n: number }>(
        db,
        'select public.acknowledge_transactions($1::uuid[]) as n',
        [[ofA, ofB, ofA]],
      );
      expect(row.n).toBe(1);
      expect(await moments(db, a.user)).toEqual([]);
      expect((await moments(db, b.user)).map((m) => m.transaction_id)).toEqual([ofB]);
      const again = await queryOne<{ n: number }>(
        db,
        'select public.acknowledge_transactions($1::uuid[]) as n',
        [[ofA]],
      );
      expect(again.n).toBe(0);
    });
  });

  it('acknowledge_transactions takes at most 500 ids; both need a signed-in user', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await asUser(db, a);
      const error = await expectSqlError(
        db,
        SQLSTATE.invalidParameterValue,
        'select public.acknowledge_transactions(array_fill(gen_random_uuid(), array[501]))',
      );
      expect(error.message).toBe('invalid_input');
      await asAnon(db);
      await expectSqlError(db, SQLSTATE.insufficientPrivilege, 'select public.pending_moments()');
    });
  });
});

describe('inbox', () => {
  it('lists alerts newest first with a cursor, never dismissed ones or other users’', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const b = await createUser(db);
      const ids: string[] = [];
      for (let i = 0; i < 5; i += 1) {
        ids.push(
          await make.alert(db, a, {
            created_at: new Date(Date.UTC(2026, 9, 1, 8, i)).toISOString(),
            params: { n: i },
          }),
        );
      }
      await make.alert(db, a, { dismissed_at: '2026-10-02T00:00:00Z' });
      await make.alert(db, b);
      const first = await listAlerts(db, a, { limit: 2 });
      expect(first.items.map((item) => item.id)).toEqual([ids[4], ids[3]]);
      expect(first.items[0]).toMatchObject({
        type: 'category_80',
        title: 'Fast ausgegeben',
        params: { n: 4 },
        read_at: null,
      });
      const second = await listAlerts(db, a, { limit: 2, cursor: first.next_cursor });
      expect(second.items.map((item) => item.id)).toEqual([ids[2], ids[1]]);
      const last = await listAlerts(db, a, { limit: 2, cursor: second.next_cursor });
      expect(last.items.map((item) => item.id)).toEqual([ids[0]]);
      expect(last.next_cursor).toBeNull();
      expect((await listAlerts(db, a)).items).toHaveLength(5);
    });
  });

  it('marks alerts read (some, or all), dismisses one, and counts unread ones in the overview', async () => {
    await withRollback(async (db) => {
      const f = await budgetUser(db);
      const other = await createUser(db);
      const one = await make.alert(db, f.user);
      const two = await make.alert(db, f.user);
      const three = await make.alert(db, f.user);
      const foreign = await make.alert(db, other);
      const unread = async () => {
        await asUser(db, f.user);
        return (
          await queryOne<{ n: number }>(
            db,
            `select (public.get_overview() ->> 'unread_alert_count')::int as n`,
          )
        ).n;
      };
      expect(await unread()).toBe(3);
      const marked = await queryOne<{ n: number }>(
        db,
        'select public.mark_alerts_read($1::uuid[]) as n',
        [[one, foreign]],
      );
      expect(marked.n).toBe(1);
      expect(await unread()).toBe(2);
      expect(
        (await listAlerts(db, f.user, { unread_only: true })).items.map((i) => i.id).sort(),
      ).toEqual([two, three].sort());
      const dismissed = await queryOne<{ ok: boolean }>(
        db,
        'select public.dismiss_alert($1) as ok',
        [two],
      );
      expect(dismissed.ok).toBe(true);
      expect(await unread()).toBe(1);
      const foreignDismiss = await queryOne<{ ok: boolean }>(
        db,
        'select public.dismiss_alert($1) as ok',
        [foreign],
      );
      expect(foreignDismiss.ok).toBe(false);
      const all = await queryOne<{ n: number }>(db, 'select public.mark_alerts_read(null) as n');
      expect(all.n).toBe(2);
      expect(await unread()).toBe(0);
      await asPostgres(db);
      const untouched = await queryOne<{ read_at: string | null; dismissed_at: string | null }>(
        db,
        'select read_at, dismissed_at from public.alerts where id = $1',
        [foreign],
      );
      expect(untouched).toEqual({ read_at: null, dismissed_at: null });
    });
  });

  it.each([
    [{ limit: 0 }],
    [{ limit: 101 }],
    [{ limit: 'ten' }],
    [{ unread_only: 'yes' }],
    [{ cursor: { created_at: 'yesterday', id: 'x' } }],
    [{ sort: 'oldest' }],
  ])('list_alerts rejects %j (22023 invalid_input)', async (input) => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await asUser(db, a);
      const error = await expectSqlError(
        db,
        SQLSTATE.invalidParameterValue,
        'select public.list_alerts($1::jsonb)',
        [JSON.stringify(input)],
      );
      expect(error.message).toBe('invalid_input');
    });
  });
});

describe('set_budget()', () => {
  it('changes the open period’s budget and raises the alerts the change causes', async () => {
    await withRollback(async (db) => {
      const f = await budgetUser(db, { startsDaysAgo: 1 });
      await spend(db, f, 15_000, { category_id: f.eatingOut, on: addDays(f.today, -1) });
      await asUser(db, f.user);
      const saved = await queryOne<{ b: Record<string, unknown> }>(
        db,
        'select public.set_budget($1, 10000) as b',
        [f.eatingOut],
      );
      expect(saved.b).toEqual({
        budget_id: f.eatingOutBudget,
        period_id: f.periodId,
        category_id: f.eatingOut,
        amount_rappen: 10_000,
        rollover_rappen: 0,
      });
      await asPostgres(db);
      const over = await queryOne<{ n: number }>(
        db,
        `select count(*)::int as n from public.alerts
          where user_id = $1 and type = 'category_over' and category_id = $2`,
        [f.user, f.eatingOut],
      );
      expect(over.n).toBe(1);
    });
  });

  it('creates the budget of a new category', async () => {
    await withRollback(async (db) => {
      const f = await budgetUser(db);
      await asUser(db, f.user);
      const created = await queryOne<{ id: string }>(
        db,
        `insert into public.categories (user_id, name, icon, sort_order)
         values ($1, 'Velo', 'bike', 5) returning id`,
        [f.user],
      );
      const saved = await queryOne<{ b: { period_id: string; amount_rappen: number } }>(
        db,
        'select public.set_budget($1, 5000) as b',
        [created.id],
      );
      expect(saved.b).toMatchObject({ period_id: f.periodId, amount_rappen: 5_000 });
    });
  });

  it.each([
    ['-1', 'invalid_amount'],
    ['10000000001', 'invalid_amount'],
    ['null', 'invalid_amount'],
  ])('rejects the amount %s (22023 %s)', async (amount, message) => {
    await withRollback(async (db) => {
      const f = await budgetUser(db);
      await asUser(db, f.user);
      const error = await expectSqlError(
        db,
        SQLSTATE.invalidParameterValue,
        `select public.set_budget($1, ${amount})`,
        [f.groceries],
      );
      expect(error.message).toBe(message);
    });
  });

  it('rejects archived, unknown and other users’ categories, and works only after onboarding', async () => {
    await withRollback(async (db) => {
      const f = await budgetUser(db);
      const other = await budgetUser(db);
      await asPostgres(db);
      await db.query('update public.categories set archived_at = now() where id = $1', [
        f.eatingOut,
      ]);
      await asUser(db, f.user);
      for (const category of [
        f.eatingOut,
        other.groceries,
        '00000000-0000-0000-0000-000000000000',
      ]) {
        const error = await expectSqlError(
          db,
          SQLSTATE.invalidParameterValue,
          'select public.set_budget($1, 100)',
          [category],
        );
        expect(error.message).toBe('category_not_found');
      }
      const fresh = await createUser(db);
      await asUser(db, fresh);
      await expectSqlError(
        db,
        SQLSTATE.objectNotInPrerequisiteState,
        'select public.set_budget(gen_random_uuid(), 100)',
      );
      await asPostgres(db);
      const untouched = await queryOne<{ amount: number }>(
        db,
        'select amount_rappen::int as amount from public.budgets where id = $1',
        [other.groceriesBudget],
      );
      expect(untouched.amount).toBe(GROCERIES_BUDGET);
    });
  });
});

describe('get_category_detail()', () => {
  it('returns the budget, spending, the last periods and the pace inputs', async () => {
    await withRollback(async (db) => {
      const f = await budgetUser(db, { startsDaysAgo: 9 });
      // Seven earlier periods: the detail shows the newest six.
      let endsOn = f.startsOn;
      const earlier: string[] = [];
      for (let i = 0; i < 7; i += 1) {
        const startsOn = addDays(endsOn, -30);
        const period = await make.period(db, f.user, {
          starts_on: startsOn,
          ends_on: endsOn,
          closed_at: '2026-10-01T00:00:00Z',
          leftover_action: 'reset',
          leftover_rappen: 0,
        });
        if (i % 2 === 0) {
          await make.budget(db, f.user, period, f.eatingOut, { amount_rappen: 10_000 + i });
        }
        await spend(db, f, 1_000 + i, { category_id: f.eatingOut, on: addDays(startsOn, 1) });
        earlier.push(period);
        endsOn = startsOn;
      }
      await db.query('update public.budgets set rollover_rappen = 2000 where id = $1', [
        f.eatingOutBudget,
      ]);
      await spend(db, f, 11_000, { category_id: f.eatingOut, on: addDays(f.today, -1) });
      await spend(db, f, 500, { category_id: f.groceries });
      await asUser(db, f.user);
      const detail = (
        await queryOne<{ d: Record<string, unknown> }>(
          db,
          'select public.get_category_detail($1) as d',
          [f.eatingOut],
        )
      ).d;
      expect(detail).toMatchObject({
        category: {
          id: f.eatingOut,
          default_key: 'eating_out',
          name: null,
          icon: null,
          archived: false,
        },
        period: { id: f.periodId, starts_on: f.startsOn, ends_on: f.endsOn },
        budget_id: f.eatingOutBudget,
        budget_amount_rappen: EATING_OUT_BUDGET,
        rollover_rappen: 2_000,
        spent_rappen: 11_000,
        remaining_rappen: EATING_OUT_BUDGET + 2_000 - 11_000,
        pace: {
          today: f.today,
          days_elapsed: 10,
          days_left: 21,
          available_rappen: 22_000,
          spent_rappen: 11_000,
          daily_average_rappen: 1_100,
          runs_out_on: addDays(f.today, 10),
        },
      });
      const history = detail.history as Record<string, unknown>[];
      expect(history.map((h) => h.period_id)).toEqual(earlier.slice(0, 6));
      expect(history[0]).toEqual({
        period_id: earlier[0],
        starts_on: addDays(f.startsOn, -30),
        ends_on: f.startsOn,
        budget_amount_rappen: 10_000,
        rollover_rappen: 0,
        spent_rappen: 1_000,
      });
      expect(history[1]).toMatchObject({ budget_amount_rappen: 0, spent_rappen: 1_001 });
    });
  });

  it('shows archived categories; unknown and other users’ ones are category_not_found', async () => {
    await withRollback(async (db) => {
      const f = await budgetUser(db);
      const other = await budgetUser(db);
      await asPostgres(db);
      await db.query('update public.categories set archived_at = now() where id = $1', [
        f.groceries,
      ]);
      await asUser(db, f.user);
      const archived = await queryOne<{ archived: boolean; runs_out: string | null }>(
        db,
        `select (public.get_category_detail($1) -> 'category' ->> 'archived')::boolean as archived,
                public.get_category_detail($1) -> 'pace' ->> 'runs_out_on' as runs_out`,
        [f.groceries],
      );
      expect(archived).toEqual({ archived: true, runs_out: null });
      const error = await expectSqlError(
        db,
        SQLSTATE.invalidParameterValue,
        'select public.get_category_detail($1)',
        [other.groceries],
      );
      expect(error.message).toBe('category_not_found');
    });
  });
});

describe('editors through the table API', () => {
  it('a client inserts, renames and archives its categories, and deactivates a fixed cost', async () => {
    await withRollback(async (db) => {
      const f = await budgetUser(db);
      const fixedCost = await make.fixedCost(db, f.user);
      await asUser(db, f.user);
      const created = await queryOne<{ id: string }>(
        db,
        `insert into public.categories (user_id, name) values ($1, 'Ferien') returning id`,
        [f.user],
      );
      expect(
        await affectedRows(db, `update public.categories set name = 'Reisen' where id = $1`, [
          created.id,
        ]),
      ).toBe(1);
      expect(
        await affectedRows(db, 'update public.categories set archived_at = now() where id = $1', [
          created.id,
        ]),
      ).toBe(1);
      expect(
        await affectedRows(db, 'update public.fixed_costs set active = false where id = $1', [
          fixedCost,
        ]),
      ).toBe(1);
    });
  });
});
