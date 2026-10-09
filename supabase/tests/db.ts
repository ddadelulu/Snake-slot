/**
 * Helpers for the database test suite.
 *
 * Every test runs inside `withRollback`: its own connection, one transaction, rolled back at the
 * end, so tests never see each other's rows and the database stays clean. Inside that transaction
 * a test switches between roles the way PostgREST does for real requests:
 *
 *   asPostgres(db)    the migration owner (bypasses RLS), used to set up fixtures
 *   asUser(db, id)    role "authenticated" with a JWT for that user (RLS applies)
 *   asAnon(db)        role "anon" without a user
 *
 * Expected failures run inside a SAVEPOINT (`expectSqlError`), so one rejected statement does not
 * abort the rest of the test.
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';

export const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

export type Db = pg.ClientBase;
export type Row = Record<string, unknown>;

/** The SQLSTATE codes the suite expects. */
export const SQLSTATE = {
  insufficientPrivilege: '42501',
  notNullViolation: '23502',
  foreignKeyViolation: '23503',
  uniqueViolation: '23505',
  checkViolation: '23514',
  exclusionViolation: '23P01',
  invalidParameterValue: '22023',
  invalidTextRepresentation: '22P02',
  numericValueOutOfRange: '22003',
  objectNotInPrerequisiteState: '55000',
} as const;
export type SqlState = (typeof SQLSTATE)[keyof typeof SQLSTATE];

// ---------------------------------------------------------------------------------------------
// Connections and roles
// ---------------------------------------------------------------------------------------------

/** Runs `fn` inside BEGIN … ROLLBACK on a connection of its own. */
export async function withRollback<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('rollback');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

/**
 * Sets the request claims the way PostgREST does. This local image's auth.uid() reads
 * `request.jwt.claim.sub`; hosted Supabase also reads the `request.jwt.claims` JSON, so set both.
 */
async function setClaims(db: Db, sub: string, claims: Row | null): Promise<void> {
  await db.query(
    `select set_config('request.jwt.claim.sub', $1, true),
            set_config('request.jwt.claims', $2, true)`,
    [sub, claims === null ? '' : JSON.stringify(claims)],
  );
}

/** Acts as the signed-in user `userId` (role "authenticated"). */
export async function asUser(db: Db, userId: string): Promise<void> {
  await db.query('set local role authenticated');
  await setClaims(db, userId, { sub: userId, role: 'authenticated' });
}

/** Role "authenticated" but no user in the JWT (e.g. a malformed or expired token). */
export async function asAuthenticatedWithoutUser(db: Db): Promise<void> {
  await db.query('set local role authenticated');
  await setClaims(db, '', { role: 'authenticated' });
}

/** Acts as an anonymous client (role "anon", no user). */
export async function asAnon(db: Db): Promise<void> {
  await db.query('set local role anon');
  await setClaims(db, '', { role: 'anon' });
}

/**
 * Acts as `userId` and lets role authenticated write transactions, transaction_splits and
 * data_sources directly for the rest of the test, as the RPCs do (guard M4-06: they set the
 * transaction-local flag batzen.via_rpc). Only for tests about constraints, RLS or triggers of
 * those tables; the app can only write them through the RPCs.
 */
export async function asUserWritingDirectly(db: Db, userId: string): Promise<void> {
  await asUser(db, userId);
  await allowDirectWrites(db);
}

/** Sets the guard flag of M4-06 for the rest of the test (see asUserWritingDirectly). */
export async function allowDirectWrites(db: Db): Promise<void> {
  await db.query(`select set_config('batzen.via_rpc', 'on', true)`);
}

/** Back to the connection's own role (postgres): bypasses RLS, used to set up fixtures. */
export async function asPostgres(db: Db): Promise<void> {
  await db.query('reset role');
  await setClaims(db, '', null);
}

/** Inserts a user into auth.users (as postgres; leaves the connection acting as postgres). */
export async function createUser(
  db: Db,
  options: { language?: unknown; metadata?: Row | null; email?: string } = {},
): Promise<string> {
  await asPostgres(db);
  const id = randomUUID();
  const metadata =
    options.metadata !== undefined
      ? options.metadata
      : options.language !== undefined
        ? { language: options.language }
        : {};
  await db.query(
    `insert into auth.users (id, email, aud, role, raw_user_meta_data)
     values ($1, $2, 'authenticated', 'authenticated', $3::jsonb)`,
    [
      id,
      options.email ?? `${id}@example.test`,
      metadata === null ? null : JSON.stringify(metadata),
    ],
  );
  return id;
}

// ---------------------------------------------------------------------------------------------
// Queries and expectations
// ---------------------------------------------------------------------------------------------

export async function queryRows<T extends pg.QueryResultRow>(
  db: Db,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await db.query<T>(sql, params);
  return result.rows;
}

/** Runs a query that must return exactly one row. */
export async function queryOne<T extends pg.QueryResultRow>(
  db: Db,
  sql: string,
  params: unknown[] = [],
): Promise<T> {
  const rows = await queryRows<T>(db, sql, params);
  const [row] = rows;
  if (rows.length !== 1 || row === undefined) {
    throw new Error(`expected exactly one row, got ${rows.length}:\n${sql}`);
  }
  return row;
}

/** Number of rows the query returns. */
export async function countRows(db: Db, sql: string, params: unknown[] = []): Promise<number> {
  const row = await queryOne<{ n: number }>(
    db,
    `select count(*)::int as n from (${sql}) as counted`,
    params,
  );
  return row.n;
}

/** Number of rows a statement (update/delete) affected. */
export async function affectedRows(db: Db, sql: string, params: unknown[] = []): Promise<number> {
  const result = await db.query(sql, params);
  return result.rowCount ?? 0;
}

let savepointCounter = 0;

/** Result of a statement run inside its own savepoint. */
export type Attempt = { ok: true; rows: Row[] } | { ok: false; error: pg.DatabaseError };

/**
 * Runs one statement inside a SAVEPOINT and reports whether it succeeded. A failure is rolled back
 * to the savepoint, so the surrounding transaction stays usable.
 */
export async function attempt(db: Db, sql: string, params: unknown[] = []): Promise<Attempt> {
  const savepoint = `attempt_${++savepointCounter}`;
  await db.query(`savepoint ${savepoint}`);
  try {
    const result = await db.query<Row>(sql, params);
    await db.query(`release savepoint ${savepoint}`);
    return { ok: true, rows: result.rows };
  } catch (error) {
    await db.query(`rollback to savepoint ${savepoint}`);
    await db.query(`release savepoint ${savepoint}`);
    if (error instanceof pg.DatabaseError) return { ok: false, error };
    throw error;
  }
}

/** Expects the statement to fail with `code`; the failure does not abort the transaction. */
export async function expectSqlError(
  db: Db,
  code: SqlState,
  sql: string,
  params: unknown[] = [],
): Promise<pg.DatabaseError> {
  const outcome = await attempt(db, sql, params);
  if (outcome.ok) {
    throw new Error(`expected SQLSTATE ${code}, but the statement succeeded:\n${sql}`);
  }
  if (outcome.error.code !== code) {
    throw new Error(
      `expected SQLSTATE ${code}, got ${outcome.error.code ?? 'none'} (${outcome.error.message}):\n${sql}`,
    );
  }
  return outcome.error;
}

/**
 * Runs the deferred constraint triggers now, as COMMIT would (tests never commit), then defers
 * them again. Throws if a deferred check fails.
 */
export async function runDeferredChecks(db: Db): Promise<void> {
  await db.query('set constraints all immediate');
  await db.query('set constraints all deferred');
}

/** Expects the deferred constraint checks (what COMMIT would run) to fail with `code`. */
export async function expectDeferredError(db: Db, code: SqlState): Promise<pg.DatabaseError> {
  return expectSqlError(db, code, 'set constraints all immediate');
}

// ---------------------------------------------------------------------------------------------
// Inserting rows
// ---------------------------------------------------------------------------------------------

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function quoteIdentifier(name: string): string {
  if (!IDENTIFIER.test(name)) throw new Error(`unexpected identifier: ${name}`);
  return `"${name}"`;
}

/** Quotes "schema.table" (or "table"). Test helpers only accept plain lower-case names. */
export function quoteTable(table: string): string {
  return table.split('.').map(quoteIdentifier).join('.');
}

/**
 * Inserts one row as the current role and returns `returning` (default "id") as text. Keys with
 * the value `undefined` are left out, so the column default applies.
 */
export async function insertRow(
  db: Db,
  table: string,
  values: Row,
  returning = 'id',
): Promise<string> {
  const entries = Object.entries(values).filter(([, value]) => value !== undefined);
  const columns = entries.map(([column]) => quoteIdentifier(column)).join(', ');
  const placeholders = entries.map((_, index) => `$${index + 1}`).join(', ');
  const row = await queryOne<{ key: string }>(
    db,
    `insert into ${quoteTable(table)} (${columns}) values (${placeholders})
     returning ${quoteIdentifier(returning)}::text as key`,
    entries.map(([, value]) => value),
  );
  return row.key;
}

let sequence = 0;
function next(): number {
  sequence += 1;
  return sequence;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** A fresh 30-day period that overlaps no other period made by `make.period`. */
function nextPeriodDates(): { starts_on: string; ends_on: string } {
  const start = new Date(Date.UTC(2001, 0, 1 + next() * 40));
  const end = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
  return { starts_on: isoDate(start), ends_on: isoDate(end) };
}

/**
 * Row builders. Each inserts as the current role with sensible defaults (overridable through
 * `values`) and returns the new row's id. Unique columns get distinct values on every call.
 */
export const make = {
  category: (db: Db, userId: string, values: Row = {}) =>
    insertRow(db, 'public.categories', { user_id: userId, name: `Kategorie ${next()}`, ...values }),

  period: (db: Db, userId: string, values: Row = {}) =>
    insertRow(db, 'public.budget_periods', {
      user_id: userId,
      ...nextPeriodDates(),
      income_rappen: 520_000,
      fixed_costs_rappen: 210_000,
      savings_rappen: 50_000,
      ...values,
    }),

  budget: (db: Db, userId: string, periodId: string, categoryId: string, values: Row = {}) =>
    insertRow(db, 'public.budgets', {
      user_id: userId,
      period_id: periodId,
      category_id: categoryId,
      amount_rappen: 40_000,
      ...values,
    }),

  dataSource: (db: Db, userId: string, values: Row = {}) =>
    insertRow(db, 'public.data_sources', {
      user_id: userId,
      kind: 'bank',
      provider: 'bLink',
      consent_version: '2026-10',
      ...values,
    }),

  credential: (db: Db, userId: string, dataSourceId: string, values: Row = {}) =>
    insertRow(
      db,
      'private.data_source_credentials',
      {
        data_source_id: dataSourceId,
        user_id: userId,
        ciphertext: Buffer.from('not really encrypted'),
        key_version: 1,
        ...values,
      },
      'data_source_id',
    ),

  fixedCost: (db: Db, userId: string, values: Row = {}) =>
    insertRow(db, 'public.fixed_costs', {
      user_id: userId,
      kind: 'rent',
      label: 'Miete',
      amount_rappen: 185_000,
      due_day: 1,
      ...values,
    }),

  transaction: (db: Db, userId: string, values: Row = {}) =>
    insertRow(db, 'public.transactions', {
      user_id: userId,
      amount_rappen: -1_250,
      booked_at: '2026-10-01T10:00:00Z',
      source: 'manual',
      merchant: 'Migros',
      ...values,
    }),

  split: (db: Db, userId: string, transactionId: string, amountRappen: number, values: Row = {}) =>
    insertRow(db, 'public.transaction_splits', {
      user_id: userId,
      transaction_id: transactionId,
      amount_rappen: amountRappen,
      ...values,
    }),

  rule: (db: Db, userId: string, categoryId: string, values: Row = {}) =>
    insertRow(db, 'public.categorization_rules', {
      user_id: userId,
      match_field: 'merchant',
      match_type: 'contains',
      pattern: `Händler ${next()}`,
      category_id: categoryId,
      ...values,
    }),

  alert: (db: Db, userId: string, values: Row = {}) =>
    insertRow(db, 'public.alerts', {
      user_id: userId,
      type: 'category_80',
      dedupe_key: `alert-${next()}`,
      title: 'Fast ausgegeben',
      body: '80 % von «Essen auswärts» sind weg.',
      ...values,
    }),

  conversation: (db: Db, userId: string, values: Row = {}) =>
    insertRow(db, 'public.ai_conversations', { user_id: userId, title: 'Budgetfragen', ...values }),

  message: (db: Db, userId: string, conversationId: string, values: Row = {}) =>
    insertRow(db, 'public.ai_messages', {
      user_id: userId,
      conversation_id: conversationId,
      role: 'user',
      content: 'Wie viel bleibt mir diesen Monat?',
      ...values,
    }),

  pushToken: (db: Db, userId: string, values: Row = {}) =>
    insertRow(db, 'public.push_tokens', {
      user_id: userId,
      token: `ExponentPushToken[device-${next()}]`,
      platform: 'ios',
      ...values,
    }),

  consentEvent: (db: Db, userId: string, values: Row = {}) =>
    insertRow(db, 'public.consent_events', {
      user_id: userId,
      kind: 'terms',
      version: '2026-10',
      granted: true,
      ...values,
    }),
};

// ---------------------------------------------------------------------------------------------
// Onboarded users and local dates
// ---------------------------------------------------------------------------------------------

/**
 * Marks `userId` as onboarded (as postgres) without calling complete_onboarding: income, payday,
 * time zone and leftover policy as given, onboarding_completed_at = now(). Leaves the connection
 * acting as postgres.
 */
export async function onboard(db: Db, userId: string, values: Row = {}): Promise<void> {
  await asPostgres(db);
  const profile: Row = {
    net_income_rappen: 520_000,
    payday: 25,
    savings_monthly_rappen: 50_000,
    leftover_policy: 'rollover',
    timezone: 'Europe/Zurich',
    ...values,
  };
  const columns = Object.keys(profile);
  await db.query(
    `update public.profiles
        set ${columns.map((column, i) => `${quoteIdentifier(column)} = $${i + 2}`).join(', ')},
            onboarding_completed_at = now()
      where id = $1`,
    [userId, ...Object.values(profile)],
  );
}

/**
 * Today's date in `timeZone` as the database sees it: now() is the transaction's start time, so
 * the answer stays the same for the whole test, even across midnight.
 */
export async function todayIn(db: Db, timeZone: string): Promise<string> {
  const row = await queryOne<{ today: string }>(
    db,
    `select (now() at time zone $1)::date::text as today`,
    [timeZone],
  );
  return row.today;
}

// ---------------------------------------------------------------------------------------------
// One row per user table
// ---------------------------------------------------------------------------------------------

/** Tables whose single row per user is created by handle_new_user() on sign-up. */
export const PER_USER_TABLES = ['profiles', 'notification_settings', 'subscriptions'] as const;

/**
 * For every other user table in schema public: creates (as the current role) what a new row
 * needs and returns that row's values, owned by `userId`. Nothing is inserted into the table
 * itself, so a test can insert the row as whichever role it is testing.
 */
export const NEW_ROW: Readonly<Record<string, (db: Db, userId: string) => Promise<Row>>> = {
  fixed_costs: async (_db, userId) => ({
    user_id: userId,
    kind: 'health_insurance',
    amount_rappen: 42_000,
  }),
  categories: async (_db, userId) => ({ user_id: userId, name: `Velo ${next()}` }),
  budget_periods: async (_db, userId) => ({
    user_id: userId,
    ...nextPeriodDates(),
    income_rappen: 600_000,
    fixed_costs_rappen: 250_000,
    savings_rappen: 0,
  }),
  budgets: async (db, userId) => ({
    user_id: userId,
    period_id: await make.period(db, userId),
    category_id: await make.category(db, userId),
    amount_rappen: 30_000,
  }),
  data_sources: async (_db, userId) => ({ user_id: userId, kind: 'email', consent_version: 'v1' }),
  transactions: async (_db, userId) => ({
    user_id: userId,
    amount_rappen: -890,
    booked_at: '2026-10-01T12:00:00Z',
    source: 'manual',
  }),
  transaction_splits: async (db, userId) => ({
    user_id: userId,
    transaction_id: await make.transaction(db, userId),
    amount_rappen: -500,
  }),
  categorization_rules: async (db, userId) => ({
    user_id: userId,
    match_field: 'merchant',
    match_type: 'contains',
    pattern: `Manor ${next()}`,
    category_id: await make.category(db, userId),
  }),
  alerts: async (_db, userId) => ({
    user_id: userId,
    type: 'pace',
    dedupe_key: `pace-${next()}`,
    title: 'Zu schnell unterwegs',
    body: 'Du gibst schneller aus als geplant.',
  }),
  push_tokens: async (_db, userId) => ({
    user_id: userId,
    token: `ExponentPushToken[device-${next()}]`,
    platform: 'ios',
  }),
  ai_conversations: async (_db, userId) => ({ user_id: userId, title: 'Sparen' }),
  ai_messages: async (db, userId) => ({
    user_id: userId,
    conversation_id: await make.conversation(db, userId),
    role: 'user',
    content: 'Hallo',
  }),
  consent_events: async (_db, userId) => ({
    user_id: userId,
    kind: 'privacy_policy',
    version: '2026-10',
    granted: true,
  }),
};

/** Values for a new row of `table` owned by `userId` (dependencies are created as postgres). */
export async function newRowValues(db: Db, table: string, userId: string): Promise<Row> {
  const build = NEW_ROW[table];
  if (build === undefined) throw new Error(`no row builder for public.${table}`);
  await asPostgres(db);
  return build(db, userId);
}

/**
 * Makes sure `userId` owns a row in public.`table` (inserted as postgres) and returns its key:
 * the row id, or the user id for the per-user tables. Leaves the connection acting as postgres.
 */
export async function seedRow(db: Db, table: string, userId: string): Promise<string> {
  await asPostgres(db);
  if ((PER_USER_TABLES as readonly string[]).includes(table)) return userId;
  return insertRow(db, `public.${table}`, await newRowValues(db, table, userId));
}

/** Every table in schema public (ordinary and partitioned), from the catalog. */
export async function publicTables(db: Db): Promise<string[]> {
  const rows = await queryRows<{ name: string }>(
    db,
    `select c.relname as name
       from pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
      order by 1`,
  );
  return rows.map((row) => row.name);
}
