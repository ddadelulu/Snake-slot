/**
 * Push delivery in the database: device tokens (register_push_token / unregister_push_token, RLS,
 * no direct writes) and claim_pushes for the send-pushes Edge Function: what is due, quiet hours
 * across midnight in the user's time zone, the daily cap counted per local day, at most once.
 */
import { describe, expect, it } from 'vitest';
import {
  type Db,
  SQLSTATE,
  asPostgres,
  asUser,
  countRows,
  createUser,
  expectSqlError,
  make,
  onboard,
  queryOne,
  queryRows,
  todayIn,
  withRollback,
} from './db';
import { addDays, localTime, setNotifications } from './m4';

interface Claimed {
  alert_id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound: boolean;
  tokens: string[];
}

/** Calls claim_pushes as the service role (the Edge Function). */
async function claim(db: Db, now: string, limit = 100): Promise<Claimed[]> {
  await db.query('set local role service_role');
  const rows = await queryRows<Claimed>(db, 'select * from public.claim_pushes($1, $2)', [
    limit,
    now,
  ]);
  await asPostgres(db);
  return rows;
}

/** An onboarded user in `timezone` with one device. */
async function deviceUser(db: Db, timezone = 'Europe/Zurich'): Promise<string> {
  const user = await createUser(db);
  await onboard(db, user, { timezone });
  await make.pushToken(db, user, { token: `ExponentPushToken[${user}]` });
  return user;
}

/** An alert created `minutesBefore` minutes before `now`. */
async function alertAt(db: Db, user: string, now: string, minutesBefore = 1, values = {}) {
  await asPostgres(db);
  return make.alert(db, user, {
    created_at: new Date(Date.parse(now) - minutesBefore * 60_000).toISOString(),
    ...values,
  });
}

describe('push tokens', () => {
  it('a user registers a device, sees it, and removes it', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await asUser(db, a);
      await db.query(`select public.register_push_token('ExponentPushToken[abc]', 'ios')`);
      // Registering again only refreshes it.
      await db.query(`select public.register_push_token('ExponentPushToken[abc]', 'android')`);
      expect(
        await queryRows(db, 'select token, platform from public.push_tokens where user_id = $1', [
          a,
        ]),
      ).toEqual([{ token: 'ExponentPushToken[abc]', platform: 'android' }]);
      const removed = await queryOne<{ removed: boolean }>(
        db,
        `select public.unregister_push_token('ExponentPushToken[abc]') as removed`,
      );
      expect(removed.removed).toBe(true);
      expect(await countRows(db, 'select 1 from public.push_tokens')).toBe(0);
    });
  });

  it('a device that switches accounts moves to the new user; the old one cannot remove it', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const b = await createUser(db);
      await asUser(db, a);
      await db.query(`select public.register_push_token('ExpoPushToken[shared]', 'ios')`);
      await asUser(db, b);
      await db.query(`select public.register_push_token('ExpoPushToken[shared]', 'ios')`);
      await asUser(db, a);
      expect(await countRows(db, 'select 1 from public.push_tokens')).toBe(0);
      const removed = await queryOne<{ removed: boolean }>(
        db,
        `select public.unregister_push_token('ExpoPushToken[shared]') as removed`,
      );
      expect(removed.removed).toBe(false);
      await asPostgres(db);
      expect(
        await queryRows(db, 'select user_id from public.push_tokens where token = $1', [
          'ExpoPushToken[shared]',
        ]),
      ).toEqual([{ user_id: b }]);
    });
  });

  it('keeps the 10 most recent devices of a user', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      for (let i = 0; i < 10; i += 1) {
        await make.pushToken(db, a, {
          token: `ExponentPushToken[old-${i}]`,
          updated_at: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
        });
      }
      await asUser(db, a);
      await db.query(`select public.register_push_token('ExponentPushToken[new]', 'android')`);
      const tokens = await queryRows<{ token: string }>(
        db,
        'select token from public.push_tokens order by token',
      );
      expect(tokens).toHaveLength(10);
      expect(tokens.map((t) => t.token)).not.toContain('ExponentPushToken[old-0]');
      expect(tokens.map((t) => t.token)).toContain('ExponentPushToken[new]');
    });
  });

  it.each([
    [`select public.register_push_token('not-a-token', 'ios')`, 'invalid_push_token'],
    [`select public.register_push_token(null, 'ios')`, 'invalid_push_token'],
    [`select public.register_push_token('ExponentPushToken[x]', 'web')`, 'invalid_platform'],
  ])('%s fails with %s (22023)', async (sql, message) => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await asUser(db, a);
      const error = await expectSqlError(db, SQLSTATE.invalidParameterValue, sql);
      expect(error.message).toBe(message);
    });
  });

  it('clients cannot write push_tokens directly, and see only their own', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const b = await createUser(db);
      const ofB = await make.pushToken(db, b);
      await asUser(db, a);
      await expectSqlError(
        db,
        SQLSTATE.insufficientPrivilege,
        `insert into public.push_tokens (user_id, token, platform)
         values ($1, 'ExponentPushToken[mine]', 'ios')`,
        [a],
      );
      await expectSqlError(
        db,
        SQLSTATE.insufficientPrivilege,
        `delete from public.push_tokens where id = $1`,
        [ofB],
      );
      expect(await countRows(db, 'select 1 from public.push_tokens')).toBe(0);
    });
  });

  it('forget_push_tokens (service role) removes the given tokens of any user', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      await make.pushToken(db, a, { token: 'ExponentPushToken[gone]' });
      await make.pushToken(db, a, { token: 'ExponentPushToken[kept]' });
      await db.query('set local role service_role');
      const row = await queryOne<{ n: number }>(
        db,
        `select public.forget_push_tokens(array['ExponentPushToken[gone]', 'ExponentPushToken[x]']) as n`,
      );
      expect(row.n).toBe(1);
      await asPostgres(db);
      expect(await countRows(db, 'select 1 from public.push_tokens where user_id = $1', [a])).toBe(
        1,
      );
    });
  });
});

describe('claim_pushes', () => {
  it('returns due alerts with every device and marks them pushed, at most once', async () => {
    await withRollback(async (db) => {
      const user = await deviceUser(db);
      await make.pushToken(db, user, { token: 'ExponentPushToken[second]', platform: 'android' });
      const today = await todayIn(db, 'Europe/Zurich');
      const now = await localTime(db, today, '12:00', 'Europe/Zurich');
      const tx = await make.transaction(db, user);
      const alert = await alertAt(db, user, now, 1, {
        type: 'categorize',
        title: 'Was war das?',
        body: 'CHF 84.00 bei Manor. Wähle eine Kategorie.',
        transaction_id: tx,
      });
      const claimed = await claim(db, now);
      expect(claimed).toEqual([
        {
          alert_id: alert,
          user_id: user,
          type: 'categorize',
          title: 'Was war das?',
          body: 'CHF 84.00 bei Manor. Wähle eine Kategorie.',
          data: { alert_id: alert, type: 'categorize', transaction_id: tx },
          sound: true,
          tokens: ['ExponentPushToken[second]', `ExponentPushToken[${user}]`].sort(),
        },
      ]);
      const pushed = await queryOne<{ pushed_at: string }>(
        db,
        `select to_char(pushed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as pushed_at
           from public.alerts where id = $1`,
        [alert],
      );
      expect(pushed.pushed_at).toBe(now);
      expect(await claim(db, now)).toEqual([]);
    });
  });

  it('skips silent, read, dismissed and stale alerts, and users without a device', async () => {
    await withRollback(async (db) => {
      const user = await deviceUser(db);
      const today = await todayIn(db, 'Europe/Zurich');
      const now = await localTime(db, today, '12:00', 'Europe/Zurich');
      await alertAt(db, user, now, 1, { silent: true });
      await alertAt(db, user, now, 1, { read_at: now });
      await alertAt(db, user, now, 1, { dismissed_at: now });
      await alertAt(db, user, now, 12 * 60 + 1);
      const fresh = await alertAt(db, user, now, 11 * 60 + 59);
      const noDevice = await createUser(db);
      await onboard(db, noDevice);
      await alertAt(db, noDevice, now);
      expect((await claim(db, now)).map((row) => row.alert_id)).toEqual([fresh]);
    });
  });

  it('honours the limit, oldest first', async () => {
    await withRollback(async (db) => {
      const user = await deviceUser(db);
      await setNotifications(db, user, { max_per_day: 50 });
      const now = await localTime(db, await todayIn(db, 'Europe/Zurich'), '12:00', 'Europe/Zurich');
      const oldest = await alertAt(db, user, now, 30);
      const middle = await alertAt(db, user, now, 20);
      await alertAt(db, user, now, 10);
      expect((await claim(db, now, 2)).map((row) => row.alert_id)).toEqual([oldest, middle]);
      expect(await claim(db, now, 2)).toHaveLength(1);
      await expectSqlError(
        db,
        SQLSTATE.invalidParameterValue,
        'select * from public.claim_pushes(0)',
      );
    });
  });

  it('waits during quiet hours across midnight (22:00–07:00 local) and sends at 07:00', async () => {
    await withRollback(async (db) => {
      const user = await deviceUser(db);
      const today = await todayIn(db, 'Europe/Zurich');
      const late = await localTime(db, today, '23:30', 'Europe/Zurich');
      const alert = await alertAt(db, user, late, 1);
      expect(await claim(db, late)).toEqual([]);
      expect(
        await claim(db, await localTime(db, addDays(today, 1), '06:59', 'Europe/Zurich')),
      ).toEqual([]);
      const morning = await claim(
        db,
        await localTime(db, addDays(today, 1), '07:00', 'Europe/Zurich'),
      );
      expect(morning.map((row) => row.alert_id)).toEqual([alert]);
      // 21:59 is before the quiet hours start.
      const evening = await localTime(db, today, '21:59', 'Europe/Zurich');
      await alertAt(db, user, evening, 1);
      expect(await claim(db, evening)).toHaveLength(1);
    });
  });

  it('quiet hours within one day, turned off, or empty (start = end) work too', async () => {
    await withRollback(async (db) => {
      const user = await deviceUser(db);
      const today = await todayIn(db, 'Europe/Zurich');
      const at = (time: string) => localTime(db, today, time, 'Europe/Zurich');
      await setNotifications(db, user, { quiet_hours_start: '13:00', quiet_hours_end: '15:00' });
      await alertAt(db, user, await at('14:00'), 1);
      expect(await claim(db, await at('14:00'))).toEqual([]);
      expect(await claim(db, await at('15:00'))).toHaveLength(1);

      await alertAt(db, user, await at('14:30'), 1);
      await setNotifications(db, user, { quiet_hours_enabled: false });
      expect(await claim(db, await at('14:30'))).toHaveLength(1);

      await alertAt(db, user, await at('14:40'), 1);
      await setNotifications(db, user, {
        quiet_hours_enabled: true,
        quiet_hours_start: '14:00',
        quiet_hours_end: '14:00',
      });
      expect(await claim(db, await at('14:40'))).toHaveLength(1);
    });
  });

  it('quiet hours are the user’s local time: one instant, two time zones', async () => {
    await withRollback(async (db) => {
      const zurich = await deviceUser(db, 'Europe/Zurich');
      const tokyo = await deviceUser(db, 'Asia/Tokyo');
      // 12:00 in Zurich is 19:00 or 20:00 in Tokyo; 23:00 in Tokyo is quiet.
      const today = await todayIn(db, 'Asia/Tokyo');
      const now = await localTime(db, today, '23:00', 'Asia/Tokyo');
      await alertAt(db, zurich, now, 1);
      await alertAt(db, tokyo, now, 1);
      expect((await claim(db, now)).map((row) => row.user_id)).toEqual([zurich]);
    });
  });

  it('pushes at most max_per_day per local day, counting earlier pushes of that day', async () => {
    await withRollback(async (db) => {
      const user = await deviceUser(db, 'America/New_York');
      await setNotifications(db, user, { max_per_day: 3 });
      const today = await todayIn(db, 'America/New_York');
      const at = (date: string, time: string) => localTime(db, date, time, 'America/New_York');
      // Pushed yesterday at 23:30 local (already today in UTC): does not count today.
      await alertAt(db, user, await at(addDays(today, -1), '23:30'), 1, {
        pushed_at: await at(addDays(today, -1), '23:30'),
      });
      await alertAt(db, user, await at(today, '08:00'), 1, { pushed_at: await at(today, '08:00') });
      const now = await at(today, '12:00');
      for (let i = 0; i < 4; i += 1) await alertAt(db, user, now, 10 - i);
      expect(await claim(db, now)).toHaveLength(2);
      expect(await claim(db, now)).toEqual([]);
      // Next morning the two held back are older than 12 hours (inbox only); new ones go out.
      const nextMorning = await at(addDays(today, 1), '07:30');
      const rest = await claim(db, nextMorning);
      expect(rest).toHaveLength(0);
      await alertAt(db, user, nextMorning, 5);
      await alertAt(db, user, nextMorning, 4);
      expect(await claim(db, nextMorning)).toHaveLength(2);
    });
  });

  it('a jump across thresholds pushes only the highest one', async () => {
    await withRollback(async (db) => {
      const user = await deviceUser(db);
      const now = await localTime(db, await todayIn(db, 'Europe/Zurich'), '12:00', 'Europe/Zurich');
      for (const [type, silent] of [
        ['category_50', true],
        ['category_80', true],
        ['category_100', true],
        ['category_over', false],
      ] as const) {
        await alertAt(db, user, now, 1, { type, silent });
      }
      expect((await claim(db, now)).map((row) => row.type)).toEqual(['category_over']);
    });
  });

  it('sends without sound when the profile has sound off', async () => {
    await withRollback(async (db) => {
      const user = await deviceUser(db);
      await db.query('update public.profiles set sound_enabled = false where id = $1', [user]);
      const now = await localTime(db, await todayIn(db, 'Europe/Zurich'), '12:00', 'Europe/Zurich');
      await alertAt(db, user, now);
      expect((await claim(db, now))[0]?.sound).toBe(false);
    });
  });
});
