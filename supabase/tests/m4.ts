/**
 * Fixtures for the Milestone 4 tests (alerts, push, moments, editors): an onboarded user whose
 * current period contains today, with two budgeted categories, plus helpers for local times,
 * spending and running the alert engine at a chosen moment.
 */
import {
  type Db,
  type Row,
  asPostgres,
  createUser,
  make,
  onboard,
  queryOne,
  queryRows,
  todayIn,
} from './db';

export interface BudgetUser {
  user: string;
  timezone: string;
  today: string;
  periodId: string;
  startsOn: string;
  endsOn: string;
  groceries: string;
  eatingOut: string;
  groceriesBudget: string;
  eatingOutBudget: string;
}

/** Spendable in every fixture period: income 3000.00 − fixed costs 1000.00. */
export const SPENDABLE = 200_000;
export const GROCERIES_BUDGET = 40_000;
export const EATING_OUT_BUDGET = 20_000;

/** `date` (YYYY-MM-DD) plus `days`. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + days))
    .toISOString()
    .slice(0, 10);
}

/** The instant of a local date and time in `timeZone`, as an ISO string. */
export async function localTime(
  db: Db,
  date: string,
  time: string,
  timeZone: string,
): Promise<string> {
  const row = await queryOne<{ at: string }>(
    db,
    `select to_char(($1::date + $2::time) at time zone $3 at time zone 'UTC',
                    'YYYY-MM-DD"T"HH24:MI:SS"Z"') as at`,
    [date, time, timeZone],
  );
  return row.at;
}

/**
 * An onboarded user (as postgres) whose period started `startsDaysAgo` days before today (in
 * `timezone`) and lasts `length` days: income 3000.00, fixed costs 1000.00, groceries 400.00
 * and eating out 200.00. Leaves the connection acting as postgres.
 */
export async function budgetUser(
  db: Db,
  options: {
    timezone?: string;
    language?: 'de' | 'en';
    startsDaysAgo?: number;
    length?: number;
  } = {},
): Promise<BudgetUser> {
  const timezone = options.timezone ?? 'Europe/Zurich';
  const user = await createUser(db, { language: options.language ?? 'de' });
  await onboard(db, user, { timezone });
  const today = await todayIn(db, timezone);
  const startsOn = addDays(today, -(options.startsDaysAgo ?? 10));
  const endsOn = addDays(startsOn, options.length ?? 30);
  const periodId = await make.period(db, user, {
    starts_on: startsOn,
    ends_on: endsOn,
    income_rappen: 300_000,
    fixed_costs_rappen: 100_000,
    savings_rappen: 0,
  });
  const groceries = await make.category(db, user, {
    default_key: 'groceries',
    name: undefined,
    sort_order: 0,
  });
  const eatingOut = await make.category(db, user, {
    default_key: 'eating_out',
    name: undefined,
    sort_order: 1,
  });
  const groceriesBudget = await make.budget(db, user, periodId, groceries, {
    amount_rappen: GROCERIES_BUDGET,
  });
  const eatingOutBudget = await make.budget(db, user, periodId, eatingOut, {
    amount_rappen: EATING_OUT_BUDGET,
  });
  return {
    user,
    timezone,
    today,
    periodId,
    startsOn,
    endsOn,
    groceries,
    eatingOut,
    groceriesBudget,
    eatingOutBudget,
  };
}

/**
 * Stores a purchase of `rappen` (as postgres; positive numbers are spent) on a local date
 * (default today) at noon. Returns its id.
 */
export async function spend(
  db: Db,
  fixture: BudgetUser,
  rappen: number,
  values: Row & { on?: string; time?: string } = {},
): Promise<string> {
  const { on, time, ...rest } = values;
  await asPostgres(db);
  return make.transaction(db, fixture.user, {
    amount_rappen: -rappen,
    booked_at: await localTime(db, on ?? fixture.today, time ?? '12:00', fixture.timezone),
    merchant: 'Migros',
    categorized_by: 'user',
    category_confidence: 100,
    ...rest,
  });
}

/** Runs the alert engine for `user` as of `now` (default: the transaction's now()), as postgres. */
export async function evaluate(
  db: Db,
  user: string,
  transactionIds: string[] = [],
  now: string | null = null,
): Promise<number> {
  await asPostgres(db);
  const row = await queryOne<{ created: number }>(
    db,
    `select private.evaluate_alerts($1, $2::uuid[], coalesce($3::timestamptz, now())) as created`,
    [user, transactionIds, now],
  );
  return row.created;
}

/** Runs the reminders for `user` as of `now`, as postgres. */
export async function remind(db: Db, user: string, now: string): Promise<number> {
  await asPostgres(db);
  const row = await queryOne<{ created: number }>(
    db,
    'select private.reminder_alerts($1, $2::timestamptz) as created',
    [user, now],
  );
  return row.created;
}

export interface AlertRow {
  id: string;
  type: string;
  dedupe_key: string;
  title: string;
  body: string;
  params: Record<string, unknown>;
  category_id: string | null;
  transaction_id: string | null;
  period_id: string | null;
  silent: boolean;
  pushed_at: string | null;
}

/** The user's alerts (as postgres), oldest first, then by type. */
export async function alertsOf(db: Db, user: string, type?: string): Promise<AlertRow[]> {
  await asPostgres(db);
  return queryRows<AlertRow>(
    db,
    `select id, type, dedupe_key, title, body, params, category_id, transaction_id, period_id,
            silent, pushed_at
       from public.alerts
      where user_id = $1 and ($2::text is null or type = $2)
      order by created_at, type, dedupe_key`,
    [user, type ?? null],
  );
}

/** Changes the user's notification settings (as postgres). */
export async function setNotifications(db: Db, user: string, values: Row): Promise<void> {
  await asPostgres(db);
  const columns = Object.keys(values);
  await db.query(
    `update public.notification_settings
        set ${columns.map((column, i) => `${column} = $${i + 2}`).join(', ')}
      where user_id = $1`,
    [user, ...Object.values(values)],
  );
}
