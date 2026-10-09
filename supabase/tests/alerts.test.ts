/**
 * The alert engine (docs/API.md, "Alerts, moments, reminders, editors"): texts and amount
 * formatting, every alert type with its trigger and its limits, dedupe (never twice), the
 * notification toggles, thresholds crossed in one jump (all recorded, only the highest pushed),
 * the reminders on the right local day and time, the wiring into the transaction RPCs and the
 * hourly job.
 */
import { describe, expect, it } from 'vitest';
import {
  type Db,
  SQLSTATE,
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
import {
  EATING_OUT_BUDGET,
  GROCERIES_BUDGET,
  SPENDABLE,
  addDays,
  alertsOf,
  budgetUser,
  evaluate,
  localTime,
  remind,
  setNotifications,
  spend,
} from './m4';

describe('texts', () => {
  it.each([
    [124_050, 'de', 'CHF 1’240.50'],
    [124_050, 'en', 'CHF 1,240.50'],
    [0, 'de', 'CHF 0.00'],
    [5, 'en', 'CHF 0.05'],
    [99_999, 'de', 'CHF 999.99'],
    [100_000, 'de', 'CHF 1’000.00'],
    [123_456_789, 'en', 'CHF 1,234,567.89'],
    [10_000_000_000, 'de', 'CHF 100’000’000.00'],
    [-1_200, 'de', 'CHF -12.00'],
    [-123_456, 'en', 'CHF -1,234.56'],
  ])('format_chf(%i, %s) = %s', async (rappen, language, expected) => {
    const row = await withRollback((db) =>
      queryOne<{ text: string }>(db, 'select private.format_chf($1, $2) as text', [
        rappen,
        language,
      ]),
    );
    expect(row.text).toBe(expected);
  });

  it('formats days and category names in both languages', async () => {
    const row = await withRollback((db) =>
      queryOne<Record<string, string>>(
        db,
        `select private.format_day('2026-10-18', 'de') as de_day,
                private.format_day('2026-03-01', 'en') as en_day,
                private.format_day('2026-03-01', 'de') as de_march,
                private.category_label('eating_out', null, 'de') as de_key,
                private.category_label('eating_out', null, 'en') as en_key,
                private.category_label('personal_care', null, 'de') as de_care,
                private.category_label(null, 'Velo', 'en') as custom`,
      ),
    );
    expect(row).toEqual({
      de_day: '18. Oktober',
      en_day: '1 March',
      de_march: '1. März',
      de_key: 'Auswärts essen',
      en_key: 'Eating out',
      de_care: 'Körperpflege',
      custom: 'Velo',
    });
  });

  it('writes Swiss German without ß, in every alert type', async () => {
    const texts = await withRollback((db) =>
      queryRows<{ type: string; title: string; body: string }>(
        db,
        `select t.type, x.title, x.body
           from unnest(array['category_50', 'category_80', 'category_100', 'category_over',
                             'total_low', 'pace', 'unusual_purchase', 'daily_allowance', 'payday',
                             'categorize', 'reminder_payday', 'reminder_weekly',
                             'reminder_stale']) as t(type)
          cross join (values ('de'), ('en')) as lang(l)
          cross join lateral private.alert_text(t.type, lang.l, jsonb_build_object(
            'remaining_rappen', 4000, 'balance_rappen', 30000, 'runs_out_on', '2026-10-18',
            'amount_rappen', -24000, 'merchant', 'Manor', 'spent_today_rappen', 8500,
            'allowance_rappen', 6000, 'leftover_rappen', 24000), 'Strasse') as x`,
      ),
    );
    expect(texts).toHaveLength(26);
    for (const text of texts) {
      expect(text.title.length).toBeGreaterThan(0);
      expect(text.body.length).toBeGreaterThan(0);
      expect(`${text.title} ${text.body}`).not.toContain('ß');
    }
  });

  it.each([
    [
      'category_80',
      'de',
      { remaining_rappen: 4_000 },
      '«Auswärts essen» fast aufgebraucht',
      '80 % von «Auswärts essen» sind weg. Noch CHF 40.00 übrig.',
    ],
    [
      'category_over',
      'en',
      { remaining_rappen: -1_250 },
      'Over budget: “Eating out”',
      'You’re CHF 12.50 over your “Eating out” budget.',
    ],
    [
      'pace',
      'de',
      { runs_out_on: '2026-10-18' },
      'Zu schnell unterwegs',
      'Bei diesem Tempo reicht «Auswärts essen» nur bis am 18. Oktober.',
    ],
    [
      'pace',
      'en',
      { runs_out_on: '2026-10-18' },
      'Spending fast',
      'At this pace, “Eating out” runs out on 18 October.',
    ],
    [
      'total_low',
      'de',
      { balance_rappen: -5_000 },
      'Nur noch wenig übrig',
      'Du bist diesen Monat CHF 50.00 im Minus.',
    ],
    [
      'unusual_purchase',
      'en',
      { amount_rappen: -124_050, merchant: 'Manor' },
      'Unusual purchase',
      'CHF 1,240.50 at Manor: much more than you usually spend on “Eating out”.',
    ],
    [
      'payday',
      'de',
      { leftover_rappen: -12_000 },
      'Zahltag!',
      'Ein neuer Monat beginnt. Letzten Monat hast du CHF 120.00 mehr ausgegeben als geplant.',
    ],
  ])('%s in %s', async (type, language, params, title, body) => {
    const row = await withRollback((db) =>
      queryOne<{ title: string; body: string }>(
        db,
        `select * from private.alert_text($1, $2, $3::jsonb,
           private.category_label('eating_out', null, $2))`,
        [type, language, JSON.stringify(params)],
      ),
    );
    expect(row).toEqual({ title, body });
  });

  it('the total pace alert talks about the money, not a category', async () => {
    const row = await withRollback((db) =>
      queryOne<{ body: string }>(
        db,
        `select body from private.alert_text('pace', 'de', '{"runs_out_on": "2026-11-02"}', null)`,
      ),
    );
    expect(row.body).toBe('Bei diesem Tempo reicht dein Geld nur bis am 2. November.');
  });
});

/**
 * A period in its second day with spending booked yesterday: no pace (from day 3) and no daily
 * allowance (nothing spent today) gets in the way of the threshold tests.
 */
const QUIET = { startsDaysAgo: 1 };

describe('category thresholds', () => {
  it('raises 50 % and then 80 % as spending crosses them, each once', async () => {
    await withRollback(async (db) => {
      const f = await budgetUser(db, QUIET);
      await spend(db, f, 19_999, { on: addDays(f.today, -1), category_id: f.groceries });
      expect(await evaluate(db, f.user)).toBe(0);
      await spend(db, f, 1, { on: addDays(f.today, -1), category_id: f.groceries });
      expect(await evaluate(db, f.user)).toBe(1);
      expect(await evaluate(db, f.user)).toBe(0);
      await spend(db, f, 12_000, { on: addDays(f.today, -1), category_id: f.groceries });
      await evaluate(db, f.user);
      const alerts = await alertsOf(db, f.user);
      expect(alerts.map((a) => [a.type, a.silent])).toEqual([
        ['category_50', false],
        ['category_80', false],
      ]);
      expect(alerts[1]).toMatchObject({
        dedupe_key: `category_80:${f.periodId}:${f.groceries}`,
        category_id: f.groceries,
        period_id: f.periodId,
        transaction_id: null,
        title: '«Lebensmittel» fast aufgebraucht',
        body: '80 % von «Lebensmittel» sind weg. Noch CHF 80.00 übrig.',
        params: {
          period_id: f.periodId,
          category_id: f.groceries,
          budget_rappen: GROCERIES_BUDGET,
          spent_rappen: 32_000,
          remaining_rappen: 8_000,
        },
      });
    });
  });

  it('exactly the budget is 100 %, not over; one Rappen more is over', async () => {
    await withRollback(async (db) => {
      const f = await budgetUser(db, QUIET);
      await spend(db, f, EATING_OUT_BUDGET, { on: addDays(f.today, -1), category_id: f.eatingOut });
      await evaluate(db, f.user);
      expect((await alertsOf(db, f.user)).map((a) => a.type)).toEqual([
        'category_100',
        'category_50',
        'category_80',
      ]);
      await spend(db, f, 1, { on: addDays(f.today, -1), category_id: f.eatingOut });
      await evaluate(db, f.user);
      const over = await alertsOf(db, f.user, 'category_over');
      expect(over).toHaveLength(1);
      expect(over[0]?.body).toBe('Du bist CHF 0.01 über dem Budget für «Auswärts essen».');
    });
  });

  it('a jump past every threshold records each one, but only the highest is pushed', async () => {
    await withRollback(async (db) => {
      const f = await budgetUser(db, QUIET);
      await spend(db, f, 45_000, { on: addDays(f.today, -1), category_id: f.groceries });
      expect(await evaluate(db, f.user)).toBe(4);
      const alerts = await alertsOf(db, f.user);
      expect(
        Object.fromEntries(
          alerts.filter((a) => a.type.startsWith('category_')).map((a) => [a.type, a.silent]),
        ),
      ).toEqual({
        category_50: true,
        category_80: true,
        category_100: true,
        category_over: false,
      });
    });
  });

  it('after 50 % was raised, a jump to over records 80 and 100 silently and pushes over', async () => {
    await withRollback(async (db) => {
      const f = await budgetUser(db, QUIET);
      await spend(db, f, 25_000, { on: addDays(f.today, -1), category_id: f.groceries });
      await evaluate(db, f.user);
      await spend(db, f, 20_000, { on: addDays(f.today, -1), category_id: f.groceries });
      expect(await evaluate(db, f.user)).toBe(3);
      const silent = (await alertsOf(db, f.user)).map((a) => `${a.type}:${a.silent}`);
      expect(silent.sort()).toEqual([
        'category_100:true',
        'category_50:false',
        'category_80:true',
        'category_over:false',
      ]);
    });
  });

  it('counts the rollover as part of the budget, and refunds as money back', async () => {
    await withRollback(async (db) => {
      const f = await budgetUser(db, QUIET);
      await db.query('update public.budgets set rollover_rappen = 20000 where id = $1', [
        f.groceriesBudget,
      ]);
      await spend(db, f, 35_000, { on: addDays(f.today, -1), category_id: f.groceries });
      await spend(db, f, -6_000, { on: addDays(f.today, -1), category_id: f.groceries });
      await evaluate(db, f.user);
      // 29'000 of 60'000: under half.
      expect(await alertsOf(db, f.user)).toEqual([]);
    });
  });

  it('a category with nothing to spend goes straight to over; archived categories are quiet', async () => {
    await withRollback(async (db) => {
      const f = await budgetUser(db, QUIET);
      await db.query('update public.budgets set amount_rappen = 0 where id = $1', [
        f.eatingOutBudget,
      ]);
      await spend(db, f, 500, { on: addDays(f.today, -1), category_id: f.eatingOut });
      await spend(db, f, 39_000, { on: addDays(f.today, -1), category_id: f.groceries });
      await db.query('update public.categories set archived_at = now() where id = $1', [
        f.groceries,
      ]);
      await evaluate(db, f.user);
      expect((await alertsOf(db, f.user)).map((a) => a.type)).toEqual(['category_over']);
    });
  });

  it('ignores fixed-cost payments, deleted and merged transactions (the spending rules)', async () => {
    await withRollback(async (db) => {
      const f = await budgetUser(db, QUIET);
      const rent = await make.fixedCost(db, f.user);
      await spend(db, f, 30_000, {
        on: addDays(f.today, -1),
        category_id: f.groceries,
        fixed_cost_id: rent,
      });
      await spend(db, f, 30_000, {
        on: addDays(f.today, -1),
        category_id: f.groceries,
        deleted_at: '2026-10-01T00:00:00Z',
      });
      const survivor = await spend(db, f, 100, {
        on: addDays(f.today, -1),
        category_id: f.eatingOut,
      });
      await spend(db, f, 30_000, {
        on: addDays(f.today, -1),
        category_id: f.groceries,
        merged_into_id: survivor,
      });
      await evaluate(db, f.user);
      expect(await alertsOf(db, f.user)).toEqual([]);
    });
  });

  it('is not raised when the toggle is off, and is raised once it is back on', async () => {
    await withRollback(async (db) => {
      const f = await budgetUser(db, QUIET);
      await setNotifications(db, f.user, { category_thresholds: false });
      await spend(db, f, 25_000, { on: addDays(f.today, -1), category_id: f.groceries });
      expect(await evaluate(db, f.user)).toBe(0);
      await setNotifications(db, f.user, { category_thresholds: true });
      expect(await evaluate(db, f.user)).toBe(1);
    });
  });
});

describe('total_low', () => {
  it('is raised once when the balance drops below 20 % of what can be spent', async () => {
    await withRollback(async (db) => {
      const f = await budgetUser(db);
      const yesterday = addDays(f.today, -1);
      await spend(db, f, 160_000, { on: yesterday });
      await evaluate(db, f.user);
      expect(await alertsOf(db, f.user, 'total_low')).toEqual([]);
      await spend(db, f, 1, { on: yesterday });
      await evaluate(db, f.user);
      await spend(db, f, 50_000, { on: yesterday });
      await evaluate(db, f.user);
      const low = await alertsOf(db, f.user, 'total_low');
      expect(low).toHaveLength(1);
      expect(low[0]).toMatchObject({
        dedupe_key: `total_low:${f.periodId}`,
        title: 'Nur noch wenig übrig',
        body: 'Diesen Monat bleiben dir noch CHF 399.99 (unter 20 %).',
        params: {
          period_id: f.periodId,
          spendable_rappen: SPENDABLE,
          spent_rappen: 160_001,
          balance_rappen: 39_999,
        },
      });
    });
  });

  it('is off with its toggle', async () => {
    await withRollback(async (db) => {
      const f = await budgetUser(db);
      await setNotifications(db, f.user, { total_low: false });
      await spend(db, f, 190_000, { on: addDays(f.today, -1) });
      await evaluate(db, f.user);
      expect(await alertsOf(db, f.user, 'total_low')).toEqual([]);
    });
  });
});

describe('pace', () => {
  it('warns once per period when a category runs out before payday at this rate', async () => {
    await withRollback(async (db) => {
      // Day 11 of 30: 15'000 of 20'000 spent → 1'363 a day → 5'000 last 3 more days.
      const f = await budgetUser(db, { startsDaysAgo: 10 });
      await spend(db, f, 15_000, { category_id: f.eatingOut, on: addDays(f.today, -2) });
      await evaluate(db, f.user);
      const pace = await alertsOf(db, f.user, 'pace');
      const runsOut = addDays(f.today, 3);
      expect(pace).toHaveLength(1);
      expect(pace[0]).toMatchObject({
        dedupe_key: `pace:${f.periodId}:${f.eatingOut}`,
        category_id: f.eatingOut,
        params: {
          period_id: f.periodId,
          category_id: f.eatingOut,
          scope: 'category',
          available_rappen: EATING_OUT_BUDGET,
          spent_rappen: 15_000,
          daily_average_rappen: 1_363,
          runs_out_on: runsOut,
          ends_on: f.endsOn,
        },
      });
      const day = await queryOne<{ day: string }>(
        db,
        `select private.format_day($1, 'de') as day`,
        [runsOut],
      );
      expect(pace[0]?.body).toBe(`Bei diesem Tempo reicht «Auswärts essen» nur bis am ${day.day}.`);
      await spend(db, f, 1_000, { category_id: f.eatingOut });
      await evaluate(db, f.user);
      expect(await alertsOf(db, f.user, 'pace')).toHaveLength(1);
    });
  });

  it('stays quiet at a rate that lasts until payday, and in the first two days', async () => {
    await withRollback(async (db) => {
      const slow = await budgetUser(db, { startsDaysAgo: 10 });
      await spend(db, slow, 6_000, { category_id: slow.eatingOut });
      await evaluate(db, slow.user);
      expect(await alertsOf(db, slow.user, 'pace')).toEqual([]);

      const early = await budgetUser(db, { startsDaysAgo: 1 });
      await spend(db, early, 9_000, { category_id: early.eatingOut });
      await evaluate(db, early.user);
      expect(await alertsOf(db, early.user, 'pace')).toEqual([]);
      // Day 3: the same spending now warns.
      await evaluate(
        db,
        early.user,
        [],
        await localTime(db, addDays(early.today, 1), '12:00', early.timezone),
      );
      expect(await alertsOf(db, early.user, 'pace')).toHaveLength(1);
    });
  });

  it('warns about the total too, with its own key', async () => {
    await withRollback(async (db) => {
      const f = await budgetUser(db, { startsDaysAgo: 10 });
      await spend(db, f, 150_000, { on: addDays(f.today, -3) });
      await evaluate(db, f.user);
      const total = (await alertsOf(db, f.user, 'pace')).find((a) => a.params.scope === 'total');
      expect(total).toMatchObject({ dedupe_key: `pace:${f.periodId}:total`, category_id: null });
      expect(total?.body).toMatch(/^Bei diesem Tempo reicht dein Geld nur bis am /);
      expect(total?.params.runs_out_on).toBe(addDays(f.today, 3));
    });
  });

  it('is off with its toggle', async () => {
    await withRollback(async (db) => {
      const f = await budgetUser(db, { startsDaysAgo: 10 });
      await setNotifications(db, f.user, { pace: false });
      await spend(db, f, 15_000, { category_id: f.eatingOut });
      await evaluate(db, f.user);
      expect(await alertsOf(db, f.user, 'pace')).toEqual([]);
    });
  });

  it('internal.pace_runs_out: today + remaining ÷ daily average, null without a forecast', async () => {
    const row = await withRollback((db) =>
      queryOne<Record<string, string | null>>(
        db,
        `select internal.pace_runs_out(20000, 15000, '2026-10-01', '2026-10-11')::text as fast,
                internal.pace_runs_out(20000, 0, '2026-10-01', '2026-10-11')::text as nothing_spent,
                internal.pace_runs_out(20000, 20000, '2026-10-01', '2026-10-11')::text as used_up,
                internal.pace_runs_out(30000, 1000, '2026-10-01', '2026-10-01')::text as first_day`,
      ),
    );
    expect(row).toEqual({
      fast: '2026-10-14',
      nothing_spent: null,
      used_up: null,
      first_day: '2026-10-30',
    });
  });
});

describe('daily_allowance', () => {
  it('is raised once a day when today’s spending exceeds what is left per day', async () => {
    await withRollback(async (db) => {
      // 200'000 left at the start of today, 20 days to go (today included): 10'000 a day.
      const f = await budgetUser(db, { startsDaysAgo: 10 });
      await spend(db, f, 10_000);
      await evaluate(db, f.user);
      expect(await alertsOf(db, f.user, 'daily_allowance')).toEqual([]);
      await spend(db, f, 2_000, { category_id: f.groceries });
      await evaluate(db, f.user);
      await spend(db, f, 2_000);
      await evaluate(db, f.user);
      const daily = await alertsOf(db, f.user, 'daily_allowance');
      expect(daily).toHaveLength(1);
      expect(daily[0]).toMatchObject({
        dedupe_key: `daily_allowance:${f.today}`,
        body: 'Heute hast du CHF 120.00 ausgegeben, dein Tagesbudget ist CHF 100.00.',
        params: { date: f.today, allowance_rappen: 10_000, spent_today_rappen: 12_000 },
      });
    });
  });

  it('uses the local day: spending of yesterday evening lowers today’s allowance, not today’s spending', async () => {
    await withRollback(async (db) => {
      const f = await budgetUser(db, { startsDaysAgo: 10, timezone: 'Pacific/Auckland' });
      await spend(db, f, 100_000, { on: addDays(f.today, -1), time: '23:30' });
      // 100'000 over 20 days: 5'000 a day.
      await spend(db, f, 5_001, { time: '00:30' });
      await evaluate(db, f.user);
      expect(await alertsOf(db, f.user, 'daily_allowance')).toMatchObject([
        { params: { allowance_rappen: 5_000, spent_today_rappen: 5_001 } },
      ]);
    });
  });

  it('is quiet when nothing was left, and off with its toggle', async () => {
    await withRollback(async (db) => {
      const broke = await budgetUser(db, { startsDaysAgo: 10 });
      await spend(db, broke, SPENDABLE, { on: addDays(broke.today, -1) });
      await spend(db, broke, 100);
      await evaluate(db, broke.user);
      expect(await alertsOf(db, broke.user, 'daily_allowance')).toEqual([]);

      const off = await budgetUser(db, { startsDaysAgo: 10 });
      await setNotifications(db, off.user, { daily_allowance: false });
      await spend(db, off, 50_000);
      await evaluate(db, off.user);
      expect(await alertsOf(db, off.user, 'daily_allowance')).toEqual([]);
    });
  });
});

describe('payday', () => {
  /** A user in a period that follows a closed one (leftover as given). */
  async function withPreviousPeriod(db: Db, startsDaysAgo: number, leftover: number) {
    const f = await budgetUser(db, { startsDaysAgo });
    const previous = await make.period(db, f.user, {
      starts_on: addDays(f.startsOn, -30),
      ends_on: f.startsOn,
      closed_at: '2026-10-01T00:00:00Z',
      leftover_action: 'rollover',
      leftover_rappen: leftover,
    });
    return { f, previous };
  }

  it('is raised once in a period that follows a closed one, with last period’s outcome', async () => {
    await withRollback(async (db) => {
      const { f, previous } = await withPreviousPeriod(db, 2, 24_000);
      await evaluate(db, f.user);
      await evaluate(db, f.user);
      const payday = await alertsOf(db, f.user, 'payday');
      expect(payday).toHaveLength(1);
      expect(payday[0]).toMatchObject({
        dedupe_key: `payday:${f.periodId}`,
        period_id: f.periodId,
        title: 'Zahltag!',
        body: 'Ein neuer Monat beginnt. Letzten Monat sind CHF 240.00 übrig geblieben.',
        params: {
          period_id: f.periodId,
          previous_period_id: previous,
          previous_spent_rappen: 0,
          leftover_rappen: 24_000,
          leftover_action: 'rollover',
          carried_over_rappen: 0,
        },
      });
    });
  });

  it('is not raised for the first period, after its first week, or with the toggle off', async () => {
    await withRollback(async (db) => {
      const first = await budgetUser(db, { startsDaysAgo: 0 });
      await evaluate(db, first.user);
      expect(await alertsOf(db, first.user, 'payday')).toEqual([]);

      const { f: late } = await withPreviousPeriod(db, 7, 1_000);
      await evaluate(db, late.user);
      expect(await alertsOf(db, late.user, 'payday')).toEqual([]);

      const { f: off } = await withPreviousPeriod(db, 1, 1_000);
      await setNotifications(db, off.user, { payday: false });
      await evaluate(db, off.user);
      expect(await alertsOf(db, off.user, 'payday')).toEqual([]);
    });
  });
});

describe('transaction alerts through the RPCs', () => {
  async function addManual(db: Db, user: string, row: object) {
    await asUser(db, user);
    const result = await queryOne<{ result: { results: { transaction_id: string }[] } }>(
      db,
      `select public.add_transactions($1::jsonb) as result`,
      [
        JSON.stringify({
          rows: [{ source: 'manual', booked_at: new Date().toISOString(), ...row }],
        }),
      ],
    );
    return result.result.results[0]?.transaction_id ?? '';
  }

  it('unusual_purchase: over 3 × the category’s median of 90 days and over CHF 50', async () => {
    await withRollback(async (db) => {
      const f = await budgetUser(db, { startsDaysAgo: 3 });
      for (const [rappen, daysAgo] of [
        [2_000, 10],
        [2_500, 40],
        [3_000, 80],
        [90_000, 120],
      ] as const) {
        await spend(db, f, rappen, { category_id: f.eatingOut, on: addDays(f.today, -daysAgo) });
      }
      await setNotifications(db, f.user, { category_thresholds: false });
      const normal = await addManual(db, f.user, {
        booked_at: new Date(Date.now() - 60_000).toISOString(),
        amount_rappen: -7_500,
        merchant: 'Kronenhalle',
        category_id: f.eatingOut,
      });
      const unusual = await addManual(db, f.user, {
        amount_rappen: -8_300,
        merchant: 'Kronenhalle Bar',
        category_id: f.eatingOut,
      });
      const alerts = await alertsOf(db, f.user, 'unusual_purchase');
      expect(alerts).toHaveLength(1);
      expect(normal).not.toBe(unusual);
      expect(alerts[0]).toMatchObject({
        dedupe_key: `unusual_purchase:${unusual}`,
        transaction_id: unusual,
        category_id: f.eatingOut,
        title: 'Ungewöhnlicher Einkauf',
        body: 'CHF 83.00 bei Kronenhalle Bar: viel mehr als sonst für «Auswärts essen».',
        params: {
          transaction_id: unusual,
          category_id: f.eatingOut,
          amount_rappen: -8_300,
          // 2'000, 2'500, 3'000 and the 75.00 just before (the 900.00 is older than 90 days).
          median_rappen: 2_750,
          merchant: 'Kronenhalle Bar',
        },
      });
    });
  });

  it('unusual_purchase needs three earlier purchases and more than CHF 50', async () => {
    await withRollback(async (db) => {
      const f = await budgetUser(db, { startsDaysAgo: 3 });
      await spend(db, f, 1_000, { category_id: f.groceries, on: addDays(f.today, -5) });
      await spend(db, f, 1_000, { category_id: f.groceries, on: addDays(f.today, -6) });
      await setNotifications(db, f.user, { category_thresholds: false });
      await addManual(db, f.user, {
        amount_rappen: -9_000,
        merchant: 'Globus',
        category_id: f.groceries,
      });
      await spend(db, f, 1_000, { category_id: f.groceries, on: addDays(f.today, -7) });
      await addManual(db, f.user, {
        amount_rappen: -4_500,
        merchant: 'Coop',
        category_id: f.groceries,
      });
      expect(await alertsOf(db, f.user, 'unusual_purchase')).toEqual([]);
    });
  });

  it('categorize: a recent purchase from a feed that needs a category, once', async () => {
    await withRollback(async (db) => {
      const f = await budgetUser(db);
      const tx = await spend(db, f, 8_400, {
        merchant: 'Manor',
        source: 'bank',
        categorized_by: 'none',
        category_confidence: null,
      });
      await asUser(db, f.user);
      await db.query(`select public.update_transaction($1, '{"note": "Geschenk?"}')`, [tx]);
      await db.query(`select public.update_transaction($1, '{"note": "Geschenk"}')`, [tx]);
      const alerts = await alertsOf(db, f.user, 'categorize');
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toMatchObject({
        dedupe_key: `categorize:${tx}`,
        transaction_id: tx,
        title: 'Was war das?',
        body: 'CHF 84.00 bei Manor. Wähle eine Kategorie.',
        params: { transaction_id: tx, amount_rappen: -8_400, merchant: 'Manor' },
      });
    });
  });

  it('categorize skips manual entries, statement rows, old purchases, splits and the toggle off', async () => {
    await withRollback(async (db) => {
      const f = await budgetUser(db);
      const open = { categorized_by: 'none', category_confidence: null };
      const manual = await spend(db, f, 1_000, { ...open, source: 'manual' });
      const statement = await spend(db, f, 1_000, { ...open, source: 'statement_import' });
      const old = await spend(db, f, 1_000, { ...open, source: 'bank', on: addDays(f.today, -3) });
      const split = await spend(db, f, 1_000, { ...open, source: 'bank' });
      await make.split(db, f.user, split, -500);
      await make.split(db, f.user, split, -500);
      const sure = await spend(db, f, 1_000, {
        source: 'bank',
        categorized_by: 'merchant_list',
        category_confidence: 90,
        category_id: f.groceries,
      });
      await evaluate(db, f.user, [manual, statement, old, split, sure]);
      expect(await alertsOf(db, f.user, 'categorize')).toEqual([]);

      const feed = await spend(db, f, 1_000, { ...open, source: 'bank' });
      await setNotifications(db, f.user, { categorize_requests: false });
      await evaluate(db, f.user, [feed]);
      expect(await alertsOf(db, f.user, 'categorize')).toEqual([]);
    });
  });

  it('add_transactions raises the period alerts it causes; a dry run stores no transaction alert', async () => {
    await withRollback(async (db) => {
      const f = await budgetUser(db);
      await asUser(db, f.user);
      await db.query(`select public.add_transactions($1::jsonb)`, [
        JSON.stringify({
          rows: [
            {
              source: 'manual',
              booked_at: new Date().toISOString(),
              amount_rappen: -45_000,
              merchant: 'Jelmoli',
              category_id: f.groceries,
            },
          ],
          dry_run: true,
        }),
      ]);
      expect(await alertsOf(db, f.user)).toEqual([]);
      await addManual(db, f.user, {
        amount_rappen: -45_000,
        merchant: 'Jelmoli',
        category_id: f.groceries,
      });
      const types = (await alertsOf(db, f.user)).map((a) => a.type);
      expect(types.filter((type) => type.startsWith('category_')).sort()).toEqual([
        'category_100',
        'category_50',
        'category_80',
        'category_over',
      ]);
    });
  });

  it('set_transaction_splits and remove_import re-evaluate the period', async () => {
    await withRollback(async (db) => {
      const f = await budgetUser(db);
      const tx = await spend(db, f, 30_000, { category_id: null, source: 'bank' });
      await asUser(db, f.user);
      await db.query(`select public.set_transaction_splits($1, $2::jsonb)`, [
        tx,
        JSON.stringify([
          { category_id: f.eatingOut, amount_rappen: -25_000, note: null },
          { category_id: f.groceries, amount_rappen: -5_000, note: null },
        ]),
      ]);
      expect((await alertsOf(db, f.user, 'category_over'))[0]?.category_id).toBe(f.eatingOut);
    });
  });

  it('internal.evaluate_alerts works only for the signed-in user (42501 otherwise)', async () => {
    await withRollback(async (db) => {
      const a = await budgetUser(db);
      const b = await budgetUser(db);
      await spend(db, b, 30_000, { category_id: b.groceries });
      await asUser(db, a.user);
      await expectSqlError(
        db,
        SQLSTATE.insufficientPrivilege,
        'select internal.evaluate_alerts($1)',
        [b.user],
      );
      await asAuthenticatedWithoutUser(db);
      await expectSqlError(
        db,
        SQLSTATE.insufficientPrivilege,
        'select internal.evaluate_alerts($1)',
        [b.user],
      );
      await asUser(db, b.user);
      await db.query('select internal.evaluate_alerts($1)', [b.user]);
      expect(await alertsOf(db, b.user, 'category_50')).toHaveLength(1);
      expect(await alertsOf(db, a.user)).toEqual([]);
    });
  });

  it('writes alerts in English for an English profile', async () => {
    await withRollback(async (db) => {
      const f = await budgetUser(db, { language: 'en' });
      await spend(db, f, 16_000, { category_id: f.eatingOut });
      await evaluate(db, f.user);
      expect(await alertsOf(db, f.user, 'category_80')).toMatchObject([
        {
          title: '“Eating out” almost used up',
          body: '80% of “Eating out” is gone. CHF 40.00 left.',
        },
      ]);
    });
  });

  it('raises nothing before onboarding', async () => {
    await withRollback(async (db) => {
      const user = await createUser(db);
      expect(await evaluate(db, user)).toBe(0);
    });
  });
});

describe('reminders (D-044)', () => {
  it('weekly: on the chosen ISO weekday from the chosen local time, once that day', async () => {
    await withRollback(async (db) => {
      const f = await budgetUser(db, { timezone: 'America/New_York' });
      const weekday = await queryOne<{ d: number }>(
        db,
        `select extract(isodow from $1::date)::int as d`,
        [f.today],
      );
      await setNotifications(db, f.user, {
        reminder_weekly_day: weekday.d,
        reminder_weekly_time: '18:00',
      });
      expect(await remind(db, f.user, await localTime(db, f.today, '17:59', f.timezone))).toBe(0);
      expect(await remind(db, f.user, await localTime(db, f.today, '18:00', f.timezone))).toBe(1);
      expect(await remind(db, f.user, await localTime(db, f.today, '23:00', f.timezone))).toBe(0);
      // The next day is another weekday.
      expect(
        await remind(db, f.user, await localTime(db, addDays(f.today, 1), '19:00', f.timezone)),
      ).toBe(0);
      const weekly = await alertsOf(db, f.user, 'reminder_weekly');
      expect(weekly).toMatchObject([
        {
          dedupe_key: `reminder_weekly:${f.today}`,
          title: 'Wochenrückblick',
          body: 'Erfasse dein Bargeld und importiere deinen Kontoauszug.',
          params: { date: f.today },
        },
      ]);
      // A week later it comes again.
      expect(
        await remind(db, f.user, await localTime(db, addDays(f.today, 7), '18:30', f.timezone)),
      ).toBe(1);
    });
  });

  it('weekly: the day and time are the user’s, not UTC', async () => {
    await withRollback(async (db) => {
      const f = await budgetUser(db, { timezone: 'Pacific/Auckland' });
      const weekday = await queryOne<{ d: number }>(
        db,
        `select extract(isodow from $1::date)::int as d`,
        [f.today],
      );
      await setNotifications(db, f.user, {
        reminder_weekly_day: weekday.d,
        reminder_weekly_time: '08:00',
      });
      // 08:30 in Auckland is the previous day in UTC.
      const at = await localTime(db, f.today, '08:30', f.timezone);
      expect(at.slice(0, 10)).toBe(addDays(f.today, -1));
      expect(await remind(db, f.user, at)).toBe(1);
    });
  });

  it('weekly: off with its toggle; the defaults are Sunday 18:00, everything on', async () => {
    await withRollback(async (db) => {
      const f = await budgetUser(db);
      const defaults = await queryOne<Record<string, unknown>>(
        db,
        `select reminder_payday, reminder_weekly, reminder_weekly_day,
                reminder_weekly_time::text as reminder_weekly_time, reminder_stale
           from public.notification_settings where user_id = $1`,
        [f.user],
      );
      expect(defaults).toEqual({
        reminder_payday: true,
        reminder_weekly: true,
        reminder_weekly_day: 7,
        reminder_weekly_time: '18:00:00',
        reminder_stale: true,
      });
      const weekday = await queryOne<{ d: number }>(
        db,
        `select extract(isodow from $1::date)::int as d`,
        [f.today],
      );
      await setNotifications(db, f.user, {
        reminder_weekly_day: weekday.d,
        reminder_weekly: false,
      });
      expect(await remind(db, f.user, await localTime(db, f.today, '20:00', f.timezone))).toBe(0);
    });
  });

  it('rejects a weekday outside 1–7', async () => {
    await withRollback(async (db) => {
      const f = await budgetUser(db);
      await asUser(db, f.user);
      await expectSqlError(
        db,
        SQLSTATE.checkViolation,
        'update public.notification_settings set reminder_weekly_day = 0 where user_id = $1',
        [f.user],
      );
    });
  });

  it('payday: on the first day of a new period from 09:00, once', async () => {
    await withRollback(async (db) => {
      const f = await budgetUser(db, { startsDaysAgo: 0 });
      // The first period after onboarding is not a payday.
      expect(await remind(db, f.user, await localTime(db, f.today, '10:00', f.timezone))).toBe(0);
      await make.period(db, f.user, {
        starts_on: addDays(f.today, -30),
        ends_on: f.today,
        closed_at: '2026-10-01T00:00:00Z',
        leftover_action: 'reset',
        leftover_rappen: 0,
      });
      expect(await remind(db, f.user, await localTime(db, f.today, '08:59', f.timezone))).toBe(0);
      expect(await remind(db, f.user, await localTime(db, f.today, '09:00', f.timezone))).toBe(1);
      expect(await remind(db, f.user, await localTime(db, f.today, '15:00', f.timezone))).toBe(0);
      expect(await alertsOf(db, f.user, 'reminder_payday')).toMatchObject([
        {
          dedupe_key: `reminder_payday:${f.periodId}`,
          period_id: f.periodId,
          title: 'Plane deinen neuen Monat',
          body: 'Heute ist Zahltag. Nimm dir zwei Minuten für deine Budgets.',
        },
      ]);
      // Not on the second day of the period.
      await setNotifications(db, f.user, { reminder_payday: false });
      expect(await remind(db, f.user, await localTime(db, f.today, '10:00', f.timezone))).toBe(0);
    });
  });

  it('stale: no budget change for 30 days, once until the budget changes', async () => {
    await withRollback(async (db) => {
      const user = await createUser(db);
      await onboard(db, user, { timezone: 'Europe/Zurich' });
      const today = await todayIn(db, 'Europe/Zurich');
      const old = new Date(Date.now() - 40 * 86_400_000).toISOString();
      await db.query('update public.profiles set onboarding_completed_at = $2 where id = $1', [
        user,
        old,
      ]);
      const period = await make.period(db, user, {
        starts_on: addDays(today, -5),
        ends_on: addDays(today, 25),
      });
      const category = await make.category(db, user, { created_at: old, updated_at: old });
      // A budget copied by the payday reset (created, never changed) is no change.
      await make.budget(db, user, period, category, { created_at: old, updated_at: old });
      const morning = await localTime(db, today, '10:00', 'Europe/Zurich');
      expect(await remind(db, user, await localTime(db, today, '08:00', 'Europe/Zurich'))).toBe(0);
      expect(await remind(db, user, morning)).toBe(1);
      expect(await remind(db, user, morning)).toBe(0);
      expect((await alertsOf(db, user, 'reminder_stale'))[0]).toMatchObject({
        title: 'Passt dein Budget noch?',
        body: 'Du hast dein Budget seit 30 Tagen nicht angepasst. Schau kurz rein.',
      });

      await asUser(db, user);
      await db.query('select public.set_budget($1, 12345)', [category]);
      expect(await remind(db, user, morning)).toBe(0);
    });
  });

  it('stale: not within 30 days of onboarding, nor with the toggle off', async () => {
    await withRollback(async (db) => {
      const recent = await budgetUser(db);
      expect(
        await remind(db, recent.user, await localTime(db, recent.today, '10:00', recent.timezone)),
      ).toBe(0);
      await asPostgres(db);
      await db.query(
        `update public.profiles set onboarding_completed_at = now() - interval '40 days' where id = $1`,
        [recent.user],
      );
      // Categories were created today: still recent.
      expect(
        await remind(db, recent.user, await localTime(db, recent.today, '10:00', recent.timezone)),
      ).toBe(0);
    });
  });
});

describe('run_scheduled_alerts()', () => {
  it('raises reminders and period alerts for every onboarded user as of the given time', async () => {
    await withRollback(async (db) => {
      const a = await budgetUser(db, { startsDaysAgo: 1 });
      const b = await budgetUser(db, { startsDaysAgo: 1, timezone: 'Asia/Tokyo' });
      await spend(db, a, 25_000, { category_id: a.groceries, on: addDays(a.today, -1) });
      for (const f of [a, b]) {
        const weekday = await queryOne<{ d: number }>(
          db,
          `select extract(isodow from $1::date)::int as d`,
          [f.today],
        );
        await setNotifications(db, f.user, {
          reminder_weekly_day: weekday.d,
          reminder_weekly_time: '00:00',
        });
      }
      await createUser(db); // not onboarded: skipped
      const row = await queryOne<{ created: number }>(
        db,
        'select public.run_scheduled_alerts() as created',
      );
      expect(row.created).toBeGreaterThanOrEqual(3);
      expect((await alertsOf(db, a.user)).map((x) => x.type).sort()).toEqual([
        'category_50',
        'reminder_weekly',
      ]);
      expect((await alertsOf(db, b.user)).map((x) => x.type)).toEqual(['reminder_weekly']);
      const again = await queryOne<{ created: number }>(
        db,
        'select public.run_scheduled_alerts() as created',
      );
      expect(again.created).toBe(0);
    });
  });

  it('is scheduled hourly with pg_cron', async () => {
    const job = await withRollback((db) =>
      queryOne<{ schedule: string; command: string }>(
        db,
        `select schedule, command from cron.job where jobname = 'run-scheduled-alerts'`,
      ),
    );
    expect(job).toEqual({
      schedule: '15 * * * *',
      command: 'select public.run_scheduled_alerts()',
    });
  });
});
