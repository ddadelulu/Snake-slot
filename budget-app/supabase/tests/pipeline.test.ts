/**
 * add_transactions(): the one pipeline every transaction passes (docs/API.md, "Transactions",
 * and docs/CATEGORIZATION.md, "The steps, in order"). Covers every outcome (added, merged,
 * already_imported, possible_duplicate), every input error, local dates in the user's time zone,
 * deduplication across and within sources, fixed-cost detection, categorization results,
 * needs_review, dry runs, statement-import data sources, other users, speed and concurrency.
 */
import { randomUUID } from 'node:crypto';
import { type SourceTransaction, toIngestRow } from '@budget/core';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import {
  DATABASE_URL,
  type Db,
  type Row,
  SQLSTATE,
  type SqlState,
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
  withRollback,
} from './db';

type Outcome = 'added' | 'merged' | 'already_imported' | 'possible_duplicate';

type RowResult = {
  index: number;
  outcome: Outcome;
  transaction_id: string | null;
  duplicate_of: {
    id: string;
    booked_at: string;
    merchant: string | null;
    amount_rappen: number;
    source: string;
  } | null;
  category_id: string | null;
  categorized_by: string;
  category_confidence: number | null;
  fixed_cost_id: string | null;
  needs_review: boolean;
};

type AddResult = {
  data_source_id: string | null;
  results: RowResult[];
  counts: Record<Outcome | 'needs_review', number>;
};

const ADD = 'select public.add_transactions($1::jsonb) as result';

const CSV = { file_name: 'konto-2026-10.csv', format: 'csv', bank: 'postfinance' };
const CAMT = { file_name: 'konto-2026-10.xml', format: 'camt053', bank: null };

let sequence = 0;

/** A manual entry (IngestRow) with sensible defaults. */
function manualRow(values: Row = {}): Row {
  return {
    amount_rappen: -1_250,
    booked_at: '2026-10-03T10:00:00Z',
    merchant: 'Laden Muster',
    raw_text: null,
    mcc: null,
    source: 'manual',
    external_id: null,
    ...values,
  };
}

/** A statement row (IngestRow) with a fresh external id. */
function statementRow(values: Row = {}): Row {
  sequence += 1;
  return {
    amount_rappen: -1_250,
    booked_on: '2026-10-03',
    merchant: null,
    raw_text: 'KAUF LADEN MUSTER',
    mcc: null,
    source: 'statement_import',
    external_id: `csv:${sequence}`,
    ...values,
  };
}

/** add_transactions(input) as `userId`; leaves the connection acting as postgres. */
async function add(db: Db, userId: string, input: unknown): Promise<AddResult> {
  await asUser(db, userId);
  const row = await queryOne<{ result: AddResult }>(db, ADD, [JSON.stringify(input)]);
  await asPostgres(db);
  return row.result;
}

/** Expects add_transactions(input) to fail with `code`; returns the error. */
async function addFails(db: Db, userId: string, input: unknown, code: SqlState) {
  await asUser(db, userId);
  const error = await expectSqlError(db, code, ADD, [JSON.stringify(input)]);
  await asPostgres(db);
  return error;
}

type Stored = {
  id: string;
  amount_rappen: number;
  booked_at: string;
  merchant: string | null;
  raw_text: string | null;
  mcc: number | null;
  source: string;
  external_id: string | null;
  data_source_id: string | null;
  category_id: string | null;
  categorized_by: string;
  category_confidence: number | null;
  fixed_cost_id: string | null;
  merged_into_id: string | null;
  note: string | null;
  items: unknown;
  original_amount_minor: number | null;
  original_currency: string | null;
  acknowledged: boolean;
  deleted: boolean;
};

const STORED_COLUMNS = `id::text, amount_rappen::float8 as amount_rappen,
  to_char(booked_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as booked_at,
  merchant, raw_text, mcc, source, external_id, data_source_id::text, category_id::text,
  categorized_by, category_confidence, fixed_cost_id::text, merged_into_id::text, note, items,
  original_amount_minor::float8 as original_amount_minor, original_currency,
  acknowledged_at is not null as acknowledged, deleted_at is not null as deleted`;

/** The user's transactions, oldest booking first (read as postgres). */
async function storedRows(db: Db, userId: string): Promise<Stored[]> {
  await asPostgres(db);
  return queryRows<Stored>(
    db,
    `select ${STORED_COLUMNS} from public.transactions where user_id = $1
      order by booked_at, created_at, id`,
    [userId],
  );
}

async function storedRow(db: Db, id: string | null): Promise<Stored> {
  await asPostgres(db);
  return queryOne<Stored>(db, `select ${STORED_COLUMNS} from public.transactions where id = $1`, [
    id,
  ]);
}

/** "2026-10-03T10:00:00Z" → the microsecond form storedRows() renders. */
function utc(instant: string): string {
  return instant.replace('Z', '.000000Z');
}

/** Everything the pipeline may write for a user (counts, read as postgres). */
async function footprint(db: Db, userId: string): Promise<Row> {
  await asPostgres(db);
  return queryOne<Row>(
    db,
    `select (select count(*)::int from public.transactions where user_id = $1) as transactions,
            (select count(*)::int from public.transaction_splits where user_id = $1) as splits,
            (select count(*)::int from public.data_sources where user_id = $1) as sources,
            (select coalesce(string_agg(coalesce(merchant_hint, '-'), ',' order by id), '')
               from public.fixed_costs where user_id = $1) as hints`,
    [userId],
  );
}

/**
 * An onboarded user (time zone `timeZone`) with the given default categories; returns the user and
 * the category ids by key. Leaves the connection acting as postgres.
 */
async function onboardedUser(
  db: Db,
  options: { timeZone?: string; categories?: readonly string[] } = {},
): Promise<{ user: string; ids: Record<string, string> }> {
  const user = await createUser(db);
  await onboard(db, user, { timezone: options.timeZone ?? 'Europe/Zurich' });
  const ids: Record<string, string> = {};
  for (const key of options.categories ?? ['groceries', 'eating_out', 'transport', 'hobbies']) {
    ids[key] = await make.category(db, user, { default_key: key, name: undefined });
  }
  return { user, ids };
}

function only<T>(items: readonly T[]): T {
  expect(items).toHaveLength(1);
  const [item] = items;
  if (item === undefined) throw new Error('expected one item');
  return item;
}

// ---------------------------------------------------------------------------------------------

describe('add_transactions() access', () => {
  it('raises 42501 without a signed-in user', async () => {
    await withRollback(async (db) => {
      await asAuthenticatedWithoutUser(db);
      const error = await expectSqlError(db, SQLSTATE.insufficientPrivilege, ADD, [
        JSON.stringify({ rows: [manualRow()] }),
      ]);
      expect(error.message).toBe('not signed in');
    });
  });

  it('cannot be called by anon (42501)', async () => {
    await withRollback(async (db) => {
      await asAnon(db);
      await expectSqlError(db, SQLSTATE.insufficientPrivilege, ADD, [
        JSON.stringify({ rows: [manualRow()] }),
      ]);
    });
  });

  it('raises 55000 not_onboarded before onboarding and stores nothing', async () => {
    await withRollback(async (db) => {
      const a = await createUser(db);
      const before = await footprint(db, a);
      const error = await addFails(
        db,
        a,
        { rows: [manualRow()] },
        SQLSTATE.objectNotInPrerequisiteState,
      );
      expect(error.message).toBe('not_onboarded');
      expect(await footprint(db, a)).toEqual(before);
    });
  });
});

describe('add_transactions() rejects a malformed request (22023)', () => {
  it.each([
    ['a list instead of an object', [manualRow()], 'invalid_input'],
    ['no rows key', {}, 'invalid_input'],
    ['rows that are not a list', { rows: { 0: manualRow() } }, 'invalid_input'],
    ['an empty list of rows', { rows: [] }, 'invalid_input'],
    ['an unknown key', { rows: [manualRow()], replace: true }, 'invalid_input'],
    ['dry_run that is not a boolean', { rows: [manualRow()], dry_run: 'yes' }, 'invalid_input'],
    [
      'import that is not an object',
      { rows: [statementRow()], import: 'konto.csv' },
      'invalid_input',
    ],
    [
      'an unknown import key',
      { rows: [statementRow()], import: { ...CSV, encoding: 'utf-8' } },
      'invalid_input',
    ],
    [
      'a blank file name',
      { rows: [statementRow()], import: { ...CSV, file_name: '  ' } },
      'invalid_input',
    ],
    [
      'a file name over 255 characters',
      { rows: [statementRow()], import: { ...CSV, file_name: `${'k'.repeat(252)}.csv` } },
      'invalid_input',
    ],
    [
      'an unknown format',
      { rows: [statementRow()], import: { ...CSV, format: 'xlsx' } },
      'invalid_input',
    ],
    [
      'a bank name over 60 characters',
      { rows: [statementRow()], import: { ...CSV, bank: 'b'.repeat(61) } },
      'invalid_input',
    ],
    ['2001 rows', { rows: Array.from({ length: 2001 }, () => manualRow()) }, 'too_many_rows'],
  ])('%s → %s', async (_label, input, message) => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const before = await footprint(db, user);
      const error = await addFails(db, user, input, SQLSTATE.invalidParameterValue);
      expect(error.message).toBe(message);
      expect(await footprint(db, user)).toEqual(before);
    });
  });
});

describe('add_transactions() rejects an invalid row (22023, detail names the row)', () => {
  const longItems = Array.from({ length: 250 }, (_, i) => ({
    description: `Artikel ${i} ${'x'.repeat(80)}`,
    amount_rappen: -1,
  }));

  type CaseOptions = { import?: boolean };

  /** [label, the bad row (index 1, after a valid row), detail, call options] */
  const CASES: ReadonlyArray<readonly [string, unknown, string, CaseOptions?]> = [
    ['not an object', 5, 'row 1: must be an object'],
    ['an unknown key', manualRow({ currency: 'CHF' }), 'row 1: unknown key "currency"'],
    ...[0, 12.5, '-1250', -10_000_000_001, 10_000_000_001, null].map(
      (amount) =>
        [
          `amount_rappen ${JSON.stringify(amount)}`,
          manualRow({ amount_rappen: amount }),
          'row 1: amount_rappen must be a non-zero integer within ±10000000000',
        ] as const,
    ),
    [
      'no amount_rappen',
      (() => {
        const { amount_rappen: _amount, ...rest } = manualRow();
        return rest;
      })(),
      'row 1: amount_rappen must be a non-zero integer within ±10000000000',
    ],
    [
      'source bank',
      manualRow({ source: 'bank' }),
      'row 1: source must be "manual" or "statement_import"',
    ],
    [
      'no source',
      manualRow({ source: null }),
      'row 1: source must be "manual" or "statement_import"',
    ],
    [
      'a statement row without import',
      statementRow(),
      'row 1: source "statement_import" needs "import"',
    ],
    [
      'a manual row in an import',
      manualRow(),
      'row 1: rows of an import must have source "statement_import"',
      { import: true },
    ],
    [
      'booked_at and booked_on',
      manualRow({ booked_on: '2026-10-03' }),
      'row 1: exactly one of booked_at and booked_on is required',
    ],
    [
      'neither booked_at nor booked_on',
      manualRow({ booked_at: null }),
      'row 1: exactly one of booked_at and booked_on is required',
    ],
    ...[
      '2026-10-03T10:00:00',
      '2026-02-30T10:00:00Z',
      '2026-10-03 10:00:00+02:00',
      '03.10.2026',
      1_759_485_600,
    ].map(
      (bookedAt) =>
        [
          `booked_at ${JSON.stringify(bookedAt)}`,
          manualRow({ booked_at: bookedAt }),
          'row 1: booked_at must be an ISO 8601 date-time with an offset',
        ] as const,
    ),
    [
      'booked_time with booked_at',
      manualRow({ booked_time: '10:00' }),
      'row 1: booked_time belongs to booked_on',
    ],
    ...['03.10.2026', '2026-02-30', '2026-10-3', '2026-10-03T00:00:00Z'].map(
      (bookedOn) =>
        [
          `booked_on ${bookedOn}`,
          manualRow({ booked_at: undefined, booked_on: bookedOn }),
          'row 1: booked_on must be a date YYYY-MM-DD',
        ] as const,
    ),
    ...['24:00', '9:00', '12:60', '12:00:60', 1200].map(
      (time) =>
        [
          `booked_time ${JSON.stringify(time)}`,
          manualRow({ booked_at: undefined, booked_on: '2026-10-03', booked_time: time }),
          'row 1: booked_time must be HH:MM or HH:MM:SS',
        ] as const,
    ),
    ...['', '   ', 'm'.repeat(201), 42].map(
      (merchant) =>
        [
          `merchant ${JSON.stringify(merchant).slice(0, 12)}`,
          manualRow({ merchant }),
          'row 1: merchant must be null or 1-200 characters',
        ] as const,
    ),
    [
      'raw_text over 4000 characters',
      manualRow({ raw_text: 'r'.repeat(4001) }),
      'row 1: raw_text must be null or at most 4000 characters',
    ],
    ...[10_000, -1, 54.5, '5411'].map(
      (mcc) =>
        [
          `mcc ${JSON.stringify(mcc)}`,
          manualRow({ mcc }),
          'row 1: mcc must be null or an integer 0-9999',
        ] as const,
    ),
    ...['', 'e'.repeat(201), 17].map(
      (externalId) =>
        [
          `external_id ${JSON.stringify(externalId).slice(0, 12)}`,
          manualRow({ external_id: externalId }),
          'row 1: external_id must be null or 1-200 characters',
        ] as const,
    ),
    [
      'a statement row without external_id',
      statementRow({ external_id: null }),
      'row 1: statement rows need an external_id',
      { import: true },
    ],
    [
      'a foreign amount without currency',
      manualRow({ original_amount_minor: -2_500 }),
      'row 1: original_amount_minor and original_currency go together',
    ],
    [
      'a currency without foreign amount',
      manualRow({ original_currency: 'EUR' }),
      'row 1: original_amount_minor and original_currency go together',
    ],
    [
      'a lower-case currency',
      manualRow({ original_amount_minor: -2_500, original_currency: 'eur' }),
      'row 1: original_currency must be an ISO 4217 code such as EUR',
    ],
    [
      'a foreign amount of 0',
      manualRow({ original_amount_minor: 0, original_currency: 'EUR' }),
      'row 1: original_amount_minor must be a non-zero integer',
    ],
    [
      'items that are not a list',
      manualRow({ items: { a: 1 } }),
      'row 1: items must be a list of at most 500 items',
    ],
    [
      'more than 500 items (checked before any item is read)',
      manualRow({
        items: Array.from({ length: 501 }, () => ({ description: 'x', amount_rappen: 1 })),
      }),
      'row 1: items must be a list of at most 500 items',
    ],
    [
      'an item without description',
      manualRow({ items: [{ description: ' ', amount_rappen: -100 }] }),
      'row 1: items[0].description is empty',
    ],
    [
      'an item amount with a fraction',
      manualRow({ items: [{ description: 'Brot', amount_rappen: -1.5 }] }),
      'row 1: items[0].amount_rappen must be an integer within ±10000000000',
    ],
    [
      'an item quantity of 0',
      manualRow({ items: [{ description: 'Brot', amount_rappen: -150, quantity: 0 }] }),
      'row 1: items[0].quantity must be a positive integer',
    ],
    [
      'an item with an unknown key',
      manualRow({ items: [{ description: 'Brot', amount_rappen: -150, price: 1 }] }),
      'row 1: items[0] must be { description, amount_rappen, quantity }',
    ],
    [
      'items over 20000 bytes',
      manualRow({ items: longItems }),
      'row 1: items must be at most 20000 bytes',
    ],
    [
      'a category_id that is not a uuid',
      manualRow({ category_id: 'groceries' }),
      'row 1: category_id must be a uuid',
    ],
    [
      'a note over 500 characters',
      manualRow({ note: 'n'.repeat(501) }),
      'row 1: note must be null or at most 500 characters',
    ],
    [
      'allow_duplicate that is not a boolean',
      manualRow({ allow_duplicate: 'yes' }),
      'row 1: allow_duplicate must be true or false',
    ],
  ];

  it.each(CASES)('%s', async (_label, badRow, detail, options) => {
    const inImport = (options as CaseOptions | undefined)?.import === true;
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const good = inImport ? statementRow() : manualRow();
      const before = await footprint(db, user);
      const error = await addFails(
        db,
        user,
        { rows: [good, badRow], ...(inImport ? { import: CSV } : {}) },
        SQLSTATE.invalidParameterValue,
      );
      expect([error.message, error.detail]).toEqual(['invalid_row', detail]);
      expect(await footprint(db, user)).toEqual(before);
    });
  });
});

describe('add_transactions() rejects invalid splits and foreign categories (22023)', () => {
  const part = (amount: number, values: Row = {}) => ({
    category_id: null,
    amount_rappen: amount,
    note: null,
    ...values,
  });

  it.each([
    ['splits that are not a list', { splits: { a: 1 } }, 'row 1: splits must be a list'],
    ['a single part', { splits: [part(-1_250)] }, 'row 1: a split has 2 to 50 parts'],
    [
      '51 parts',
      { amount_rappen: -51, splits: Array.from({ length: 51 }, () => part(-1)) },
      'row 1: a split has 2 to 50 parts',
    ],
    [
      'a part with the wrong sign',
      { splits: [part(-1_300), part(50)] },
      'row 1: splits[1].amount_rappen must be a non-zero integer with the sign of the transaction',
    ],
    [
      'a part of 0',
      { splits: [part(-1_250), part(0)] },
      'row 1: splits[1].amount_rappen must be a non-zero integer with the sign of the transaction',
    ],
    [
      'parts that do not add up',
      { splits: [part(-500), part(-500)] },
      'row 1: the parts add up to -1000 Rappen, the transaction is -1250 Rappen',
    ],
    [
      'a part with an unknown key',
      { splits: [part(-1_000, { share: 0.8 }), part(-250)] },
      'row 1: splits[0] must be { category_id, amount_rappen, note }',
    ],
    [
      'a part category that is not a uuid',
      { splits: [part(-1_000, { category_id: 'food' }), part(-250)] },
      'row 1: splits[0].category_id must be a uuid or null',
    ],
    [
      'a part note over 500 characters',
      { splits: [part(-1_000, { note: 'n'.repeat(501) }), part(-250)] },
      'row 1: splits[0].note must be null or at most 500 characters',
    ],
  ])('%s → invalid_splits', async (_label, values, detail) => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const before = await footprint(db, user);
      const error = await addFails(
        db,
        user,
        { rows: [manualRow(), manualRow(values)] },
        SQLSTATE.invalidParameterValue,
      );
      expect([error.message, error.detail]).toEqual(['invalid_splits', detail]);
      expect(await footprint(db, user)).toEqual(before);
    });
  });

  it('a split with a category of its own → invalid_splits', async () => {
    await withRollback(async (db) => {
      const { user, ids } = await onboardedUser(db);
      const error = await addFails(
        db,
        user,
        {
          rows: [
            manualRow(),
            manualRow({ category_id: ids.groceries, splits: [part(-1_000), part(-250)] }),
          ],
        },
        SQLSTATE.invalidParameterValue,
      );
      expect([error.message, error.detail]).toEqual([
        'invalid_splits',
        'row 1: a split transaction has no category_id of its own',
      ]);
    });
  });

  it.each(['another user’s', 'an archived', 'an unknown'])(
    '%s category → category_not_found, also in a split part',
    async (which) => {
      await withRollback(async (db) => {
        const { user } = await onboardedUser(db);
        const { user: other, ids: ofOther } = await onboardedUser(db);
        const foreign =
          which === 'another user’s'
            ? (ofOther.groceries ?? '')
            : which === 'an archived'
              ? await make.category(db, user, { name: 'Alt', archived_at: '2026-01-01T00:00:00Z' })
              : randomUUID();
        expect(other).not.toBe(user);
        const before = await footprint(db, user);
        const direct = await addFails(
          db,
          user,
          { rows: [manualRow(), manualRow({ category_id: foreign })] },
          SQLSTATE.invalidParameterValue,
        );
        expect([direct.message, direct.detail]).toEqual([
          'category_not_found',
          'row 1: category_id is not one of your active categories',
        ]);
        const inSplit = await addFails(
          db,
          user,
          {
            rows: [manualRow({ splits: [part(-1_000, { category_id: foreign }), part(-250)] })],
          },
          SQLSTATE.invalidParameterValue,
        );
        expect([inSplit.message, inSplit.detail]).toEqual([
          'category_not_found',
          'row 0: splits[0].category_id is not one of your active categories',
        ]);
        expect(await footprint(db, user)).toEqual(before);
      });
    },
  );
});

describe('when: booked_at as given, booked_on in the user’s time zone (12:00 without a time)', () => {
  it.each([
    ['Europe/Zurich', '2026-10-03', undefined, '2026-10-03T10:00:00Z'],
    ['Europe/Zurich', '2026-10-03', '14:23', '2026-10-03T12:23:00Z'],
    ['Europe/Zurich', '2026-10-03', '07:05:09', '2026-10-03T05:05:09Z'],
    ['Europe/Zurich', '2026-03-28', undefined, '2026-03-28T11:00:00Z'],
    // Summer time starts on 29 March 2026 at 02:00.
    ['Europe/Zurich', '2026-03-29', undefined, '2026-03-29T10:00:00Z'],
    ['Europe/Zurich', '2026-03-29', '01:30', '2026-03-29T00:30:00Z'],
    ['Europe/Zurich', '2026-03-29', '03:30', '2026-03-29T01:30:00Z'],
    // ... and ends on 25 October 2026 at 03:00.
    ['Europe/Zurich', '2026-10-24', undefined, '2026-10-24T10:00:00Z'],
    ['Europe/Zurich', '2026-10-25', undefined, '2026-10-25T11:00:00Z'],
    ['America/New_York', '2026-03-07', undefined, '2026-03-07T17:00:00Z'],
    ['America/New_York', '2026-03-08', undefined, '2026-03-08T16:00:00Z'],
    ['America/New_York', '2026-10-03', '23:30', '2026-10-04T03:30:00Z'],
    ['Pacific/Kiritimati', '2026-10-03', '08:00', '2026-10-02T18:00:00Z'],
  ])('%s %s %s → %s', async (timeZone, bookedOn, bookedTime, expected) => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db, { timeZone });
      await add(db, user, {
        rows: [
          manualRow({
            booked_at: undefined,
            booked_on: bookedOn,
            ...(bookedTime === undefined ? {} : { booked_time: bookedTime }),
          }),
        ],
      });
      expect(only(await storedRows(db, user)).booked_at).toBe(utc(expected));
    });
  });

  it.each([
    ['2026-10-03T14:23:00+02:00', '2026-10-03T12:23:00.000000Z'],
    ['2026-10-03T12:23:00.123456Z', '2026-10-03T12:23:00.123456Z'],
    ['2026-10-03T23:30-05:00', '2026-10-04T04:30:00.000000Z'],
  ])('booked_at %s → %s', async (bookedAt, expected) => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      await add(db, user, { rows: [manualRow({ booked_at: bookedAt })] });
      expect(only(await storedRows(db, user)).booked_at).toBe(expected);
    });
  });
});

describe('what is stored', () => {
  it('a manual entry with every field, unacknowledged, without data source', async () => {
    await withRollback(async (db) => {
      const { user, ids } = await onboardedUser(db);
      const result = await add(db, user, {
        rows: [
          manualRow({
            amount_rappen: -2_340,
            merchant: '  Bäckerei Hug  ',
            raw_text: 'Quittung',
            mcc: 5462,
            external_id: 'quick-add-1',
            original_amount_minor: -2_500,
            original_currency: 'EUR',
            items: [
              { description: 'Brot', amount_rappen: -340, quantity: 2 },
              { description: 'Torte', amount_rappen: -2_000 },
            ],
            category_id: ids.groceries,
            note: 'Geburtstag',
          }),
        ],
      });
      const row = await storedRow(db, only(result.results).transaction_id);
      expect(row).toEqual({
        id: only(result.results).transaction_id,
        amount_rappen: -2_340,
        booked_at: utc('2026-10-03T10:00:00Z'),
        merchant: 'Bäckerei Hug',
        raw_text: 'Quittung',
        mcc: 5462,
        source: 'manual',
        external_id: 'quick-add-1',
        data_source_id: null,
        category_id: ids.groceries,
        categorized_by: 'user',
        category_confidence: 100,
        fixed_cost_id: null,
        merged_into_id: null,
        note: 'Geburtstag',
        items: [
          { description: 'Brot', amount_rappen: -340, quantity: 2 },
          { description: 'Torte', amount_rappen: -2_000 },
        ],
        original_amount_minor: -2_500,
        original_currency: 'EUR',
        acknowledged: false,
        deleted: false,
      });
      expect(result).toEqual({
        data_source_id: null,
        results: [
          {
            index: 0,
            outcome: 'added',
            transaction_id: row.id,
            duplicate_of: null,
            category_id: ids.groceries,
            categorized_by: 'user',
            category_confidence: 100,
            fixed_cost_id: null,
            needs_review: false,
          },
        ],
        counts: {
          added: 1,
          merged: 0,
          already_imported: 0,
          possible_duplicate: 0,
          needs_review: 0,
        },
      });
    });
  });

  it('empty texts are stored as null, the rows of a call in order', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const result = await add(db, user, {
        rows: [
          manualRow({ raw_text: '', note: '  ', items: [], booked_at: '2026-10-01T10:00:00Z' }),
          manualRow({ merchant: null, booked_at: '2026-10-02T10:00:00Z' }),
        ],
      });
      expect(result.results.map((r) => [r.index, r.outcome])).toEqual([
        [0, 'added'],
        [1, 'added'],
      ]);
      const [first, second] = await storedRows(db, user);
      expect([first?.raw_text, first?.note, first?.items, second?.merchant]).toEqual([
        null,
        null,
        null,
        null,
      ]);
    });
  });

  it('accepts what toIngestRow() in @budget/core builds', async () => {
    await withRollback(async (db) => {
      const { user, ids } = await onboardedUser(db);
      const source: SourceTransaction = {
        amountRappen: -2_340,
        currency: 'CHF',
        bookedOn: '2026-10-03',
        bookedTime: '14:23',
        merchant: 'Coop',
        rawText: 'KAUF COOP-4567 ZUERICH',
        mcc: 5411,
        source: 'statement_import',
        sourceId: 'csv:2026-10-03:-2340:coop zuerich:1',
        original: { amountMinor: -2_500, currency: 'EUR' },
        items: [{ description: 'Brot', amountRappen: -340, quantity: 2 }],
      };
      const result = await add(db, user, {
        rows: [toIngestRow(source, { note: 'Wocheneinkauf', allowDuplicate: false })],
        import: CSV,
      });
      expect(only(result.results)).toMatchObject({
        outcome: 'added',
        category_id: ids.groceries,
        categorized_by: 'merchant_list',
      });
      const manual = await add(db, user, {
        rows: [
          toIngestRow(
            {
              ...source,
              source: 'manual',
              sourceId: null,
              bookedTime: undefined,
              items: undefined,
            },
            {
              splits: [
                { categoryId: ids.groceries ?? null, amountRappen: -2_000, note: 'Essen' },
                { categoryId: null, amountRappen: -340 },
              ],
              // A split cannot be compared by merchant: it looks like the statement row (D-040).
              allowDuplicate: true,
            },
          ),
        ],
      });
      expect(only(manual.results)).toMatchObject({ outcome: 'added', categorized_by: 'user' });
      await runDeferredChecks(db);
    });
  });
});

describe('1. chosen by the person', () => {
  it('a manual category wins over every step after it', async () => {
    await withRollback(async (db) => {
      const { user, ids } = await onboardedUser(db);
      await make.fixedCost(db, user, { kind: 'health_insurance', amount_rappen: 1_250 });
      const result = await add(db, user, {
        rows: [
          manualRow({ merchant: 'Coop Restaurant', category_id: ids.groceries }),
          manualRow({ merchant: 'Helsana', category_id: ids.hobbies }),
        ],
      });
      expect(result.results.map((r) => [r.category_id, r.categorized_by, r.fixed_cost_id])).toEqual(
        [
          [ids.groceries, 'user', null],
          [ids.hobbies, 'user', null],
        ],
      );
    });
  });

  it('category_id null leaves the row to the pipeline', async () => {
    await withRollback(async (db) => {
      const { user, ids } = await onboardedUser(db);
      const result = await add(db, user, {
        rows: [manualRow({ merchant: 'Migros', category_id: null })],
      });
      expect(only(result.results)).toMatchObject({
        category_id: ids.groceries,
        categorized_by: 'merchant_list',
        category_confidence: 90,
      });
    });
  });

  it('a split is stored with its parts and no category of its own', async () => {
    await withRollback(async (db) => {
      const { user, ids } = await onboardedUser(db);
      const result = await add(db, user, {
        rows: [
          manualRow({
            amount_rappen: -10_000,
            merchant: 'Migros',
            category_id: null,
            splits: [
              { category_id: ids.groceries, amount_rappen: -7_000, note: 'Essen' },
              { category_id: null, amount_rappen: -3_000, note: '' },
            ],
          }),
        ],
      });
      const id = only(result.results).transaction_id;
      expect(only(result.results)).toMatchObject({
        category_id: null,
        categorized_by: 'user',
        category_confidence: 100,
        needs_review: false,
      });
      const parts = await queryRows<Row>(
        db,
        `select category_id::text, amount_rappen::float8 as amount, note
           from public.transaction_splits where transaction_id = $1 order by amount_rappen`,
        [id],
      );
      expect(parts).toEqual([
        { category_id: ids.groceries, amount: -7_000, note: 'Essen' },
        { category_id: null, amount: -3_000, note: null },
      ]);
      await runDeferredChecks(db);
    });
  });
});

describe('2. already imported', () => {
  it('the same file twice: the second time nothing is stored and no source is created', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const rows = [statementRow(), statementRow({ amount_rappen: -990, booked_on: '2026-10-04' })];
      const first = await add(db, user, { rows, import: CSV });
      const before = await footprint(db, user);
      const second = await add(db, user, { rows, import: CSV });
      expect(second.data_source_id).toBeNull();
      expect(second.results.map((r) => [r.outcome, r.transaction_id])).toEqual(
        first.results.map((r) => ['already_imported', r.transaction_id]),
      );
      expect(second.counts).toEqual({
        added: 0,
        merged: 0,
        already_imported: 2,
        possible_duplicate: 0,
        needs_review: 2,
      });
      expect(await footprint(db, user)).toEqual(before);
    });
  });

  it('the same id twice in one call: the second row is already imported', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const row = statementRow();
      const result = await add(db, user, {
        rows: [row, { ...row, amount_rappen: -9_999 }],
        import: CSV,
      });
      expect(result.results.map((r) => r.outcome)).toEqual(['added', 'already_imported']);
      expect(result.results[1]?.transaction_id).toBe(result.results[0]?.transaction_id);
      expect(await storedRows(db, user)).toHaveLength(1);
    });
  });

  it('a manual entry with an external id is stored once (a repeated submit)', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const row = manualRow({ external_id: 'device-1:entry-42' });
      const first = await add(db, user, { rows: [row] });
      const second = await add(db, user, { rows: [row] });
      expect(only(second.results)).toMatchObject({
        outcome: 'already_imported',
        transaction_id: only(first.results).transaction_id,
      });
    });
  });

  it('the same id from another source is another transaction', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      await add(db, user, { rows: [manualRow({ external_id: 'x-1', merchant: 'Kiosk A' })] });
      const result = await add(db, user, {
        rows: [statementRow({ external_id: 'x-1', raw_text: 'KIOSK B', booked_on: '2026-09-01' })],
        import: CSV,
      });
      expect(only(result.results).outcome).toBe('added');
    });
  });

  it('points at the surviving transaction when the stored row was merged', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const manual = await add(db, user, { rows: [manualRow({ merchant: 'Coop' })] });
      const row = statementRow({ raw_text: 'KAUF COOP-4567 ZUERICH' });
      const first = await add(db, user, { rows: [row], import: CSV });
      expect(only(first.results).outcome).toBe('merged');
      const again = await add(db, user, { rows: [row], import: CSV });
      expect(only(again.results)).toMatchObject({
        outcome: 'already_imported',
        transaction_id: only(manual.results).transaction_id,
      });
    });
  });
});

describe('3. the same purchase from another source (merged)', () => {
  it('the statement row becomes evidence and the manual entry gains what it lacked', async () => {
    await withRollback(async (db) => {
      const { user, ids } = await onboardedUser(db);
      const manual = await add(db, user, {
        rows: [
          manualRow({ amount_rappen: -2_340, merchant: 'Coop', booked_at: '2026-10-03T12:23:00Z' }),
        ],
      });
      const survivorId = only(manual.results).transaction_id;
      const result = await add(db, user, {
        rows: [
          statementRow({
            amount_rappen: -2_340,
            booked_on: '2026-10-04',
            merchant: 'COOP-4567 ZÜRICH',
            raw_text: 'KAUF COOP-4567 ZUERICH KARTE XXXX1234',
            mcc: 5411,
            original_amount_minor: -2_500,
            original_currency: 'EUR',
            items: [{ description: 'Brot', amount_rappen: -340 }],
          }),
        ],
        import: CSV,
      });
      expect(result).toEqual({
        data_source_id: expect.any(String),
        results: [
          {
            index: 0,
            outcome: 'merged',
            transaction_id: survivorId,
            // The survivor, as it is after the merge.
            duplicate_of: {
              id: survivorId,
              booked_at: '2026-10-03T12:23:00+00:00',
              merchant: 'Coop',
              amount_rappen: -2_340,
              source: 'manual',
            },
            category_id: ids.groceries,
            categorized_by: 'merchant_list',
            category_confidence: 90,
            fixed_cost_id: null,
            needs_review: false,
          },
        ],
        counts: {
          added: 0,
          merged: 1,
          already_imported: 0,
          possible_duplicate: 0,
          needs_review: 0,
        },
      });
      const [survivor, evidence] = await storedRows(db, user);
      expect(survivor).toMatchObject({
        id: survivorId,
        merchant: 'Coop',
        raw_text: 'KAUF COOP-4567 ZUERICH KARTE XXXX1234',
        mcc: 5411,
        original_amount_minor: -2_500,
        original_currency: 'EUR',
        items: [{ description: 'Brot', amount_rappen: -340 }],
        merged_into_id: null,
        source: 'manual',
        acknowledged: false,
      });
      expect(evidence).toMatchObject({
        merged_into_id: survivorId,
        source: 'statement_import',
        data_source_id: result.data_source_id,
        acknowledged: true,
        booked_at: utc('2026-10-04T10:00:00Z'),
      });
      // What the survivor gained is kept on the evidence row, for remove_import (D-041).
      const changes = await queryOne<{ changes: unknown; survivor_changes: unknown }>(
        db,
        `select (select merge_changes from public.transactions where id = $1) as changes,
                (select merge_changes from public.transactions where id = $2) as survivor_changes`,
        [evidence?.id, survivorId],
      );
      expect(changes).toEqual({
        changes: {
          raw_text: { from: null, to: 'KAUF COOP-4567 ZUERICH KARTE XXXX1234' },
          mcc: { from: null, to: 5411 },
          items: { from: null, to: [{ description: 'Brot', amount_rappen: -340 }] },
          original: {
            from: { amount_minor: null, currency: null },
            to: { amount_minor: -2_500, currency: 'EUR' },
          },
        },
        survivor_changes: null,
      });
    });
  });

  it('the survivor keeps its own data', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const manual = await add(db, user, {
        rows: [
          manualRow({
            merchant: 'Migros',
            raw_text: 'Kassenzettel',
            mcc: 5499,
            note: 'Meins',
            original_amount_minor: -1_300,
            original_currency: 'EUR',
            items: [{ description: 'Milch', amount_rappen: -1_250 }],
          }),
        ],
      });
      await add(db, user, {
        rows: [
          statementRow({
            merchant: 'MIGROS M',
            raw_text: 'KAUF MIGROS',
            mcc: 5411,
            note: 'Anders',
            original_amount_minor: -1_400,
            original_currency: 'USD',
            items: [{ description: 'Brot', amount_rappen: -1_250 }],
          }),
        ],
        import: CSV,
      });
      const survivor = await storedRow(db, only(manual.results).transaction_id);
      expect(survivor).toMatchObject({
        merchant: 'Migros',
        raw_text: 'Kassenzettel',
        mcc: 5499,
        note: 'Meins',
        original_amount_minor: -1_300,
        original_currency: 'EUR',
        items: [{ description: 'Milch', amount_rappen: -1_250 }],
      });
    });
  });

  it('a manual entry merged into a statement row brings the person’s category and note', async () => {
    await withRollback(async (db) => {
      const { user, ids } = await onboardedUser(db);
      const imported = await add(db, user, {
        rows: [statementRow({ raw_text: 'KAUF COOP-4567 ZUERICH' })],
        import: CSV,
      });
      expect(only(imported.results)).toMatchObject({ categorized_by: 'merchant_list' });
      const result = await add(db, user, {
        rows: [
          manualRow({
            merchant: 'Coop',
            booked_at: '2026-10-03T11:45:00Z',
            category_id: ids.eating_out,
            note: 'Zmittag',
          }),
        ],
      });
      expect(only(result.results)).toEqual({
        index: 0,
        outcome: 'merged',
        transaction_id: only(imported.results).transaction_id,
        duplicate_of: {
          id: only(imported.results).transaction_id,
          booked_at: '2026-10-03T10:00:00+00:00',
          merchant: 'Coop',
          amount_rappen: -1_250,
          source: 'statement_import',
        },
        category_id: ids.eating_out,
        categorized_by: 'user',
        category_confidence: 100,
        fixed_cost_id: null,
        needs_review: false,
      });
      const survivor = await storedRow(db, only(imported.results).transaction_id);
      expect(survivor).toMatchObject({ merchant: 'Coop', note: 'Zmittag' });
      const evidence = await queryOne<{ changes: unknown }>(
        db,
        'select merge_changes as changes from public.transactions where merged_into_id = $1',
        [only(imported.results).transaction_id],
      );
      expect(evidence.changes).toEqual({
        merchant: { from: null, to: 'Coop' },
        note: { from: null, to: 'Zmittag' },
        category: {
          from: {
            category_id: ids.groceries,
            categorized_by: 'merchant_list',
            category_confidence: 90,
          },
          to: { category_id: ids.eating_out, categorized_by: 'user', category_confidence: 100 },
        },
      });
    });
  });

  it.each([
    ['the person', 'user'],
    ['a rule', 'rule'],
  ])('keeps a category placed by %s, but gains the note', async (_label, placedBy) => {
    await withRollback(async (db) => {
      const { user, ids } = await onboardedUser(db);
      const imported = await add(db, user, {
        rows: [statementRow({ raw_text: 'KAUF COOP-4567 ZUERICH' })],
        import: CSV,
      });
      const survivorId = only(imported.results).transaction_id;
      await db.query(
        `update public.transactions set category_id = $2, categorized_by = $3, category_confidence = 100
          where id = $1`,
        [survivorId, ids.hobbies, placedBy],
      );
      const result = await add(db, user, {
        rows: [manualRow({ merchant: 'Coop', category_id: ids.eating_out, note: 'Zmittag' })],
      });
      expect(only(result.results)).toMatchObject({
        outcome: 'merged',
        category_id: ids.hobbies,
        categorized_by: placedBy,
      });
      expect(await storedRow(db, survivorId)).toMatchObject({ note: 'Zmittag' });
    });
  });

  it('keeps a fixed-cost link of the survivor', async () => {
    await withRollback(async (db) => {
      const { user, ids } = await onboardedUser(db);
      const insurance = await make.fixedCost(db, user, {
        kind: 'health_insurance',
        amount_rappen: 42_000,
      });
      const imported = await add(db, user, {
        rows: [statementRow({ amount_rappen: -42_000, raw_text: 'LSV HELSANA' })],
        import: CSV,
      });
      expect(only(imported.results).fixed_cost_id).toBe(insurance);
      const result = await add(db, user, {
        rows: [
          manualRow({ amount_rappen: -42_000, merchant: 'Helsana', category_id: ids.hobbies }),
        ],
      });
      expect(only(result.results)).toMatchObject({
        outcome: 'merged',
        category_id: null,
        fixed_cost_id: insurance,
        needs_review: false,
      });
    });
  });

  // D-040: local dates in the person's zone at most 4 days apart, whatever the hour.
  it.each([
    // Zurich is UTC+2 until 25 October: 2026-10-02T22:00Z is 3 October 00:00 there.
    ['the 3rd 00:00 and the 7th 23:59:59 (4 days): merged', '2026-10-02T22:00:00Z', 'merged'],
    ['the 2nd 23:59:59 and the 7th (5 days): added', '2026-10-02T21:59:59Z', 'added'],
  ])('%s', async (_label, manualAt, outcome) => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      await add(db, user, { rows: [manualRow({ merchant: 'Coop', booked_at: manualAt })] });
      const result = await add(db, user, {
        rows: [
          statementRow({
            booked_on: undefined,
            booked_at: '2026-10-07T21:59:59Z',
            raw_text: 'KAUF COOP',
          }),
        ],
        import: CSV,
      });
      expect(only(result.results).outcome).toBe(outcome);
    });
  });

  it.each([
    ['4 local days before the manual entry', '2026-10-07T21:59:59Z', 'merged'],
    ['5 local days before', '2026-10-07T22:00:00Z', 'added'],
  ])('a statement row booked %s', async (_label, manualAt, outcome) => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      await add(db, user, {
        rows: [
          statementRow({
            booked_on: undefined,
            booked_at: '2026-10-02T22:00:00Z',
            raw_text: 'KAUF COOP',
          }),
        ],
        import: CSV,
      });
      const result = await add(db, user, {
        rows: [manualRow({ merchant: 'Coop', booked_at: manualAt })],
      });
      expect(only(result.results).outcome).toBe(outcome);
    });
  });

  it.each([
    ['Friday 08:00, statement dated Monday (date only)', '2026-10-02T06:00:00Z', '2026-10-05', 'merged'],
    ['Thursday 08:00, statement dated Monday', '2026-10-01T06:00:00Z', '2026-10-05', 'merged'],
    ['Wednesday 23:59, statement dated Monday', '2026-09-30T21:59:00Z', '2026-10-05', 'added'],
    // Daylight saving ends on 25 October: the 22nd 00:00 CEST to the 26th is 4 days, 13 hours.
    ['the 22nd 00:00 CEST, statement dated the 26th (CET)', '2026-10-21T22:00:00Z', '2026-10-26', 'merged'],
    ['the 21st 23:59 CEST, statement dated the 26th', '2026-10-21T21:59:00Z', '2026-10-26', 'added'],
    // Daylight saving starts on 29 March: the 26th 00:00 CET to the 30th.
    ['the 26th 00:00 CET, statement dated the 30th (CEST)', '2026-03-25T23:00:00Z', '2026-03-30', 'merged'],
    ['the 25th 23:59 CET, statement dated the 30th', '2026-03-25T22:59:00Z', '2026-03-30', 'added'],
  ])('%s: %s', async (_label, manualAt, statementDay, outcome) => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      await add(db, user, { rows: [manualRow({ merchant: 'Migros', booked_at: manualAt })] });
      const result = await add(db, user, {
        rows: [statementRow({ booked_on: statementDay, raw_text: 'MIGROS M ZUERICH' })],
        import: CSV,
      });
      expect(only(result.results).outcome).toBe(outcome);
    });
  });

  it('counts local dates in the person’s own zone (America/New_York)', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db, { timeZone: 'America/New_York' });
      // 2026-10-03T03:59Z is the 2nd 23:59 in New York: 5 days before the 7th.
      await add(db, user, {
        rows: [
          manualRow({ merchant: 'Coop', booked_at: '2026-10-03T03:59:00Z' }),
          manualRow({ merchant: 'Coop', booked_at: '2026-10-03T04:00:00Z', amount_rappen: -999 }),
        ],
      });
      const result = await add(db, user, {
        rows: [
          statementRow({ booked_on: '2026-10-07', raw_text: 'KAUF COOP' }),
          statementRow({ booked_on: '2026-10-07', raw_text: 'KAUF COOP', amount_rappen: -999 }),
        ],
        import: CSV,
      });
      expect(result.results.map((r) => r.outcome)).toEqual(['added', 'merged']);
    });
  });

  it.each([
    ['Coop', { raw_text: 'KAUF COOP-4567 ZUERICH' }, 'merged'], // one key contains the other
    ['Coop Pronto', { merchant: 'COOP-4567 ZÜRICH' }, 'merged'], // the same first word
    ['Coop', { merchant: 'Coopers' }, 'added'],
    ['TWINT *Coop Pronto', { merchant: 'Coop Pronto Bahnhof' }, 'added'],
    ['Migros', { raw_text: 'KAUF COOP' }, 'added'],
    // The dedupe corpus of QA M2: folded spellings and apostrophes merge,
    ['Bäckerei Hug', { merchant: 'BAECKEREI HUG BERN' }, 'merged'],
    ['Müller Drogerie', { merchant: 'MUELLER DROGERIE ZUERICH' }, 'merged'],
    ['Sprüngli', { merchant: 'CONFISERIE SPRUENGLI' }, 'merged'],
    ["McDonald's", { merchant: 'MCDONALDS 123' }, 'merged'],
    // a shared generic first word does not.
    ['Restaurant Krone', { merchant: 'Restaurant Sonne' }, 'added'],
    ['Bäckerei Hug', { merchant: 'Bäckerei Müller' }, 'added'],
    ['TWINT Coop', { merchant: 'TWINT Migros' }, 'added'],
    // Neither has a key: they cannot be compared, so it is a look-alike (step 4).
    ['1234', { raw_text: '1234' }, 'possible_duplicate'],
  ])('merchant %s vs %j → %s', async (merchant, statementValues, outcome) => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      await add(db, user, { rows: [manualRow({ merchant })] });
      const result = await add(db, user, {
        rows: [statementRow({ raw_text: null, ...statementValues })],
        import: CSV,
      });
      expect(only(result.results).outcome).toBe(outcome);
    });
  });

  it('needs the same amount', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      await add(db, user, { rows: [manualRow({ merchant: 'Coop', amount_rappen: -2_340 })] });
      const result = await add(db, user, {
        rows: [statementRow({ raw_text: 'KAUF COOP', amount_rappen: -2_345 })],
        import: CSV,
      });
      expect(only(result.results).outcome).toBe('added');
    });
  });

  it('two identical coffees stay two: a transaction absorbs one row per source', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const imported = await add(db, user, {
        rows: [statementRow({ amount_rappen: -650, raw_text: 'STARBUCKS ZURICH' })],
        import: CSV,
      });
      const coffee = manualRow({ amount_rappen: -650, merchant: 'Starbucks' });
      const result = await add(db, user, { rows: [coffee, coffee] });
      expect(result.results.map((r) => r.outcome)).toEqual(['merged', 'added']);
      expect(result.results[0]?.transaction_id).toBe(only(imported.results).transaction_id);
      const third = await add(db, user, { rows: [coffee] });
      expect(only(third.results).outcome).toBe('added');
    });
  });

  it('a transaction absorbs one row from each other source', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const bank = await make.transaction(db, user, {
        amount_rappen: -650,
        booked_at: '2026-10-03T08:00:00Z',
        merchant: 'Starbucks',
        source: 'bank',
      });
      const manual = await add(db, user, {
        rows: [manualRow({ amount_rappen: -650, merchant: 'Starbucks Bahnhof' })],
      });
      const imported = await add(db, user, {
        rows: [statementRow({ amount_rappen: -650, raw_text: 'STARBUCKS' })],
        import: CSV,
      });
      expect(
        [only(manual.results), only(imported.results)].map((r) => [r.outcome, r.transaction_id]),
      ).toEqual([
        ['merged', bank],
        ['merged', bank],
      ]);
    });
  });

  it('rows with a split are never merged, in either direction: they are look-alikes', async () => {
    await withRollback(async (db) => {
      const { user, ids } = await onboardedUser(db);
      const split = await add(db, user, {
        rows: [
          manualRow({
            merchant: 'Coop',
            splits: [
              { category_id: ids.groceries, amount_rappen: -1_000, note: null },
              { category_id: null, amount_rappen: -250, note: null },
            ],
          }),
        ],
      });
      expect(only(split.results).outcome).toBe('added');
      const lookAlike = await add(db, user, {
        rows: [statementRow({ raw_text: 'KAUF COOP' })],
        import: CSV,
      });
      expect(only(lookAlike.results)).toMatchObject({
        outcome: 'possible_duplicate',
        transaction_id: null,
        duplicate_of: { id: only(split.results).transaction_id, merchant: 'Coop', source: 'manual' },
      });
      const imported = await add(db, user, {
        rows: [statementRow({ raw_text: 'KAUF COOP', allow_duplicate: true })],
        import: CSV,
      });
      expect(only(imported.results).outcome).toBe('added');
      const second = await add(db, user, {
        rows: [
          manualRow({
            merchant: 'Coop',
            booked_at: '2026-10-03T11:00:00Z',
            splits: [
              { category_id: ids.groceries, amount_rappen: -1_000, note: null },
              { category_id: null, amount_rappen: -250, note: null },
            ],
          }),
        ],
      });
      expect(only(second.results)).toMatchObject({
        outcome: 'possible_duplicate',
        duplicate_of: { id: only(imported.results).transaction_id, source: 'statement_import' },
      });
      await runDeferredChecks(db);
    });
  });

  it('the closest in time wins, then the oldest', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      await make.transaction(db, user, {
        amount_rappen: -500,
        merchant: 'Kiosk',
        booked_at: '2026-10-01T10:00:00Z',
      });
      const closer = await make.transaction(db, user, {
        amount_rappen: -500,
        merchant: 'Kiosk',
        booked_at: '2026-10-02T10:00:00Z',
      });
      const result = await add(db, user, {
        rows: [statementRow({ amount_rappen: -500, raw_text: 'KIOSK' })],
        import: CSV,
      });
      expect(only(result.results).transaction_id).toBe(closer);

      const older = await make.transaction(db, user, {
        amount_rappen: -700,
        merchant: 'Kiosk',
        booked_at: '2026-10-02T10:00:00Z',
        created_at: '2026-01-01T00:00:00Z',
      });
      await make.transaction(db, user, {
        amount_rappen: -700,
        merchant: 'Kiosk',
        booked_at: '2026-10-04T10:00:00Z',
        created_at: '2026-02-01T00:00:00Z',
      });
      const tie = await add(db, user, {
        rows: [statementRow({ amount_rappen: -700, raw_text: 'KIOSK' })],
        import: CSV,
      });
      expect(only(tie.results).transaction_id).toBe(older);
    });
  });

  it('never merges into a deleted or an already merged row', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const survivor = await make.transaction(db, user, {
        amount_rappen: -800,
        merchant: 'Kiosk',
        source: 'bank',
        booked_at: '2026-10-01T10:00:00Z',
      });
      await make.transaction(db, user, {
        amount_rappen: -800,
        merchant: 'Kiosk',
        booked_at: '2026-10-03T10:00:00Z',
        merged_into_id: survivor,
        source: 'android_notification',
      });
      await make.transaction(db, user, {
        amount_rappen: -800,
        merchant: 'Kiosk',
        booked_at: '2026-10-03T10:00:00Z',
        deleted_at: '2026-10-03T12:00:00Z',
      });
      await db.query('update public.transactions set deleted_at = now() where id = $1', [survivor]);
      const result = await add(db, user, {
        rows: [statementRow({ amount_rappen: -800, raw_text: 'KIOSK' })],
        import: CSV,
      });
      expect(only(result.results).outcome).toBe('added');
    });
  });
});

describe('4. possible duplicate from the same source (statement files)', () => {
  it('the same statement as CSV and as camt.053: reported, not stored', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const csv = await add(db, user, {
        rows: [
          statementRow({ raw_text: 'KAUF DENNER ZUG', amount_rappen: -1_500 }),
          statementRow({ raw_text: 'KAUF VOLG', amount_rappen: -320, booked_on: '2026-10-04' }),
        ],
        import: CSV,
      });
      const before = await footprint(db, user);
      const camt = await add(db, user, {
        rows: [
          statementRow({ raw_text: 'Denner AG Zug', amount_rappen: -1_500, external_id: 'camt:1' }),
          statementRow({
            raw_text: 'VOLG',
            amount_rappen: -320,
            booked_on: '2026-10-04',
            external_id: 'camt:2',
          }),
        ],
        import: CAMT,
      });
      expect(camt).toEqual({
        data_source_id: null,
        results: [
          {
            index: 0,
            outcome: 'possible_duplicate',
            transaction_id: null,
            duplicate_of: {
              id: csv.results[0]?.transaction_id,
              booked_at: '2026-10-03T10:00:00+00:00',
              merchant: null,
              amount_rappen: -1_500,
              source: 'statement_import',
            },
            category_id: null,
            categorized_by: 'none',
            category_confidence: null,
            fixed_cost_id: null,
            needs_review: false,
          },
          expect.objectContaining({
            index: 1,
            outcome: 'possible_duplicate',
            duplicate_of: expect.objectContaining({ id: csv.results[1]?.transaction_id }),
          }),
        ],
        counts: {
          added: 0,
          merged: 0,
          already_imported: 0,
          possible_duplicate: 2,
          needs_review: 0,
        },
      });
      expect(await footprint(db, user)).toEqual(before);
    });
  });

  it('allow_duplicate stores it anyway', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      await add(db, user, { rows: [statementRow({ raw_text: 'KAUF DENNER' })], import: CSV });
      const result = await add(db, user, {
        rows: [statementRow({ raw_text: 'KAUF DENNER', allow_duplicate: true })],
        import: CAMT,
      });
      expect(only(result.results).outcome).toBe('added');
      expect(await storedRows(db, user)).toHaveLength(2);
    });
  });

  it('two identical rows in one file are both kept', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const result = await add(db, user, {
        rows: [statementRow({ raw_text: 'SBB TICKET' }), statementRow({ raw_text: 'SBB TICKET' })],
        import: CSV,
      });
      expect(result.results.map((r) => r.outcome)).toEqual(['added', 'added']);
    });
  });

  it('uses local days at most 4 apart: the 3rd 00:30 and the 7th 23:30 in Zurich, not the 8th', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      await add(db, user, {
        rows: [statementRow({ booked_time: '00:30', raw_text: 'KAUF DENNER' })],
        import: CSV,
      });
      const result = await add(db, user, {
        rows: [
          statementRow({ booked_on: '2026-10-07', booked_time: '23:30', raw_text: 'KAUF DENNER' }),
          statementRow({ booked_on: '2026-10-08', booked_time: '00:10', raw_text: 'KAUF DENNER' }),
          statementRow({ booked_on: '2026-09-29', booked_time: '00:10', raw_text: 'KAUF DENNER' }),
          statementRow({ booked_on: '2026-09-28', booked_time: '23:50', raw_text: 'KAUF DENNER' }),
        ],
        import: CAMT,
      });
      expect(result.results.map((r) => r.outcome)).toEqual([
        'possible_duplicate',
        'added',
        'possible_duplicate',
        'added',
      ]);
    });
  });

  it('a CSV without purchase dates (booking day) and the camt.053 with the purchase day, 3 days earlier', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      // ZKB-style CSV: card purchases carry the booking day only.
      const csv = await add(db, user, {
        rows: [
          statementRow({
            booked_on: '2026-10-05',
            raw_text: 'Einkauf ZKB Visa Debit Karte Coop Pronto Bern',
            merchant: 'Coop Pronto Bern',
            amount_rappen: -1_865,
            external_id: 'zkb:2026-10-05:1',
          }),
        ],
        import: { file_name: 'zkb.csv', format: 'csv', bank: 'zkb' },
      });
      // The bank's camt.053 for the same account: the purchase was on Friday the 2nd.
      const camt = await add(db, user, {
        rows: [
          statementRow({
            booked_on: '2026-10-02',
            booked_time: '17:42',
            raw_text: 'COOP PRONTO BERN',
            merchant: 'Coop Pronto Bern',
            amount_rappen: -1_865,
            external_id: 'camt:ZKB-REF-123',
          }),
        ],
        import: CAMT,
      });
      expect(only(camt.results)).toMatchObject({
        outcome: 'possible_duplicate',
        duplicate_of: { id: only(csv.results).transaction_id, source: 'statement_import' },
      });
      expect(await storedRows(db, user)).toHaveLength(1);
    });
  });

  it('rows without any merchant key are compared as such', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      await add(db, user, { rows: [statementRow({ raw_text: '0815 4711' })], import: CSV });
      const result = await add(db, user, {
        rows: [statementRow({ raw_text: null }), statementRow({ raw_text: 'KAUF DENNER' })],
        import: CAMT,
      });
      expect(result.results.map((r) => r.outcome)).toEqual(['possible_duplicate', 'added']);
    });
  });

  it('the same purchase with another merchant key from the same source is no duplicate', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      await add(db, user, { rows: [statementRow({ raw_text: 'Restaurant Krone' })], import: CSV });
      const result = await add(db, user, {
        rows: [statementRow({ raw_text: 'Restaurant Sonne', booked_on: '2026-10-04' })],
        import: CAMT,
      });
      expect(only(result.results).outcome).toBe('added');
    });
  });

  it('deleted rows are no duplicates', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const csv = await add(db, user, {
        rows: [statementRow({ raw_text: 'KAUF DENNER' })],
        import: CSV,
      });
      await db.query('update public.transactions set deleted_at = now() where id = $1', [
        only(csv.results).transaction_id,
      ]);
      const result = await add(db, user, {
        rows: [statementRow({ raw_text: 'KAUF DENNER' })],
        import: CAMT,
      });
      expect(only(result.results).outcome).toBe('added');
    });
  });

  it('manual entries are never reported as duplicates of each other', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      await add(db, user, { rows: [manualRow()] });
      const result = await add(db, user, { rows: [manualRow()] });
      expect(only(result.results).outcome).toBe('added');
    });
  });

  it('points at the transaction the person sees when the match was merged', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const manual = await add(db, user, { rows: [manualRow({ merchant: 'Denner' })] });
      const csv = await add(db, user, {
        rows: [statementRow({ raw_text: 'KAUF DENNER ZUG' })],
        import: CSV,
      });
      expect(only(csv.results).outcome).toBe('merged');
      const camt = await add(db, user, {
        rows: [statementRow({ raw_text: 'DENNER ZUG' })],
        import: CAMT,
      });
      expect(only(camt.results)).toMatchObject({
        outcome: 'possible_duplicate',
        duplicate_of: {
          id: only(manual.results).transaction_id,
          merchant: 'Denner',
          source: 'manual',
        },
      });
    });
  });
});

describe('5. fixed cost by its merchant hint', () => {
  async function rent(db: Db, user: string, values: Row = {}): Promise<string> {
    return make.fixedCost(db, user, {
      kind: 'rent',
      amount_rappen: 185_000,
      merchant_hint: 'Verwaltung Muster',
      ...values,
    });
  }

  it.each([
    [-185_000, true],
    [-222_000, true],
    [-222_001, false],
    [-148_000, true],
    [-147_999, false],
    [185_000, false],
  ])('%s Rappen to "VERWALTUNG MUSTER AG" → linked: %s', async (amount, linked) => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const fixedCost = await rent(db, user);
      const result = await add(db, user, {
        rows: [
          statementRow({ amount_rappen: amount, raw_text: 'DAUERAUFTRAG VERWALTUNG MUSTER AG' }),
        ],
        import: CSV,
      });
      expect(only(result.results)).toMatchObject(
        linked
          ? {
              fixed_cost_id: fixedCost,
              category_id: null,
              categorized_by: 'none',
              needs_review: false,
            }
          : { fixed_cost_id: null },
      );
    });
  });

  it('an inactive fixed cost or a hint that is not a whole-word run does not link', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      await rent(db, user, { active: false });
      await rent(db, user, { merchant_hint: 'Verwaltung Must' });
      // Not the exact amount, so step 9 does not apply either.
      const result = await add(db, user, {
        rows: [statementRow({ amount_rappen: -190_000, raw_text: 'VERWALTUNG MUSTER' })],
        import: CSV,
      });
      expect(only(result.results).fixed_cost_id).toBeNull();
    });
  });

  it('the longest fitting hint wins, also for manual entries', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      await rent(db, user, { merchant_hint: 'Muster' });
      const specific = await rent(db, user, { merchant_hint: 'Verwaltung Muster' });
      const result = await add(db, user, {
        rows: [manualRow({ amount_rappen: -185_000, merchant: 'Verwaltung Muster GmbH' })],
      });
      expect(only(result.results).fixed_cost_id).toBe(specific);
    });
  });

  it('comes before the person’s rules and the known merchants', async () => {
    await withRollback(async (db) => {
      const { user, ids } = await onboardedUser(db);
      const gym = await make.fixedCost(db, user, {
        kind: 'other',
        amount_rappen: 9_900,
        merchant_hint: 'Fitnesspark',
      });
      await make.rule(db, user, ids.hobbies ?? '', { pattern: 'Fitnesspark' });
      const result = await add(db, user, {
        rows: [statementRow({ amount_rappen: -9_900, raw_text: 'LSV FITNESSPARK' })],
        import: CSV,
      });
      expect(only(result.results)).toMatchObject({ fixed_cost_id: gym, category_id: null });
    });
  });
});

describe('9. fixed cost by exact amount', () => {
  it('links a statement row without category to the one fixed cost of that amount and learns the merchant', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const gym = await make.fixedCost(db, user, {
        kind: 'other',
        amount_rappen: 9_900,
        label: 'Gym',
      });
      const result = await add(db, user, {
        rows: [
          statementRow({
            amount_rappen: -9_900,
            booked_on: '2026-09-01',
            raw_text: 'LSV KRAFTWERK GYM 0815',
          }),
          // Next month the learned hint (step 5) recognizes it, also at a new price.
          statementRow({
            amount_rappen: -10_500,
            booked_on: '2026-10-01',
            raw_text: 'LSV KRAFTWERK GYM 0916',
          }),
        ],
        import: CSV,
      });
      expect(result.results.map((r) => r.fixed_cost_id)).toEqual([gym, gym]);
      const hint = await queryOne<{ hint: string }>(
        db,
        'select merchant_hint as hint from public.fixed_costs where id = $1',
        [gym],
      );
      // Payment words (LSV) and numbers are left out of the hint.
      expect(hint.hint).toBe('kraftwerk gym');
    });
  });

  it('learns from the merchant when the row has one', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const gym = await make.fixedCost(db, user, { kind: 'other', amount_rappen: 9_900 });
      await add(db, user, {
        rows: [
          statementRow({ amount_rappen: -9_900, merchant: 'Kraftwerk Gym AG', raw_text: 'LSV' }),
        ],
        import: CSV,
      });
      const hint = await queryOne<{ hint: string }>(
        db,
        'select merchant_hint as hint from public.fixed_costs where id = $1',
        [gym],
      );
      expect(hint.hint).toBe('kraftwerk gym');
    });
  });

  it('keeps a merchant hint the fixed cost already has', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const gym = await make.fixedCost(db, user, {
        kind: 'other',
        amount_rappen: 9_900,
        merchant_hint: 'Altes Studio',
      });
      const result = await add(db, user, {
        rows: [statementRow({ amount_rappen: -9_900, raw_text: 'LSV KRAFTWERK' })],
        import: CSV,
      });
      expect(only(result.results).fixed_cost_id).toBe(gym);
      expect(await footprint(db, user)).toMatchObject({ hints: 'Altes Studio' });
    });
  });

  it('not when another payment of it is booked within 20 days (inclusive)', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const gym = await make.fixedCost(db, user, { kind: 'other', amount_rappen: 9_900 });
      // No merchant key, so nothing is learned and only the amount decides.
      const row = (bookedOn: string) =>
        statementRow({ amount_rappen: -9_900, booked_on: bookedOn, raw_text: '0815 4711' });
      const result = await add(db, user, {
        rows: [row('2026-09-01'), row('2026-09-21'), row('2026-09-22')],
        import: CSV,
      });
      expect(result.results.map((r) => [r.fixed_cost_id, r.needs_review])).toEqual([
        [gym, false],
        [null, true],
        [gym, false],
      ]);
    });
  });

  it('not when two active fixed costs have that amount', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      await make.fixedCost(db, user, { kind: 'other', amount_rappen: 9_900 });
      await make.fixedCost(db, user, { kind: 'subscriptions', amount_rappen: 9_900 });
      await make.fixedCost(db, user, { kind: 'rent', amount_rappen: 9_900, active: false });
      const result = await add(db, user, {
        rows: [statementRow({ amount_rappen: -9_900, raw_text: 'LSV KRAFTWERK' })],
        import: CSV,
      });
      expect(only(result.results).fixed_cost_id).toBeNull();
    });
  });

  it('a manual entry is never linked by its amount alone', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      await make.fixedCost(db, user, { kind: 'other', amount_rappen: 9_900 });
      const result = await add(db, user, {
        rows: [manualRow({ amount_rappen: -9_900, merchant: 'Kraftwerk' })],
      });
      expect(only(result.results)).toMatchObject({ fixed_cost_id: null, needs_review: true });
      expect(await footprint(db, user)).toMatchObject({ hints: '-' });
    });
  });

  it('not for a row that already has a category, nor for money in', async () => {
    await withRollback(async (db) => {
      const { user, ids } = await onboardedUser(db);
      await make.fixedCost(db, user, { kind: 'other', amount_rappen: 9_900 });
      const result = await add(db, user, {
        rows: [
          statementRow({ amount_rappen: -9_900, raw_text: 'LADEN', mcc: 5411 }),
          statementRow({ amount_rappen: 9_900, raw_text: 'GUTSCHRIFT' }),
        ],
        import: CSV,
      });
      expect(result.results.map((r) => [r.category_id, r.fixed_cost_id])).toEqual([
        [ids.groceries, null],
        [null, null],
      ]);
    });
  });

  it('not for a row that is merged (the survivor is not changed)', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      await make.fixedCost(db, user, { kind: 'other', amount_rappen: 9_900 });
      const manual = await add(db, user, {
        rows: [manualRow({ amount_rappen: -9_900, merchant: 'Kraftwerk' })],
      });
      const result = await add(db, user, {
        rows: [statementRow({ amount_rappen: -9_900, raw_text: 'KRAFTWERK' })],
        import: CSV,
      });
      expect(only(result.results)).toMatchObject({
        outcome: 'merged',
        transaction_id: only(manual.results).transaction_id,
        fixed_cost_id: null,
      });
      expect(await footprint(db, user)).toMatchObject({ hints: '-' });
    });
  });
});

describe('categorization results and needs_review', () => {
  it('reports how each row was placed and counts what needs review', async () => {
    await withRollback(async (db) => {
      const { user, ids } = await onboardedUser(db);
      const velo = await make.category(db, user, { name: 'Velo' });
      await make.rule(db, user, velo, { pattern: 'Veloplus' });
      const result = await add(db, user, {
        rows: [
          manualRow({ merchant: 'Veloplus Zürich' }),
          manualRow({ merchant: 'Migros' }),
          manualRow({ merchant: 'Avec Bahnhof' }),
          manualRow({ merchant: 'Laden Muster', mcc: 5812 }),
          manualRow({ merchant: 'Laden Muster', mcc: 5311 }),
          manualRow({ merchant: 'Laden Muster' }),
          manualRow({ merchant: 'Gutschrift', amount_rappen: 5_000 }),
        ],
      });
      expect(
        result.results.map((r) => [
          r.category_id,
          r.categorized_by,
          r.category_confidence,
          r.needs_review,
        ]),
      ).toEqual([
        [velo, 'rule', 100, false],
        [ids.groceries, 'merchant_list', 90, false],
        [ids.groceries, 'merchant_list', 60, true],
        [ids.eating_out, 'mcc', 85, false],
        [null, 'none', null, true], // 5311 is clothes, which this user does not have
        [null, 'none', null, true],
        [null, 'none', null, false], // money in without category does not count
      ]);
      expect(result.counts).toEqual({
        added: 7,
        merged: 0,
        already_imported: 0,
        possible_duplicate: 0,
        needs_review: 3,
      });
    });
  });
});

describe('statement imports', () => {
  it('create one data source for the file and link every stored row to it', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      await add(db, user, {
        rows: [
          manualRow({ merchant: 'Coop', amount_rappen: -2_340, booked_at: '2026-10-02T18:00:00Z' }),
        ],
      });
      const result = await add(db, user, {
        rows: [
          statementRow({ raw_text: 'KAUF COOP', amount_rappen: -2_340 }),
          statementRow({ raw_text: 'KAUF DENNER' }),
          statementRow({ raw_text: 'KAUF VOLG' }),
        ],
        import: CSV,
      });
      expect(result.counts).toMatchObject({ added: 2, merged: 1 });
      const source = await queryOne<Row>(
        db,
        `select id::text, kind, provider, display_name, status, consent_version, settings,
                last_synced_at = now() as synced_now, consent_revoked_at
           from public.data_sources where user_id = $1`,
        [user],
      );
      expect(source).toEqual({
        id: result.data_source_id,
        kind: 'statement_import',
        provider: 'postfinance',
        display_name: CSV.file_name,
        status: 'active',
        consent_version: 'statement-import-1',
        settings: {
          file_name: CSV.file_name,
          format: 'csv',
          bank: 'postfinance',
          added: 2,
          merged: 1,
        },
        synced_now: true,
        consent_revoked_at: null,
      });
      const rows = await storedRows(db, user);
      expect(rows.map((r) => [r.source, r.data_source_id, r.acknowledged])).toEqual([
        ['manual', null, false],
        ['statement_import', result.data_source_id, true],
        ['statement_import', result.data_source_id, true],
        ['statement_import', result.data_source_id, true],
      ]);
    });
  });

  it('use the format as provider without a bank and cut long file names to 80 characters', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const fileName = `${'Kontoauszug '.repeat(10)}.xml`;
      const result = await add(db, user, {
        rows: [statementRow()],
        import: { ...CAMT, file_name: fileName },
      });
      const source = await queryOne<Row>(
        db,
        'select provider, display_name, settings from public.data_sources where id = $1',
        [result.data_source_id],
      );
      expect(source).toEqual({
        provider: 'camt053',
        display_name: fileName.slice(0, 80),
        settings: { file_name: fileName, format: 'camt053', bank: null, added: 1, merged: 0 },
      });
    });
  });

  it('create no data source when nothing was stored', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const row = statementRow();
      await add(db, user, { rows: [row], import: CSV });
      const again = await add(db, user, {
        rows: [row, statementRow({ external_id: 'camt:9' })],
        import: CAMT,
      });
      expect(again.results.map((r) => r.outcome)).toEqual([
        'already_imported',
        'possible_duplicate',
      ]);
      expect(again.data_source_id).toBeNull();
      expect(
        await countRows(db, 'select 1 from public.data_sources where user_id = $1', [user]),
      ).toBe(1);
    });
  });
});

describe('dry runs', () => {
  /** A user with a stored manual entry, a stored CSV row and a fixed cost without hint. */
  async function scenario(db: Db) {
    const { user, ids } = await onboardedUser(db);
    const gym = await make.fixedCost(db, user, { kind: 'other', amount_rappen: 9_900 });
    const manual = await add(db, user, {
      rows: [manualRow({ merchant: 'Coop', amount_rappen: -2_340 })],
    });
    await add(db, user, {
      rows: [
        statementRow({ raw_text: 'KAUF DENNER', amount_rappen: -1_500, external_id: 'csv:A' }),
      ],
      import: CSV,
    });
    const rows = [
      statementRow({ raw_text: 'KAUF COOP-4567', amount_rappen: -2_340, external_id: 'camt:1' }),
      statementRow({ raw_text: 'DENNER', amount_rappen: -1_500, external_id: 'camt:2' }),
      statementRow({
        raw_text: 'LSV KRAFTWERK GYM',
        amount_rappen: -9_900,
        booked_on: '2026-09-01',
        external_id: 'camt:3',
      }),
      statementRow({
        raw_text: 'LSV KRAFTWERK GYM',
        amount_rappen: -10_500,
        booked_on: '2026-10-01',
        external_id: 'camt:4',
      }),
      statementRow({
        raw_text: 'LSV KRAFTWERK GYM',
        amount_rappen: -10_500,
        booked_on: '2026-10-01',
        external_id: 'camt:4',
      }),
      statementRow({ raw_text: 'LADEN MUSTER', amount_rappen: -800, external_id: 'camt:5' }),
      statementRow({ raw_text: 'KAUF MIGROS', amount_rappen: -4_500, external_id: 'camt:6' }),
    ];
    return { user, ids, gym, manualId: only(manual.results).transaction_id, rows };
  }

  it('computes the same result as the real call and stores nothing', async () => {
    await withRollback(async (db) => {
      const { user, ids, gym, manualId, rows } = await scenario(db);
      const before = await footprint(db, user);
      const survivorBefore = await storedRow(db, manualId);
      const dry = await add(db, user, { rows, import: CAMT, dry_run: true });
      expect(await footprint(db, user)).toEqual(before);
      expect(await storedRow(db, manualId)).toEqual(survivorBefore);

      const real = await add(db, user, { rows, import: CAMT, dry_run: false });
      expect(real.data_source_id).toEqual(expect.any(String));
      expect(dry.data_source_id).toBeNull();
      expect(dry.counts).toEqual(real.counts);
      expect(dry.counts).toEqual({
        added: 4,
        merged: 1,
        already_imported: 1,
        possible_duplicate: 1,
        needs_review: 1,
      });
      // Identical, except that rows the dry run did not store have no id.
      const newIds = new Set(
        real.results.filter((r) => r.outcome === 'added').map((r) => r.transaction_id),
      );
      expect(dry.results).toEqual(
        real.results.map((r) => ({
          ...r,
          transaction_id: newIds.has(r.transaction_id) ? null : r.transaction_id,
        })),
      );
      expect(real.results.map((r) => [r.outcome, r.fixed_cost_id, r.category_id])).toEqual([
        ['merged', null, ids.groceries],
        ['possible_duplicate', null, null],
        ['added', gym, null],
        ['added', gym, null],
        ['already_imported', gym, null],
        ['added', null, null],
        ['added', null, ids.groceries],
      ]);
      expect(real.results[0]?.transaction_id).toBe(manualId);
      expect(real.results[4]?.transaction_id).toBe(real.results[3]?.transaction_id);
    });
  });

  it('a dry run of manual entries stores nothing either', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const before = await footprint(db, user);
      const dry = await add(db, user, {
        rows: [
          manualRow(),
          manualRow({
            splits: [
              { category_id: null, amount_rappen: -1_000, note: null },
              { category_id: null, amount_rappen: -250, note: null },
            ],
          }),
        ],
        dry_run: true,
      });
      expect(dry.results.map((r) => [r.outcome, r.transaction_id])).toEqual([
        ['added', null],
        ['added', null],
      ]);
      expect(await footprint(db, user)).toEqual(before);
    });
  });

  it('validates like the real call', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const error = await addFails(
        db,
        user,
        { rows: [manualRow({ amount_rappen: 0 })], dry_run: true },
        SQLSTATE.invalidParameterValue,
      );
      expect(error.message).toBe('invalid_row');
    });
  });
});

describe('other users', () => {
  it('another user’s transactions are never merged with, reported or used to link', async () => {
    await withRollback(async (db) => {
      const { user: a } = await onboardedUser(db);
      const { user: b } = await onboardedUser(db);
      await add(db, b, { rows: [manualRow({ merchant: 'Coop' })] });
      await add(db, b, {
        rows: [statementRow({ raw_text: 'KAUF DENNER', external_id: 'same-id' })],
        import: CSV,
      });
      await make.fixedCost(db, b, {
        kind: 'other',
        amount_rappen: 9_900,
        merchant_hint: 'Kraftwerk',
      });
      const bBefore = await footprint(db, b);
      const result = await add(db, a, {
        rows: [
          statementRow({ raw_text: 'KAUF COOP' }),
          statementRow({ raw_text: 'KAUF DENNER', external_id: 'same-id' }),
          statementRow({ raw_text: 'KAUF DENNER', external_id: 'other-id' }),
          statementRow({ raw_text: 'KRAFTWERK', amount_rappen: -9_900 }),
        ],
        import: CSV,
      });
      expect(result.results.map((r) => [r.outcome, r.fixed_cost_id])).toEqual([
        ['added', null],
        ['added', null],
        ['added', null],
        ['added', null],
      ]);
      expect(await footprint(db, b)).toEqual(bBefore);
    });
  });
});

describe('a full year of statement rows', () => {
  it('imports 2000 rows in less than 10 seconds', async () => {
    await withRollback(async (db) => {
      const { user, ids } = await onboardedUser(db);
      for (const [index, pattern] of [
        'Veloplus',
        'Kiosk',
        'Brocki',
        'Tierarzt',
        'Coiffeur Anna',
      ].entries()) {
        await make.rule(db, user, ids.hobbies ?? '', { pattern, priority: index });
      }
      for (const [kind, amount, hint] of [
        ['rent', 185_000, 'Verwaltung Muster'],
        ['health_insurance', 42_000, null],
        ['phone_internet', 6_500, null],
        ['subscriptions', 1_590, null],
        ['other', 9_900, null],
      ] as const) {
        await make.fixedCost(db, user, { kind, amount_rappen: amount, merchant_hint: hint });
      }
      const merchants = [
        'KAUF COOP-4567 ZUERICH',
        'MIGROS M BAHNHOF',
        'SBB CFF FFS MOBILE',
        'DAUERAUFTRAG VERWALTUNG MUSTER AG',
        'LSV HELSANA VERSICHERUNGEN',
        'SWISSCOM (SCHWEIZ) AG',
        'NETFLIX.COM',
        'KIOSK BAHNHOF 0815',
        'LADEN MUSTER 4711',
        'GUTSCHRIFT ARBEITGEBER AG',
      ];
      const amounts = [
        -2_340, -4_500, -1_200, -185_000, -42_000, -6_500, -1_590, -650, -800, 520_000,
      ];
      const start = Date.UTC(2025, 9, 1);
      const rows = Array.from({ length: 2000 }, (_, i) =>
        statementRow({
          booked_on: new Date(start + Math.floor(i / 6) * 86_400_000).toISOString().slice(0, 10),
          raw_text: merchants[i % merchants.length],
          amount_rappen: (amounts[i % amounts.length] ?? -100) - (i % 7),
          mcc: i % 3 === 0 ? 5411 : null,
          external_id: `perf:${i}`,
        }),
      );
      // Some purchases were already entered by hand: they are merged.
      await add(db, user, {
        rows: Array.from({ length: 50 }, (_, i) =>
          manualRow({
            merchant: 'Coop',
            amount_rappen: -2_340 - ((i * 10) % 7),
            booked_at: `${new Date(start + Math.floor((i * 10) / 6) * 86_400_000).toISOString().slice(0, 10)}T10:00:00Z`,
          }),
        ),
      });
      const started = Date.now();
      const result = await add(db, user, { rows, import: CSV });
      const seconds = (Date.now() - started) / 1000;
      expect(result.results).toHaveLength(2000);
      const { added, merged, already_imported, possible_duplicate } = result.counts;
      expect(added + merged + already_imported + possible_duplicate).toBe(2000);
      expect(merged).toBeGreaterThan(0);
      expect(seconds).toBeLessThan(10);
    });
  }, 60_000);
});

describe('concurrent calls', () => {
  it('two connections adding the same statement row store it once (serialized per user)', async () => {
    const admin = new pg.Client({ connectionString: DATABASE_URL });
    await admin.connect();
    const userId = randomUUID();
    try {
      await admin.query(
        `insert into auth.users (id, email, aud, role)
         values ($1, $2, 'authenticated', 'authenticated')`,
        [userId, `${userId}@example.test`],
      );
      await onboard(admin, userId);
      const connections = [
        new pg.Client({ connectionString: DATABASE_URL }),
        new pg.Client({ connectionString: DATABASE_URL }),
      ];
      for (const client of connections) await client.connect();
      try {
        const [first, second] = connections as [pg.Client, pg.Client];
        for (const client of connections) {
          await client.query('begin');
          await asUser(client, userId);
        }
        const input = JSON.stringify({
          rows: [statementRow({ external_id: 'race-1' })],
          import: CSV,
        });
        const firstResult = await first.query<{ result: AddResult }>(ADD, [input]);
        const pid = (await second.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0]
          ?.pid;
        const secondPending = second.query<{ result: AddResult }>(ADD, [input]);
        for (let attempt = 0; attempt < 400; attempt += 1) {
          const { rows } = await admin.query<{ wait: string | null }>(
            'select wait_event_type as wait from pg_stat_activity where pid = $1',
            [pid],
          );
          if (rows[0]?.wait === 'Lock') break;
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        await first.query('commit');
        const secondResult = await secondPending;
        await second.query('commit');
        expect(firstResult.rows[0]?.result.results[0]?.outcome).toBe('added');
        expect(secondResult.rows[0]?.result.results[0]).toMatchObject({
          outcome: 'already_imported',
          transaction_id: firstResult.rows[0]?.result.results[0]?.transaction_id,
        });
        const { rows } = await admin.query<{ n: number }>(
          'select count(*)::int as n from public.transactions where user_id = $1',
          [userId],
        );
        expect(rows[0]?.n).toBe(1);
      } finally {
        for (const client of connections) await client.end();
      }
    } finally {
      await admin.query('delete from auth.users where id = $1', [userId]);
      await admin.end();
    }
  });
});
