/**
 * Period math and leftover settlement in the database mirror the shared TypeScript engine
 * (packages/core/src/engine), and profiles only accept real time zone names.
 */
import {
  LEFTOVER_POLICIES,
  MAX_ABS_RAPPEN,
  periodContaining,
  settleLeftover,
  type LeftoverPolicy,
} from '@budget/core';
import { describe, expect, it } from 'vitest';
import {
  SQLSTATE,
  asAnon,
  asPostgres,
  asUser,
  createUser,
  expectSqlError,
  queryOne,
  queryRows,
  withRollback,
} from './db';

describe('public.period_containing mirrors periodContaining()', () => {
  it('agrees for every day of 2024–2027 and every payday from 1 to 31', async () => {
    const rows = await withRollback((db) =>
      queryRows<{ date: string; payday: number; starts_on: string; ends_on: string }>(
        db,
        `select day::date::text as date, payday,
                period.starts_on::text as starts_on, period.ends_on::text as ends_on
           from generate_series('2024-01-01'::date, '2027-12-31'::date, interval '1 day') as day
          cross join generate_series(1, 31) as payday
          cross join lateral public.period_containing(day::date, payday) as period
          order by 1, 2`,
      ),
    );
    expect(rows).toHaveLength(1461 * 31);
    const mismatches = rows.flatMap((row) => {
      const expected = periodContaining(row.date, row.payday);
      return expected.startsOn === row.starts_on && expected.endsOn === row.ends_on
        ? []
        : [`${row.date} payday ${row.payday}: db ${row.starts_on}..${row.ends_on}`];
    });
    expect(mismatches).toEqual([]);
  });

  it.each([
    ['2026-10-02', 25, '2026-09-25', '2026-10-25'],
    ['2026-10-25', 25, '2026-10-25', '2026-11-25'],
    ['2026-10-24', 25, '2026-09-25', '2026-10-25'],
    ['2026-03-30', 31, '2026-02-28', '2026-03-31'],
    ['2026-03-31', 31, '2026-03-31', '2026-04-30'],
    ['2024-02-29', 30, '2024-02-29', '2024-03-30'],
    ['2026-12-31', 1, '2026-12-01', '2027-01-01'],
    ['2027-01-01', 1, '2027-01-01', '2027-02-01'],
  ] as const)('%s with payday %i is %s..%s', async (date, payday, startsOn, endsOn) => {
    const row = await withRollback((db) =>
      queryOne<{ starts_on: string; ends_on: string }>(
        db,
        `select starts_on::text, ends_on::text from public.period_containing($1, $2)`,
        [date, payday],
      ),
    );
    expect(row).toEqual({ starts_on: startsOn, ends_on: endsOn });
    expect(periodContaining(date, payday)).toEqual({ startsOn, endsOn });
  });

  it.each([0, 32, -1, null])('rejects payday %s (22023), like the engine', async (payday) => {
    await withRollback(async (db) => {
      const error = await expectSqlError(
        db,
        SQLSTATE.invalidParameterValue,
        `select * from public.period_containing('2026-10-02', $1)`,
        [payday],
      );
      expect(error.message).toBe('payday must be a day of the month from 1 to 31');
    });
    expect(() => periodContaining('2026-10-02', payday as number)).toThrow(RangeError);
  });

  it('rejects a missing date (22023)', async () => {
    await withRollback(async (db) => {
      await expectSqlError(
        db,
        SQLSTATE.invalidParameterValue,
        'select * from public.period_containing(null, 25)',
      );
    });
  });

  it('is immutable', async () => {
    const row = await withRollback((db) =>
      queryOne<{ volatility: string }>(
        db,
        `select provolatile as volatility from pg_proc
          where oid = 'public.period_containing(date, integer)'::regprocedure`,
      ),
    );
    expect(row.volatility).toBe('i');
  });

  it('can be called by a signed-in user but not by anon', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await asUser(db, a);
      const row = await queryOne<{ starts_on: string }>(
        db,
        `select starts_on::text from public.period_containing('2026-10-02', 25)`,
      );
      expect(row.starts_on).toBe('2026-09-25');
      await asAnon(db);
      await expectSqlError(
        db,
        SQLSTATE.insufficientPrivilege,
        `select * from public.period_containing('2026-10-02', 25)`,
      );
    });
  });
});

describe('private.settle_leftover mirrors settleLeftover()', () => {
  const AMOUNTS = [
    -MAX_ABS_RAPPEN,
    -MAX_ABS_RAPPEN + 1,
    -1_234_567,
    -100,
    -1,
    0,
    1,
    99,
    100,
    248_000,
    1_234_567,
    MAX_ABS_RAPPEN - 1,
    MAX_ABS_RAPPEN,
  ];

  it('agrees for every policy and a range of amounts (deficits, zero, bounds)', async () => {
    const rows = await withRollback((db) =>
      queryRows<{ policy: LeftoverPolicy; amount: string; carried: string; to_savings: string }>(
        db,
        `select policy, amount::text, settled.carried_over::text as carried,
                settled.to_savings::text as to_savings
           from unnest($1::text[]) as policy
          cross join unnest($2::bigint[]) as amount
          cross join lateral private.settle_leftover(policy, amount) as settled`,
        [LEFTOVER_POLICIES, AMOUNTS],
      ),
    );
    expect(rows).toHaveLength(LEFTOVER_POLICIES.length * AMOUNTS.length);
    const mismatches = rows.flatMap((row) => {
      const expected = settleLeftover(row.policy, Number(row.amount));
      const actual = { carried: Number(row.carried), toSavings: Number(row.to_savings) };
      return actual.carried === expected.carriedOverRappen &&
        actual.toSavings === expected.toSavingsRappen
        ? []
        : [`${row.policy} ${row.amount}: db ${row.carried}/${row.to_savings}`];
    });
    expect(mismatches).toEqual([]);
  });

  it.each([
    ['rollover', 248_000, 248_000, 0],
    ['rollover', -12_000, -12_000, 0],
    ['savings', 248_000, 0, 248_000],
    ['savings', -12_000, 0, 0],
    ['reset', 248_000, 0, 0],
    ['reset', -12_000, 0, 0],
  ] as const)('%s with %i carries %i and saves %i', async (policy, leftover, carried, saved) => {
    const row = await withRollback((db) =>
      queryOne<{ carried: number; saved: number }>(
        db,
        `select carried_over::int as carried, to_savings::int as saved
           from private.settle_leftover($1, $2)`,
        [policy, leftover],
      ),
    );
    expect(row).toEqual({ carried, saved });
  });

  it.each([MAX_ABS_RAPPEN + 1, -MAX_ABS_RAPPEN - 1])(
    'rejects %i Rappen (out of bounds, 22003), like the engine',
    async (amount) => {
      await withRollback(async (db) => {
        await expectSqlError(
          db,
          SQLSTATE.numericValueOutOfRange,
          `select * from private.settle_leftover('rollover', $1)`,
          [amount],
        );
      });
      expect(() => settleLeftover('rollover', amount)).toThrow(RangeError);
    },
  );

  it.each(['bonus', '', null])('rejects the unknown policy %s (22023)', async (policy) => {
    await withRollback(async (db) => {
      const error = await expectSqlError(
        db,
        SQLSTATE.invalidParameterValue,
        'select * from private.settle_leftover($1, 100)',
        [policy],
      );
      expect(error.message).toMatch(/^unknown leftover policy/);
    });
    expect(() => settleLeftover(policy as LeftoverPolicy, 100)).toThrow(RangeError);
  });

  it('is immutable', async () => {
    const row = await withRollback((db) =>
      queryOne<{ volatility: string }>(
        db,
        `select provolatile as volatility from pg_proc
          where oid = 'private.settle_leftover(text, bigint)'::regprocedure`,
      ),
    );
    expect(row.volatility).toBe('i');
  });
});

describe('profiles.timezone must be a known time zone name', () => {
  it.each(['Europe/Zurich', 'America/New_York', 'Pacific/Kiritimati', 'UTC'])(
    'accepts %s',
    async (zone) => {
      await withRollback(async (db) => {
        const a = await createUser(db);
        await asUser(db, a);
        const row = await queryOne<{ timezone: string }>(
          db,
          'update public.profiles set timezone = $2 where id = $1 returning timezone',
          [a, zone],
        );
        expect(row.timezone).toBe(zone);
      });
    },
  );

  it.each(['Mars/Olympus', 'europe/zurich', 'CEST', 'UTC+2', ' Europe/Zurich'])(
    'rejects %s with 22023 invalid_timezone',
    async (zone) => {
      await withRollback(async (db) => {
        const a = await createUser(db);
        await asUser(db, a);
        const error = await expectSqlError(
          db,
          SQLSTATE.invalidParameterValue,
          'update public.profiles set timezone = $2 where id = $1',
          [a, zone],
        );
        expect(error.message).toBe('invalid_timezone');
        await asPostgres(db);
        const row = await queryOne<{ timezone: string }>(
          db,
          'select timezone from public.profiles where id = $1',
          [a],
        );
        expect(row.timezone).toBe('Europe/Zurich');
      });
    },
  );

  it('is checked on insert as well', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await db.query('delete from public.profiles where id = $1', [a]);
      const error = await expectSqlError(
        db,
        SQLSTATE.invalidParameterValue,
        `insert into public.profiles (id, timezone) values ($1, 'Mars/Olympus')`,
        [a],
      );
      expect(error.message).toBe('invalid_timezone');
      await db.query(`insert into public.profiles (id, timezone) values ($1, 'Europe/Zurich')`, [
        a,
      ]);
    });
  });
});
