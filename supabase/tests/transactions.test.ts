/**
 * The transaction RPCs after the pipeline (docs/API.md, "Transactions"): list_transactions and
 * get_transaction (TransactionItem, filters, search escaping, stable pagination), update_transaction
 * (categories, rules applied retroactively, fixed-cost links, texts, manual-only edits, soft
 * delete), set_transaction_splits, remove_import (undo an import) and export_my_data. Every RPC
 * only ever sees the caller's rows.
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
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
  publicTables,
  queryOne,
  queryRows,
  runDeferredChecks,
  withRollback,
} from './db';

type Split = { id: string; category_id: string | null; amount_rappen: number; note: string | null };

type TransactionItem = {
  id: string;
  amount_rappen: number;
  booked_at: string;
  merchant: string | null;
  raw_text: string | null;
  note: string | null;
  mcc: number | null;
  source: string;
  data_source_id: string | null;
  data_source_name: string | null;
  category_id: string | null;
  categorized_by: string;
  category_confidence: number | null;
  fixed_cost_id: string | null;
  original_amount_minor: number | null;
  original_currency: string | null;
  items: unknown;
  suggested_rule: { match_field: string; match_type: string; pattern: string } | null;
  splits: Split[];
  merged_sources: string[];
  needs_review: boolean;
  deleted_at: string | null;
  created_at: string;
};

type Page = { items: TransactionItem[]; next_cursor: { booked_at: string; id: string } | null };

type UpdateResult = {
  transaction: TransactionItem;
  rule_id: string | null;
  recategorized_count: number;
};

const CSV = { file_name: 'konto.csv', format: 'csv', bank: 'ubs' };

/** An onboarded user with default categories (as postgres); returns ids by key. */
async function onboardedUser(
  db: Db,
  timeZone = 'Europe/Zurich',
): Promise<{ user: string; ids: Record<string, string> }> {
  const user = await createUser(db);
  await onboard(db, user, { timezone: timeZone });
  const ids: Record<string, string> = {};
  for (const key of ['groceries', 'eating_out', 'clothes', 'hobbies']) {
    ids[key] = await make.category(db, user, { default_key: key, name: undefined });
  }
  return { user, ids };
}

async function call<T>(db: Db, userId: string, sql: string, params: unknown[]): Promise<T> {
  await asUser(db, userId);
  const row = await queryOne<{ result: T }>(db, sql, params);
  await asPostgres(db);
  return row.result;
}

const list = (db: Db, userId: string, filters: Row = {}) =>
  call<Page>(db, userId, 'select public.list_transactions($1::jsonb) as result', [
    JSON.stringify(filters),
  ]);

const getTransaction = (db: Db, userId: string, id: string) =>
  call<TransactionItem | null>(db, userId, 'select public.get_transaction($1) as result', [id]);

const update = (db: Db, userId: string, id: string, changes: Row) =>
  call<UpdateResult>(db, userId, 'select public.update_transaction($1, $2::jsonb) as result', [
    id,
    JSON.stringify(changes),
  ]);

const setSplits = (db: Db, userId: string, id: string, parts: unknown) =>
  call<TransactionItem>(
    db,
    userId,
    'select public.set_transaction_splits($1, $2::jsonb) as result',
    [id, JSON.stringify(parts)],
  );

const removeImport = (db: Db, userId: string, id: string) =>
  call<{ removed: number; restored: number }>(
    db,
    userId,
    'select public.remove_import($1) as result',
    [id],
  );

const exportData = (db: Db, userId: string) =>
  call<Record<string, unknown>>(db, userId, 'select public.export_my_data() as result', []);

async function addRows(db: Db, userId: string, input: Row) {
  return call<{
    data_source_id: string | null;
    results: Array<{ outcome: string; transaction_id: string | null }>;
  }>(db, userId, 'select public.add_transactions($1::jsonb) as result', [JSON.stringify(input)]);
}

/** Expects `sql` as `userId` to fail with 22023 and `message`; returns the error. */
async function rejects(db: Db, userId: string, sql: string, params: unknown[], message: string) {
  await asUser(db, userId);
  const error = await expectSqlError(db, SQLSTATE.invalidParameterValue, sql, params);
  await asPostgres(db);
  expect(error.message).toBe(message);
  return error;
}

const UPDATE = 'select public.update_transaction($1, $2::jsonb)';
const SPLITS = 'select public.set_transaction_splits($1, $2::jsonb)';
const LIST = 'select public.list_transactions($1::jsonb)';

let counter = 0;
function statementRow(values: Row = {}): Row {
  counter += 1;
  return {
    amount_rappen: -1_250,
    booked_on: '2026-10-03',
    merchant: null,
    raw_text: 'KAUF LADEN',
    mcc: null,
    source: 'statement_import',
    external_id: `t:${counter}`,
    ...values,
  };
}

function ids(page: Page): string[] {
  return page.items.map((item) => item.id);
}

// ---------------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------------

describe('list_transactions() and get_transaction()', () => {
  it('return the full TransactionItem', async () => {
    await withRollback(async (db) => {
      const { user, ids: cat } = await onboardedUser(db);
      const imported = await addRows(db, user, {
        rows: [
          statementRow({
            amount_rappen: -10_000,
            booked_on: '2026-10-03',
            booked_time: '08:15:30',
            raw_text: 'KAUF MIGROS',
            mcc: 5411,
            original_amount_minor: -10_500,
            original_currency: 'EUR',
            items: [{ description: 'Brot', amount_rappen: -500, quantity: 2 }],
            note: 'Einkauf',
          }),
        ],
        import: CSV,
      });
      const id = imported.results[0]?.transaction_id ?? '';
      await addRows(db, user, {
        rows: [
          {
            amount_rappen: -10_000,
            booked_at: '2026-10-03T07:00:00Z',
            merchant: 'Migros',
            raw_text: null,
            mcc: null,
            source: 'manual',
            external_id: null,
          },
        ],
      });
      const item = await setSplits(db, user, id, [
        { category_id: cat.groceries, amount_rappen: -7_000, note: 'Essen' },
        { category_id: cat.hobbies, amount_rappen: -3_000, note: null },
      ]);
      await runDeferredChecks(db);
      // created_at as JSON renders it in UTC (the RPCs pin their time zone to UTC).
      await db.query(`set local timezone to 'UTC'`);
      const created = await queryOne<{ created_at: string; data_source_id: string }>(
        db,
        `select to_jsonb(created_at) #>> '{}' as created_at, data_source_id::text
           from public.transactions where id = $1`,
        [id],
      );
      await db.query(`set local timezone to 'Asia/Tokyo'`);
      const expected: TransactionItem = {
        id,
        amount_rappen: -10_000,
        booked_at: '2026-10-03T06:15:30+00:00',
        merchant: 'Migros',
        raw_text: 'KAUF MIGROS',
        note: 'Einkauf',
        mcc: 5411,
        source: 'statement_import',
        data_source_id: created.data_source_id,
        data_source_name: 'konto.csv',
        category_id: null,
        categorized_by: 'user',
        category_confidence: 100,
        fixed_cost_id: null,
        original_amount_minor: -10_500,
        original_currency: 'EUR',
        items: [{ description: 'Brot', amount_rappen: -500, quantity: 2 }],
        suggested_rule: { match_field: 'merchant', match_type: 'contains', pattern: 'migros' },
        splits: [
          {
            id: expect.any(String) as string,
            category_id: cat.groceries ?? null,
            amount_rappen: -7_000,
            note: 'Essen',
          },
          {
            id: expect.any(String) as string,
            category_id: cat.hobbies ?? null,
            amount_rappen: -3_000,
            note: null,
          },
        ],
        merged_sources: ['manual'],
        needs_review: false,
        deleted_at: null,
        created_at: created.created_at,
      };
      expect(item).toEqual(expected);
      expect(await getTransaction(db, user, id)).toEqual(expected);
      expect((await list(db, user)).items).toEqual([expected]);
    });
  });

  it('newest first by booking time; deleted and merged rows are left out', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const older = await make.transaction(db, user, { booked_at: '2026-10-01T10:00:00Z' });
      const newer = await make.transaction(db, user, { booked_at: '2026-10-02T10:00:00Z' });
      await make.transaction(db, user, {
        booked_at: '2026-10-03T10:00:00Z',
        deleted_at: '2026-10-04T00:00:00Z',
      });
      await make.transaction(db, user, {
        booked_at: '2026-10-03T10:00:00Z',
        merged_into_id: older,
        source: 'statement_import',
      });
      expect(ids(await list(db, user))).toEqual([newer, older]);
    });
  });

  it('get_transaction: deleted rows with deleted_at; merged, unknown and other users’ ids are null', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const { user: other } = await onboardedUser(db);
      const survivor = await make.transaction(db, user);
      const merged = await make.transaction(db, user, {
        merged_into_id: survivor,
        source: 'statement_import',
      });
      const deleted = await make.transaction(db, user, { deleted_at: '2026-10-04T08:00:00Z' });
      const ofOther = await make.transaction(db, other);
      expect(await getTransaction(db, user, deleted)).toMatchObject({
        id: deleted,
        deleted_at: '2026-10-04T08:00:00+00:00',
        needs_review: false,
      });
      expect(await getTransaction(db, user, merged)).toBeNull();
      expect(await getTransaction(db, user, randomUUID())).toBeNull();
      expect(await getTransaction(db, user, ofOther)).toBeNull();
      expect((await getTransaction(db, user, survivor))?.merged_sources).toEqual([
        'statement_import',
      ]);
    });
  });

  it('never return another user’s transactions', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const { user: other, ids: otherCats } = await onboardedUser(db);
      await make.transaction(db, other, { merchant: 'Migros', category_id: otherCats.groceries });
      const mine = await make.transaction(db, user, { merchant: 'Migros' });
      expect(ids(await list(db, user))).toEqual([mine]);
      expect(ids(await list(db, user, { search: 'migros' }))).toEqual([mine]);
      expect(ids(await list(db, user, { category_ids: [otherCats.groceries] }))).toEqual([]);
    });
  });

  it('need a signed-in user (42501); anon cannot call them', async () => {
    await withRollback(async (db) => {
      await asAuthenticatedWithoutUser(db);
      for (const sql of [
        `select public.list_transactions('{}')`,
        'select public.get_transaction(gen_random_uuid())',
      ]) {
        const error = await expectSqlError(db, SQLSTATE.insufficientPrivilege, sql);
        expect(error.message).toBe('not signed in');
      }
      await asAnon(db);
      await expectSqlError(
        db,
        SQLSTATE.insufficientPrivilege,
        `select public.list_transactions('{}')`,
      );
    });
  });
});

describe('list_transactions() filters', () => {
  it('search: merchant, note or statement text, case-insensitive', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const byMerchant = await make.transaction(db, user, {
        merchant: 'Bäckerei Hug',
        booked_at: '2026-10-03T10:00:00Z',
      });
      const byNote = await make.transaction(db, user, {
        merchant: 'X',
        note: 'Zopf für Sonntag',
        booked_at: '2026-10-02T10:00:00Z',
      });
      const byRaw = await make.transaction(db, user, {
        merchant: null,
        raw_text: 'KAUF ZOPFMAN',
        booked_at: '2026-10-01T10:00:00Z',
      });
      await make.transaction(db, user, { merchant: 'Migros' });
      expect(ids(await list(db, user, { search: 'ZOPF' }))).toEqual([byNote, byRaw]);
      expect(ids(await list(db, user, { search: 'bäckerei' }))).toEqual([byMerchant]);
      expect(ids(await list(db, user, { search: '  hug ' }))).toEqual([byMerchant]);
      expect(ids(await list(db, user, { search: '   ' }))).toHaveLength(4);
      expect(ids(await list(db, user, { search: '' }))).toHaveLength(4);
    });
  });

  it('search: % and _ and \\ match themselves', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const percent = await make.transaction(db, user, {
        merchant: '100% Bio',
        booked_at: '2026-10-05T10:00:00Z',
      });
      const underscore = await make.transaction(db, user, {
        merchant: 'A_B Shop',
        booked_at: '2026-10-04T10:00:00Z',
      });
      const backslash = await make.transaction(db, user, {
        merchant: 'C\\D',
        booked_at: '2026-10-03T10:00:00Z',
      });
      await make.transaction(db, user, {
        merchant: 'AxB Shop 100 Bio',
        booked_at: '2026-10-02T10:00:00Z',
      });
      expect(ids(await list(db, user, { search: '%' }))).toEqual([percent]);
      expect(ids(await list(db, user, { search: '0% B' }))).toEqual([percent]);
      expect(ids(await list(db, user, { search: '_' }))).toEqual([underscore]);
      expect(ids(await list(db, user, { search: 'A_B' }))).toEqual([underscore]);
      expect(ids(await list(db, user, { search: '\\' }))).toEqual([backslash]);
      expect(ids(await list(db, user, { search: 'C\\D' }))).toEqual([backslash]);
    });
  });

  it('search ignores accents, case, ae/oe/ue spellings and apostrophes (QA L5)', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const cafe = await make.transaction(db, user, {
        merchant: 'Zürich Café',
        booked_at: '2026-10-05T10:00:00Z',
      });
      const caps = await make.transaction(db, user, {
        merchant: 'ZÜRICH CAFÉ',
        booked_at: '2026-10-04T10:00:00Z',
      });
      const plain = await make.transaction(db, user, {
        merchant: 'Zurich Cafe',
        booked_at: '2026-10-03T10:00:00Z',
      });
      const baker = await make.transaction(db, user, {
        merchant: 'Shop',
        raw_text: 'KAUF BAECKEREI HUG',
        booked_at: '2026-10-02T10:00:00Z',
      });
      const noted = await make.transaction(db, user, {
        merchant: 'Kiosk',
        note: "McDonald's mit Anna",
        booked_at: '2026-10-01T10:00:00Z',
      });
      const all = [cafe, caps, plain];
      for (const term of ['zürich', 'ZÜRICH', 'zurich', 'ZUERICH', 'café', 'CAFE', 'zur']) {
        expect(ids(await list(db, user, { search: term }))).toEqual(all);
      }
      expect(ids(await list(db, user, { search: 'Bäckerei' }))).toEqual([baker]);
      expect(ids(await list(db, user, { search: 'mcdonalds' }))).toEqual([noted]);
      expect(ids(await list(db, user, { search: '--' }))).toEqual([]);
    });
  });

  it('category_ids (a split matches by any part) and uncategorized, combined with OR', async () => {
    await withRollback(async (db) => {
      const { user, ids: cat } = await onboardedUser(db);
      const rent = await make.fixedCost(db, user);
      const at = (day: number) => `2026-10-${String(day).padStart(2, '0')}T10:00:00Z`;
      const groceries = await make.transaction(db, user, {
        category_id: cat.groceries,
        booked_at: at(9),
      });
      const clothes = await make.transaction(db, user, {
        category_id: cat.clothes,
        booked_at: at(8),
      });
      const none = await make.transaction(db, user, { booked_at: at(7) });
      const fixed = await make.transaction(db, user, { fixed_cost_id: rent, booked_at: at(6) });
      const split = await make.transaction(db, user, { amount_rappen: -1_000, booked_at: at(5) });
      await make.split(db, user, split, -600, { category_id: cat.groceries });
      await make.split(db, user, split, -400);
      const splitCategorized = await make.transaction(db, user, {
        amount_rappen: -1_000,
        booked_at: at(4),
      });
      await make.split(db, user, splitCategorized, -500, { category_id: cat.hobbies });
      await make.split(db, user, splitCategorized, -500, { category_id: cat.clothes });
      await runDeferredChecks(db);
      expect(ids(await list(db, user, { category_ids: [cat.groceries] }))).toEqual([
        groceries,
        split,
      ]);
      expect(ids(await list(db, user, { category_ids: [cat.clothes, cat.hobbies] }))).toEqual([
        clothes,
        splitCategorized,
      ]);
      expect(ids(await list(db, user, { uncategorized: true }))).toEqual([none, split]);
      expect(
        ids(await list(db, user, { category_ids: [cat.clothes], uncategorized: true })),
      ).toEqual([clothes, none, split, splitCategorized]);
      expect(ids(await list(db, user, { uncategorized: false, category_ids: [] }))).toEqual([
        groceries,
        clothes,
        none,
        fixed,
        split,
        splitCategorized,
      ]);
    });
  });

  it('sources and needs_review', async () => {
    await withRollback(async (db) => {
      const { user, ids: cat } = await onboardedUser(db);
      const manual = await make.transaction(db, user, { booked_at: '2026-10-03T10:00:00Z' });
      const imported = await make.transaction(db, user, {
        source: 'statement_import',
        booked_at: '2026-10-02T10:00:00Z',
        category_id: cat.groceries,
        categorized_by: 'merchant_list',
        category_confidence: 90,
      });
      const bank = await make.transaction(db, user, {
        source: 'bank',
        booked_at: '2026-10-01T10:00:00Z',
      });
      expect(ids(await list(db, user, { sources: ['statement_import', 'bank'] }))).toEqual([
        imported,
        bank,
      ]);
      expect(ids(await list(db, user, { needs_review: true }))).toEqual([manual, bank]);
      expect(ids(await list(db, user, { needs_review: false }))).toEqual([imported]);
      expect(ids(await list(db, user, { sources: ['manual'], needs_review: true }))).toEqual([
        manual,
      ]);
    });
  });

  it('from / to are local dates in the user’s zone, both inclusive (Europe/Zurich)', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const t = (bookedAt: string) => make.transaction(db, user, { booked_at: bookedAt });
      await t('2026-09-30T21:59:59Z'); // 23:59:59 on 30 Sep in Zurich
      const first = await t('2026-09-30T22:00:00Z'); // 00:00 on 1 Oct
      const last = await t('2026-10-02T21:59:59Z'); // 23:59:59 on 2 Oct
      await t('2026-10-02T22:00:00Z'); // 3 Oct
      expect(ids(await list(db, user, { from: '2026-10-01', to: '2026-10-02' }))).toEqual([
        last,
        first,
      ]);
      expect(ids(await list(db, user, { from: '2026-10-02', to: '2026-10-01' }))).toEqual([]);
    });
  });

  it('from / to use the profile’s zone (America/New_York)', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db, 'America/New_York');
      const t = (bookedAt: string) => make.transaction(db, user, { booked_at: bookedAt });
      const lateEvening = await t('2026-10-02T03:00:00Z'); // 23:00 on 1 Oct in New York
      await t('2026-10-02T05:00:00Z'); // 01:00 on 2 Oct
      expect(ids(await list(db, user, { to: '2026-10-01' }))).toEqual([lateEvening]);
      expect(ids(await list(db, user, { from: '2026-10-02' }))).toHaveLength(1);
    });
  });

  it.each([
    ['an unknown filter', { category: 'x' }],
    ['a search that is not text', { search: 5 }],
    ['a search over 200 characters', { search: 's'.repeat(201) }],
    ['category_ids that are not ids', { category_ids: ['groceries'] }],
    ['category_ids that are not a list', { category_ids: 'x' }],
    ['uncategorized that is not a boolean', { uncategorized: 'yes' }],
    ['an unknown source', { sources: ['cash'] }],
    ['more than 8 sources', { sources: Array.from({ length: 9 }, () => 'manual') }],
    [
      'more than 100 category_ids',
      { category_ids: Array.from({ length: 101 }, () => randomUUID()) },
    ],
    ['a date that is no date', { from: '2026-02-30' }],
    ['a date in another format', { to: '01.10.2026' }],
    ['needs_review that is not a boolean', { needs_review: 1 }],
    ['limit 0', { limit: 0 }],
    ['limit 101', { limit: 101 }],
    ['limit 2.5', { limit: 2.5 }],
    ['a cursor that is text', { cursor: `2026-10-01T00:00:00.000000Z|${randomUUID()}` }],
    [
      'a cursor with an invalid time',
      { cursor: { booked_at: '2026-13-01T00:00:00Z', id: randomUUID() } },
    ],
    ['a cursor without offset', { cursor: { booked_at: '2026-10-01T00:00:00', id: randomUUID() } }],
    ['a cursor without id', { cursor: { booked_at: '2026-10-01T00:00:00Z' } }],
    ['a cursor with an invalid id', { cursor: { booked_at: '2026-10-01T00:00:00Z', id: '42' } }],
    [
      'a cursor with another key',
      { cursor: { booked_at: '2026-10-01T00:00:00Z', id: randomUUID(), page: 2 } },
    ],
  ])('%s → 22023 invalid_input', async (_label, filters) => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      await rejects(db, user, LIST, [JSON.stringify(filters)], 'invalid_input');
    });
  });
});

describe('list_transactions() pages', () => {
  it('default to 50 items; limit 1-100', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      for (let i = 0; i < 51; i += 1) {
        await make.transaction(db, user, {
          booked_at: `2026-09-01T10:${String(i).padStart(2, '0')}:00Z`,
        });
      }
      const page = await list(db, user);
      expect(page.items).toHaveLength(50);
      // The keyset of the last item: its booking time in UTC and its id.
      expect(page.next_cursor).toEqual({
        booked_at: page.items[49]?.booked_at,
        id: page.items[49]?.id,
      });
      expect((await list(db, user, { limit: 100 })).items).toHaveLength(51);
      expect((await list(db, user, { limit: 100 })).next_cursor).toBeNull();
    });
  });

  it('are stable: each row once, ties in time ordered by id, new rows do not shift later pages', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const created: Array<{ id: string; at: string }> = [];
      for (let i = 0; i < 7; i += 1) {
        // Three rows share one instant: the id decides between them.
        const at = i < 3 ? '2026-10-05T10:00:00.123456Z' : `2026-10-0${i - 2}T10:00:00Z`;
        created.push({ id: await make.transaction(db, user, { booked_at: at }), at });
      }
      const expectedOrder = [...created]
        .sort((a, b) => (a.at === b.at ? (a.id < b.id ? 1 : -1) : a.at < b.at ? 1 : -1))
        .map((row) => row.id);

      const first = await list(db, user, { limit: 3 });
      // A new transaction arrives between two pages (newer than everything).
      await make.transaction(db, user, { booked_at: '2026-10-09T10:00:00Z' });
      const second = await list(db, user, { limit: 3, cursor: first.next_cursor });
      const third = await list(db, user, { limit: 3, cursor: second.next_cursor });
      expect([...ids(first), ...ids(second), ...ids(third)]).toEqual(expectedOrder);
      expect(third.next_cursor).toBeNull();
    });
  });

  it('a cursor applies the same filters on the next page', async () => {
    await withRollback(async (db) => {
      const { user, ids: cat } = await onboardedUser(db);
      const rows: string[] = [];
      for (let day = 1; day <= 5; day += 1) {
        await make.transaction(db, user, { booked_at: `2026-10-0${day}T09:00:00Z` });
        rows.unshift(
          await make.transaction(db, user, {
            booked_at: `2026-10-0${day}T10:00:00Z`,
            category_id: cat.groceries,
          }),
        );
      }
      const first = await list(db, user, { category_ids: [cat.groceries], limit: 2 });
      const second = await list(db, user, {
        category_ids: [cat.groceries],
        limit: 2,
        cursor: first.next_cursor,
      });
      expect([...ids(first), ...ids(second)]).toEqual(rows.slice(0, 4));
    });
  });
});

// ---------------------------------------------------------------------------------------------
// Changing
// ---------------------------------------------------------------------------------------------

describe('update_transaction(): category', () => {
  it('the person’s choice: categorized_by user, confidence 100, and it ends a fixed-cost link', async () => {
    await withRollback(async (db) => {
      const { user, ids: cat } = await onboardedUser(db);
      const rent = await make.fixedCost(db, user);
      const id = await make.transaction(db, user, { fixed_cost_id: rent });
      const result = await update(db, user, id, { category_id: cat.clothes });
      expect(result).toEqual({
        transaction: expect.objectContaining({
          id,
          category_id: cat.clothes,
          categorized_by: 'user',
          category_confidence: 100,
          fixed_cost_id: null,
          needs_review: false,
        }),
        rule_id: null,
        recategorized_count: 0,
      });
    });
  });

  it('null means "no category", not asked again', async () => {
    await withRollback(async (db) => {
      const { user, ids: cat } = await onboardedUser(db);
      const id = await make.transaction(db, user, {
        category_id: cat.groceries,
        categorized_by: 'merchant_list',
        category_confidence: 60,
      });
      const result = await update(db, user, id, { category_id: null });
      expect(result.transaction).toMatchObject({
        category_id: null,
        categorized_by: 'user',
        needs_review: false,
      });
    });
  });

  it.each(['another user’s', 'an archived', 'an unknown'])(
    '%s category → category_not_found, nothing changes',
    async (which) => {
      await withRollback(async (db) => {
        const { user } = await onboardedUser(db);
        const { ids: otherCats } = await onboardedUser(db);
        const category =
          which === 'another user’s'
            ? otherCats.groceries
            : which === 'an archived'
              ? await make.category(db, user, { name: 'Alt', archived_at: '2026-01-01T00:00:00Z' })
              : randomUUID();
        const id = await make.transaction(db, user);
        await rejects(
          db,
          user,
          UPDATE,
          [id, JSON.stringify({ category_id: category })],
          'category_not_found',
        );
        expect((await getTransaction(db, user, id))?.category_id).toBeNull();
      });
    },
  );
});

describe('update_transaction(): rules ("Always do this for Manor?")', () => {
  it('creates a rule with top priority and applies it to every transaction not placed by the person', async () => {
    await withRollback(async (db) => {
      const { user, ids: cat } = await onboardedUser(db);
      const rent = await make.fixedCost(db, user);
      await make.rule(db, user, cat.groceries ?? '', { pattern: 'Migros', priority: 7 });
      const t = (values: Row) => make.transaction(db, user, { merchant: 'MANOR AG', ...values });
      const edited = await t({});
      const none = await t({});
      const guessed = await t({
        category_id: cat.groceries,
        categorized_by: 'merchant_list',
        category_confidence: 50,
      });
      const byMcc = await t({
        category_id: cat.groceries,
        categorized_by: 'mcc',
        category_confidence: 40,
      });
      const byRule = await t({
        category_id: cat.groceries,
        categorized_by: 'rule',
        category_confidence: 100,
      });
      const viaStatement = await t({ merchant: null, raw_text: 'KAUF MANOR ZUERICH' });
      const alreadyThere = await t({
        category_id: cat.clothes,
        categorized_by: 'rule',
        category_confidence: 100,
      });
      const byPerson = await t({
        category_id: cat.hobbies,
        categorized_by: 'user',
        category_confidence: 100,
      });
      const deleted = await t({ deleted_at: '2026-10-04T00:00:00Z' });
      const fixed = await t({ fixed_cost_id: rent });
      const merged = await t({ merged_into_id: none, source: 'statement_import' });
      const split = await t({ amount_rappen: -1_000 });
      await make.split(db, user, split, -500);
      await make.split(db, user, split, -500);
      const elsewhere = await t({ merchant: 'Manorama' });

      const result = await update(db, user, edited, {
        category_id: cat.clothes,
        rule: { match_field: 'merchant', match_type: 'contains', pattern: 'Manor' },
      });
      expect(result.recategorized_count).toBe(5);
      expect(result.transaction).toMatchObject({
        id: edited,
        category_id: cat.clothes,
        categorized_by: 'user',
      });
      const rule = await queryOne<Row>(
        db,
        `select id::text, match_field, match_type, pattern, category_id::text, priority
           from public.categorization_rules where user_id = $1 and pattern = 'Manor'`,
        [user],
      );
      expect(rule).toEqual({
        id: result.rule_id,
        match_field: 'merchant',
        match_type: 'contains',
        pattern: 'Manor',
        category_id: cat.clothes,
        priority: 8,
      });
      const state = await queryRows<{
        id: string;
        category_id: string | null;
        categorized_by: string;
      }>(
        db,
        `select id::text, category_id::text, categorized_by from public.transactions where user_id = $1`,
        [user],
      );
      const byId = Object.fromEntries(
        state.map((row) => [row.id, [row.category_id, row.categorized_by]]),
      );
      for (const id of [none, guessed, byMcc, byRule, viaStatement]) {
        expect(byId[id]).toEqual([cat.clothes, 'rule']);
      }
      expect(byId[alreadyThere]).toEqual([cat.clothes, 'rule']);
      expect(byId[byPerson]).toEqual([cat.hobbies, 'user']);
      for (const id of [deleted, fixed, merged, split, elsewhere]) {
        expect(byId[id]).toEqual([null, 'none']);
      }
      await runDeferredChecks(db);
    });
  });

  it('re-targets the existing rule with the same field, type and pattern (case and spaces ignored)', async () => {
    await withRollback(async (db) => {
      const { user, ids: cat } = await onboardedUser(db);
      const first = await make.transaction(db, user, { merchant: 'Manor' });
      const second = await make.transaction(db, user, { merchant: 'Manor' });
      const created = await update(db, user, first, {
        category_id: cat.clothes,
        rule: { match_field: 'merchant', match_type: 'contains', pattern: 'Manor' },
      });
      await make.rule(db, user, cat.hobbies ?? '', { pattern: 'Other', priority: 50 });
      const retargeted = await update(db, user, second, {
        category_id: cat.groceries,
        rule: { match_field: 'merchant', match_type: 'contains', pattern: '  MANOR ' },
      });
      expect(retargeted.rule_id).toBe(created.rule_id);
      expect(retargeted.recategorized_count).toBe(0); // the first one was placed by the person
      const rules = await queryRows<Row>(
        db,
        `select category_id::text, priority from public.categorization_rules
          where user_id = $1 and lower(btrim(pattern)) = 'manor'`,
        [user],
      );
      expect(rules).toEqual([{ category_id: cat.groceries, priority: 51 }]);
    });
  });

  it('a raw_text rule and an equals rule apply to matching rows only', async () => {
    await withRollback(async (db) => {
      const { user, ids: cat } = await onboardedUser(db);
      const edited = await make.transaction(db, user, {
        merchant: null,
        raw_text: 'DAUERAUFTRAG VERMIETER',
      });
      const same = await make.transaction(db, user, {
        merchant: 'Vermieter',
        raw_text: 'DAUERAUFTRAG VERMIETER 10',
      });
      const merchantOnly = await make.transaction(db, user, {
        merchant: 'Dauerauftrag',
        raw_text: null,
      });
      const raw = await update(db, user, edited, {
        category_id: cat.hobbies,
        rule: {
          match_field: 'raw_text',
          match_type: 'contains',
          pattern: 'Dauerauftrag Vermieter',
        },
      });
      expect(raw.recategorized_count).toBe(1);
      expect((await getTransaction(db, user, same))?.category_id).toBe(cat.hobbies);
      expect((await getTransaction(db, user, merchantOnly))?.category_id).toBeNull();

      const exact = await make.transaction(db, user, { merchant: 'Coop' });
      const longer = await make.transaction(db, user, { merchant: 'Coop Pronto' });
      const equalsKey = await make.transaction(db, user, { merchant: 'COOP AG' });
      const equals = await update(db, user, exact, {
        category_id: cat.groceries,
        rule: { match_field: 'merchant', match_type: 'equals', pattern: 'coop' },
      });
      expect(equals.recategorized_count).toBe(1);
      expect((await getTransaction(db, user, equalsKey))?.category_id).toBe(cat.groceries);
      expect((await getTransaction(db, user, longer))?.category_id).toBeNull();
    });
  });

  it('later imports use the new rule first', async () => {
    await withRollback(async (db) => {
      const { user, ids: cat } = await onboardedUser(db);
      const id = await make.transaction(db, user, { merchant: 'Migros' });
      await update(db, user, id, {
        category_id: cat.hobbies,
        rule: { match_field: 'merchant', match_type: 'contains', pattern: 'Migros' },
      });
      const added = await addRows(db, user, {
        rows: [statementRow({ raw_text: 'KAUF MIGROS M', mcc: 5411, amount_rappen: -4_500 })],
        import: CSV,
      });
      expect(added.results[0]).toMatchObject({
        outcome: 'added',
        category_id: cat.hobbies,
        categorized_by: 'rule',
      });
    });
  });

  it.each([
    [
      'without category_id',
      { rule: { match_field: 'merchant', match_type: 'contains', pattern: 'X' } },
    ],
    [
      'with category_id null',
      {
        category_id: null,
        rule: { match_field: 'merchant', match_type: 'contains', pattern: 'X' },
      },
    ],
  ])('a rule %s → rule_needs_category', async (_label, changes) => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const id = await make.transaction(db, user);
      await rejects(db, user, UPDATE, [id, JSON.stringify(changes)], 'rule_needs_category');
    });
  });

  it.each([
    ['not an object', 'Manor'],
    ['an mcc rule', { match_field: 'mcc', match_type: 'equals', pattern: '5411' }],
    [
      'an unknown match type',
      { match_field: 'merchant', match_type: 'starts_with', pattern: 'Manor' },
    ],
    ['an empty pattern', { match_field: 'merchant', match_type: 'contains', pattern: ' ' }],
    [
      'a pattern without words',
      { match_field: 'merchant', match_type: 'contains', pattern: '1234 --' },
    ],
    [
      'a pattern over 200 characters',
      { match_field: 'merchant', match_type: 'contains', pattern: 'p'.repeat(201) },
    ],
    [
      'an unknown key',
      { match_field: 'merchant', match_type: 'contains', pattern: 'Manor', priority: 99 },
    ],
  ])('a rule that is %s → invalid_input', async (_label, rule) => {
    await withRollback(async (db) => {
      const { user, ids: cat } = await onboardedUser(db);
      const id = await make.transaction(db, user);
      await rejects(
        db,
        user,
        UPDATE,
        [id, JSON.stringify({ category_id: cat.groceries, rule })],
        'invalid_input',
      );
    });
  });
});

describe('update_transaction(): fixed costs', () => {
  it('links one of the person’s fixed costs, clears the category and teaches the merchant', async () => {
    await withRollback(async (db) => {
      const { user, ids: cat } = await onboardedUser(db);
      const rent = await make.fixedCost(db, user, { merchant_hint: null });
      const id = await make.transaction(db, user, {
        merchant: 'Verwaltung Muster AG',
        category_id: cat.groceries,
        categorized_by: 'mcc',
        category_confidence: 40,
      });
      const result = await update(db, user, id, { fixed_cost_id: rent });
      expect(result.transaction).toMatchObject({
        fixed_cost_id: rent,
        category_id: null,
        needs_review: false,
      });
      const hint = await queryOne<{ hint: string }>(
        db,
        'select merchant_hint as hint from public.fixed_costs where id = $1',
        [rent],
      );
      // The hint words of the merchant, at most three (internal.fixed_cost_hint).
      expect(hint.hint).toBe('verwaltung muster');
    });
  });

  it('keeps a hint the fixed cost has; null removes the link and the row is asked about again', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const rent = await make.fixedCost(db, user, { merchant_hint: 'Vermieter' });
      const id = await make.transaction(db, user, { merchant: 'Anderer Name' });
      await update(db, user, id, { fixed_cost_id: rent });
      const unlinked = await update(db, user, id, { fixed_cost_id: null });
      expect(unlinked.transaction).toMatchObject({
        fixed_cost_id: null,
        categorized_by: 'none',
        needs_review: true,
      });
      const hint = await queryOne<{ hint: string }>(
        db,
        'select merchant_hint as hint from public.fixed_costs where id = $1',
        [rent],
      );
      expect(hint.hint).toBe('Vermieter');
    });
  });

  it('another user’s fixed cost → fixed_cost_not_found; both category and fixed cost → invalid_input', async () => {
    await withRollback(async (db) => {
      const { user, ids: cat } = await onboardedUser(db);
      const { user: other } = await onboardedUser(db);
      const theirs = await make.fixedCost(db, other);
      const mine = await make.fixedCost(db, user);
      const id = await make.transaction(db, user);
      await rejects(
        db,
        user,
        UPDATE,
        [id, JSON.stringify({ fixed_cost_id: theirs })],
        'fixed_cost_not_found',
      );
      await rejects(
        db,
        user,
        UPDATE,
        [id, JSON.stringify({ fixed_cost_id: mine, category_id: cat.groceries })],
        'invalid_input',
      );
    });
  });
});

describe('update_transaction(): texts, amounts, time and deletion', () => {
  it('note and merchant: set, and an empty string clears', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const id = await make.transaction(db, user, {
        source: 'statement_import',
        merchant: 'KAUF X',
      });
      expect(
        (await update(db, user, id, { note: 'Geschenk für Tom', merchant: ' Laden X ' }))
          .transaction,
      ).toMatchObject({
        note: 'Geschenk für Tom',
        merchant: 'Laden X',
      });
      expect((await update(db, user, id, { note: '', merchant: '' })).transaction).toMatchObject({
        note: null,
        merchant: null,
      });
    });
  });

  it('a manual entry’s amount and time can change; any other source’s not (not_editable)', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const manual = await make.transaction(db, user);
      const imported = await make.transaction(db, user, { source: 'statement_import' });
      const changed = await update(db, user, manual, {
        amount_rappen: -4_200,
        booked_at: '2026-10-05T19:30:00+02:00',
      });
      expect(changed.transaction).toMatchObject({
        amount_rappen: -4_200,
        booked_at: '2026-10-05T17:30:00+00:00',
      });
      for (const changes of [{ amount_rappen: -1 }, { booked_at: '2026-10-05T19:30:00Z' }]) {
        await rejects(db, user, UPDATE, [imported, JSON.stringify(changes)], 'not_editable');
      }
    });
  });

  it('deleted: true deletes softly (the time stays), false restores', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const id = await make.transaction(db, user);
      const deleted = await update(db, user, id, { deleted: true });
      expect(deleted.transaction.deleted_at).toEqual(expect.any(String));
      await db.query(
        `update public.transactions set deleted_at = '2026-10-01T00:00:00Z' where id = $1`,
        [id],
      );
      expect((await update(db, user, id, { deleted: true })).transaction.deleted_at).toBe(
        '2026-10-01T00:00:00+00:00',
      );
      expect(ids(await list(db, user))).toEqual([]);
      expect((await update(db, user, id, { deleted: false })).transaction.deleted_at).toBeNull();
      expect(ids(await list(db, user))).toEqual([id]);
    });
  });

  it.each([
    ['an unknown key', { amount: -1 }],
    ['not an object', [1]],
    ['a category that is not an id', { category_id: 'groceries' }],
    ['a fixed cost that is not an id', { fixed_cost_id: 7 }],
    ['a note over 500 characters', { note: 'n'.repeat(501) }],
    ['a note that is not text', { note: 5 }],
    ['a merchant over 200 characters', { merchant: 'm'.repeat(201) }],
    ['an amount of 0', { amount_rappen: 0 }],
    ['an amount in francs', { amount_rappen: 12.5 }],
    ['an amount of null', { amount_rappen: null }],
    ['a time without offset', { booked_at: '2026-10-05T19:30:00' }],
    ['deleted that is not a boolean', { deleted: 'yes' }],
  ])('%s → invalid_input', async (_label, changes) => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const id = await make.transaction(db, user);
      await rejects(db, user, UPDATE, [id, JSON.stringify(changes)], 'invalid_input');
    });
  });

  it('a split transaction keeps its parts: category, fixed cost and amount → transaction_is_split', async () => {
    await withRollback(async (db) => {
      const { user, ids: cat } = await onboardedUser(db);
      const rent = await make.fixedCost(db, user);
      const id = await make.transaction(db, user, { amount_rappen: -1_000 });
      await make.split(db, user, id, -600);
      await make.split(db, user, id, -400);
      for (const changes of [
        { category_id: cat.groceries },
        { category_id: null },
        { fixed_cost_id: rent },
        { amount_rappen: -2_000 },
      ]) {
        await rejects(db, user, UPDATE, [id, JSON.stringify(changes)], 'transaction_is_split');
      }
      // Everything else is fine.
      expect(
        (await update(db, user, id, { note: 'Teilen', amount_rappen: -1_000 })).transaction,
      ).toMatchObject({
        note: 'Teilen',
      });
      await runDeferredChecks(db);
    });
  });

  it('another user’s, a merged and an unknown transaction → transaction_not_found', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const { user: other } = await onboardedUser(db);
      const theirs = await make.transaction(db, other, { note: 'theirs' });
      const survivor = await make.transaction(db, user);
      const merged = await make.transaction(db, user, {
        merged_into_id: survivor,
        source: 'statement_import',
      });
      for (const id of [theirs, merged, randomUUID()]) {
        await rejects(
          db,
          user,
          UPDATE,
          [id, JSON.stringify({ note: 'mine now' })],
          'transaction_not_found',
        );
        await rejects(db, user, SPLITS, [id, '[]'], 'transaction_not_found');
      }
      const row = await queryOne<{ note: string }>(
        db,
        'select note from public.transactions where id = $1',
        [theirs],
      );
      expect(row.note).toBe('theirs');
    });
  });

  it('needs a signed-in user (42501)', async () => {
    await withRollback(async (db) => {
      await asAuthenticatedWithoutUser(db);
      const error = await expectSqlError(db, SQLSTATE.insufficientPrivilege, UPDATE, [
        randomUUID(),
        '{}',
      ]);
      expect(error.message).toBe('not signed in');
    });
  });
});

describe('set_transaction_splits()', () => {
  it('replaces the parts and clears the category and fixed-cost link', async () => {
    await withRollback(async (db) => {
      const { user, ids: cat } = await onboardedUser(db);
      const rent = await make.fixedCost(db, user);
      const id = await make.transaction(db, user, {
        amount_rappen: -10_000,
        fixed_cost_id: rent,
        category_id: cat.groceries,
      });
      const first = await setSplits(db, user, id, [
        { category_id: cat.groceries, amount_rappen: -6_000, note: 'Essen' },
        { category_id: cat.hobbies, amount_rappen: -4_000, note: '' },
      ]);
      expect(first).toMatchObject({
        category_id: null,
        fixed_cost_id: null,
        categorized_by: 'user',
        needs_review: false,
        splits: [
          { category_id: cat.groceries, amount_rappen: -6_000, note: 'Essen' },
          { category_id: cat.hobbies, amount_rappen: -4_000, note: null },
        ],
      });
      await runDeferredChecks(db);
      const second = await setSplits(db, user, id, [
        { category_id: null, amount_rappen: -1_000, note: null },
        { category_id: cat.clothes, amount_rappen: -2_000, note: null },
        { category_id: cat.clothes, amount_rappen: -7_000, note: null },
      ]);
      expect(second.splits.map((part) => part.amount_rappen)).toEqual([-7_000, -2_000, -1_000]);
      await runDeferredChecks(db);
      const count = await queryOne<{ n: number }>(
        db,
        'select count(*)::int as n from public.transaction_splits where transaction_id = $1',
        [id],
      );
      expect(count.n).toBe(3);
    });
  });

  it('[] removes the split; the transaction is then asked about', async () => {
    await withRollback(async (db) => {
      const { user, ids: cat } = await onboardedUser(db);
      const id = await make.transaction(db, user, { amount_rappen: -1_000 });
      await setSplits(db, user, id, [
        { category_id: cat.groceries, amount_rappen: -500, note: null },
        { category_id: cat.hobbies, amount_rappen: -500, note: null },
      ]);
      const removed = await setSplits(db, user, id, []);
      expect(removed).toMatchObject({ splits: [], categorized_by: 'none', needs_review: true });
      await runDeferredChecks(db);
      // Removing parts that do not exist changes nothing.
      const categorized = await make.transaction(db, user, {
        category_id: cat.groceries,
        categorized_by: 'user',
        category_confidence: 100,
      });
      expect(await setSplits(db, user, categorized, [])).toMatchObject({ categorized_by: 'user' });
    });
  });

  it.each([
    ['not a list', { a: 1 }],
    ['one part', [{ category_id: null, amount_rappen: -1_000, note: null }]],
    [
      '51 parts',
      Array.from({ length: 51 }, () => ({ category_id: null, amount_rappen: -1, note: null })),
    ],
    [
      'a part with the wrong sign',
      [
        { category_id: null, amount_rappen: -1_100, note: null },
        { category_id: null, amount_rappen: 100, note: null },
      ],
    ],
    [
      'parts that do not add up',
      [
        { category_id: null, amount_rappen: -500, note: null },
        { category_id: null, amount_rappen: -400, note: null },
      ],
    ],
    [
      'a part with an unknown key',
      [
        { category_id: null, amount_rappen: -500, note: null, x: 1 },
        { category_id: null, amount_rappen: -500, note: null },
      ],
    ],
    [
      'a part note over 500 characters',
      [
        { category_id: null, amount_rappen: -500, note: 'n'.repeat(501) },
        { category_id: null, amount_rappen: -500, note: null },
      ],
    ],
    [
      'a part category that is not an id',
      [
        { category_id: 'x', amount_rappen: -500, note: null },
        { category_id: null, amount_rappen: -500, note: null },
      ],
    ],
  ])('%s → invalid_splits, nothing changes', async (_label, parts) => {
    await withRollback(async (db) => {
      const { user, ids: cat } = await onboardedUser(db);
      const id = await make.transaction(db, user, {
        amount_rappen: -1_000,
        category_id: cat.groceries,
      });
      await rejects(db, user, SPLITS, [id, JSON.stringify(parts)], 'invalid_splits');
      expect(await getTransaction(db, user, id)).toMatchObject({
        category_id: cat.groceries,
        splits: [],
      });
    });
  });

  it('a part in another user’s or an archived category → category_not_found', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const { ids: otherCats } = await onboardedUser(db);
      const archived = await make.category(db, user, {
        name: 'Alt',
        archived_at: '2026-01-01T00:00:00Z',
      });
      const id = await make.transaction(db, user, { amount_rappen: -1_000 });
      for (const category of [otherCats.groceries, archived]) {
        await rejects(
          db,
          user,
          SPLITS,
          [
            id,
            JSON.stringify([
              { category_id: category, amount_rappen: -500, note: null },
              { category_id: null, amount_rappen: -500, note: null },
            ]),
          ],
          'category_not_found',
        );
      }
    });
  });
});

// ---------------------------------------------------------------------------------------------
// Imports and export
// ---------------------------------------------------------------------------------------------

describe('remove_import()', () => {
  it('undoes an import: its rows are deleted, merged rows come back, the source is revoked', async () => {
    await withRollback(async (db) => {
      const { user, ids: cat } = await onboardedUser(db);
      // Entered by hand before the import: merged into by the import (evidence of the import).
      const before = await addRows(db, user, {
        rows: [
          {
            amount_rappen: -2_340,
            booked_at: '2026-10-03T09:00:00Z',
            merchant: 'Coop',
            raw_text: null,
            mcc: null,
            source: 'manual',
            external_id: null,
          },
        ],
      });
      const imported = await addRows(db, user, {
        rows: [
          statementRow({ raw_text: 'KAUF COOP', amount_rappen: -2_340 }),
          statementRow({ raw_text: 'KAUF DENNER', amount_rappen: -1_500 }),
          statementRow({ raw_text: 'KAUF VOLG', amount_rappen: -320 }),
        ],
        import: CSV,
      });
      expect(imported.results.map((r) => r.outcome)).toEqual(['merged', 'added', 'added']);
      const denner = imported.results[1]?.transaction_id ?? '';
      // Entered by hand after the import: merged into the imported Denner row.
      const after = await addRows(db, user, {
        rows: [
          {
            amount_rappen: -1_500,
            booked_at: '2026-10-03T08:00:00Z',
            merchant: 'Denner',
            raw_text: null,
            mcc: null,
            source: 'manual',
            external_id: null,
            category_id: cat.groceries,
          },
        ],
      });
      expect(after.results[0]).toMatchObject({ outcome: 'merged', transaction_id: denner });
      const source = imported.data_source_id ?? '';

      // Coop: what the merge copied (statement text) is put back; Denner and Volg removed.
      expect(await removeImport(db, user, source)).toEqual({ removed: 2, restored: 1 });

      const rows = await queryRows<Row>(
        db,
        `select source, amount_rappen::int as amount, external_id, merged_into_id is not null as merged,
                deleted_at is not null as deleted
           from public.transactions where user_id = $1 order by source, amount_rappen`,
        [user],
      );
      // The import's rows are deleted for good (D-041).
      expect(rows).toEqual([
        { source: 'manual', amount: -2_340, external_id: null, merged: false, deleted: false },
        { source: 'manual', amount: -1_500, external_id: null, merged: false, deleted: false },
      ]);
      const revoked = await queryOne<Row>(
        db,
        `select status, consent_revoked_at = now() as revoked_now from public.data_sources where id = $1`,
        [source],
      );
      expect(revoked).toEqual({ status: 'revoked', revoked_now: true });
      // The manual Denner entry is a transaction of its own again, with the person's category.
      const list1 = await list(db, user);
      expect(
        list1.items.map((item) => [item.merchant, item.amount_rappen, item.category_id]),
      ).toEqual([
        ['Coop', -2_340, cat.groceries],
        ['Denner', -1_500, cat.groceries],
      ]);
      expect(before.results[0]?.outcome).toBe('added');
      await runDeferredChecks(db);
    });
  });

  it('the same file can be imported again afterwards; a second removal changes nothing', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const rows = [
        statementRow({ raw_text: 'KAUF DENNER' }),
        statementRow({ raw_text: 'KAUF VOLG', amount_rappen: -300 }),
      ];
      const first = await addRows(db, user, { rows, import: CSV });
      expect(await removeImport(db, user, first.data_source_id ?? '')).toEqual({
        removed: 2,
        restored: 0,
      });
      expect(await removeImport(db, user, first.data_source_id ?? '')).toEqual({
        removed: 0,
        restored: 0,
      });
      const again = await addRows(db, user, { rows, import: CSV });
      expect(again.results.map((r) => r.outcome)).toEqual(['added', 'added']);
      expect(ids(await list(db, user))).toHaveLength(2);
    });
  });

  it('counts only the transactions the person still saw', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const imported = await addRows(db, user, {
        rows: [statementRow({ raw_text: 'A' }), statementRow({ raw_text: 'B', amount_rappen: -1 })],
        import: CSV,
      });
      await update(db, user, imported.results[0]?.transaction_id ?? '', { deleted: true });
      expect(await removeImport(db, user, imported.data_source_id ?? '')).toEqual({
        removed: 1,
        restored: 0,
      });
      const left = await queryOne<{ n: number }>(
        db,
        'select count(*)::int as n from public.transactions where user_id = $1',
        [user],
      );
      expect(left.n).toBe(0);
    });
  });

  it('restores what its merges copied, field by field, unless the person changed it since (D-041)', async () => {
    await withRollback(async (db) => {
      const { user, ids: cat } = await onboardedUser(db);
      const manual = await addRows(db, user, {
        rows: [
          {
            amount_rappen: -4_590,
            booked_at: '2026-10-03T10:00:00Z',
            merchant: null,
            source: 'manual',
            category_id: cat.groceries,
          },
          {
            amount_rappen: -1_990,
            booked_at: '2026-10-03T11:00:00Z',
            merchant: 'Kiosk Hug',
            source: 'manual',
          },
          {
            amount_rappen: -3_000,
            booked_at: '2026-10-03T12:00:00Z',
            merchant: 'Volg',
            source: 'manual',
          },
        ],
      });
      const [, kioskId, volgId] = manual.results.map((r) => r.transaction_id ?? '');
      const imported = await addRows(db, user, {
        rows: [
          statementRow({
            amount_rappen: -1_990,
            merchant: 'KIOSK HUG BERN',
            raw_text: 'Einkauf Kiosk Hug, Karte von Erika Muster, IBAN CH9300762011623852957',
            note: 'Geburtstag Erika',
            items: [{ description: 'Champagner', amount_rappen: -1_990 }],
            original_amount_minor: -2_100,
            original_currency: 'EUR',
            mcc: 5499,
            category_id: cat.hobbies,
          }),
          statementRow({
            amount_rappen: -3_000,
            merchant: 'VOLG',
            raw_text: 'KAUF VOLG',
            mcc: 5411,
          }),
        ],
        import: CSV,
      });
      expect(imported.results.map((r) => r.outcome)).toEqual(['merged', 'merged']);
      // The person changes the Volg note-less row's statement text afterwards: that stays.
      await db.query(`update public.transactions set raw_text = 'Wocheneinkauf' where id = $1`, [
        volgId,
      ]);

      expect(await removeImport(db, user, imported.data_source_id ?? '')).toEqual({
        removed: 0,
        restored: 2,
      });
      const kiosk = await getTransaction(db, user, kioskId ?? '');
      expect(kiosk).toMatchObject({
        merchant: 'Kiosk Hug',
        raw_text: null,
        note: null,
        items: null,
        mcc: null,
        original_amount_minor: null,
        original_currency: null,
        category_id: null,
        categorized_by: 'none',
        merged_sources: [],
      });
      const volg = await getTransaction(db, user, volgId ?? '');
      expect(volg).toMatchObject({ raw_text: 'Wocheneinkauf', mcc: null });
      // Nothing of the file is left in the account, also not in the export.
      await asUser(db, user);
      const exported = await queryOne<{ text: string }>(
        db,
        'select public.export_my_data()::text as text',
      );
      await asPostgres(db);
      expect(exported.text.includes('Erika')).toBe(false);
    });
  });

  it('a previous category that no longer exists comes back as no category', async () => {
    await withRollback(async (db) => {
      const { user, ids: cat } = await onboardedUser(db);
      const gone = await make.category(db, user, { name: 'Weg' });
      const manual = await addRows(db, user, {
        rows: [
          {
            amount_rappen: -990,
            booked_at: '2026-10-03T10:00:00Z',
            merchant: 'Coop',
            source: 'manual',
          },
        ],
      });
      const id = manual.results[0]?.transaction_id ?? '';
      await db.query(
        `update public.transactions set category_id = $2, categorized_by = 'mcc', category_confidence = 50 where id = $1`,
        [id, gone],
      );
      const imported = await addRows(db, user, {
        rows: [
          statementRow({ amount_rappen: -990, raw_text: 'KAUF COOP', category_id: cat.hobbies }),
        ],
        import: CSV,
      });
      expect(imported.results[0]?.outcome).toBe('merged');
      await db.query('delete from public.categories where id = $1', [gone]);
      expect(await removeImport(db, user, imported.data_source_id ?? '')).toEqual({
        removed: 0,
        restored: 1,
      });
      expect(await getTransaction(db, user, id)).toMatchObject({
        category_id: null,
        categorized_by: 'none',
        category_confidence: null,
      });
    });
  });

  it('another user’s import, a source that is no import, an unknown id → import_not_found', async () => {
    await withRollback(async (db) => {
      const { user } = await onboardedUser(db);
      const { user: other } = await onboardedUser(db);
      const theirs = await addRows(db, other, { rows: [statementRow()], import: CSV });
      const bank = await make.dataSource(db, user, { kind: 'bank' });
      for (const id of [theirs.data_source_id, bank, randomUUID()]) {
        await rejects(db, user, 'select public.remove_import($1)', [id], 'import_not_found');
      }
      const still = await queryOne<{ n: number }>(
        db,
        'select count(*)::int as n from public.transactions where user_id = $1 and deleted_at is null',
        [other],
      );
      expect(still.n).toBe(1);
    });
  });
});

/** export_my_data() key for each table in schema public. */
const EXPORT_KEYS: Readonly<Record<string, string>> = {
  profiles: 'profile',
  notification_settings: 'notification_settings',
  subscriptions: 'subscription',
  fixed_costs: 'fixed_costs',
  categories: 'categories',
  budget_periods: 'budget_periods',
  budgets: 'budgets',
  transactions: 'transactions',
  transaction_splits: 'transaction_splits',
  categorization_rules: 'categorization_rules',
  data_sources: 'data_sources',
  alerts: 'alerts',
  ai_conversations: 'ai_conversations',
  ai_messages: 'ai_messages',
  consent_events: 'consent_events',
};

describe('export_my_data()', () => {
  it('has a key for every table in schema public, and nothing else', async () => {
    await withRollback(async (db) => {
      const tables = await publicTables(db);
      expect(Object.keys(EXPORT_KEYS).sort()).toEqual(tables);
      const { user } = await onboardedUser(db);
      const data = await exportData(db, user);
      expect(Object.keys(data).sort()).toEqual(
        ['exported_at', 'format_version', ...Object.values(EXPORT_KEYS)].sort(),
      );
      expect(data.format_version).toBe(1);
    });
  });

  it('contains every row of the user, deleted and merged transactions included, never another user’s', async () => {
    await withRollback(async (db) => {
      const { user, ids: cat } = await onboardedUser(db);
      const { user: other } = await onboardedUser(db);
      const period = await make.period(db, user);
      await make.budget(db, user, period, cat.groceries ?? '');
      await make.fixedCost(db, user);
      await make.rule(db, user, cat.groceries ?? '');
      const source = await make.dataSource(db, user);
      await make.credential(db, user, source, { ciphertext: Buffer.from('SECRET-TOKEN-1234') });
      const survivor = await make.transaction(db, user);
      await make.transaction(db, user, { merged_into_id: survivor, source: 'statement_import' });
      await make.transaction(db, user, { deleted_at: '2026-10-04T00:00:00Z' });
      const split = await make.transaction(db, user, { amount_rappen: -1_000 });
      await make.split(db, user, split, -500);
      await make.split(db, user, split, -500);
      await make.alert(db, user);
      const conversation = await make.conversation(db, user);
      await make.message(db, user, conversation);
      await make.consentEvent(db, user);
      await make.transaction(db, other, { note: 'NOT-MINE' });
      await runDeferredChecks(db);

      const data = await exportData(db, user);
      const counts = await queryOne<Record<string, number>>(
        db,
        `select ${Object.keys(EXPORT_KEYS)
          .map(
            (table) =>
              `(select count(*)::int from public.${table} where ${
                table === 'profiles' ? 'id' : 'user_id'
              } = $1) as ${table}`,
          )
          .join(', ')}`,
        [user],
      );
      for (const [table, key] of Object.entries(EXPORT_KEYS)) {
        const value = data[key];
        const exported = Array.isArray(value) ? value.length : value === null ? 0 : 1;
        expect([table, exported]).toEqual([table, counts[table]]);
      }
      expect((data.transactions as unknown[]).length).toBe(4); // incl. the merged and the deleted one
      const text = JSON.stringify(data);
      expect(text).not.toContain('NOT-MINE');
      expect(text).not.toContain(other);
      expect(text).not.toContain('ciphertext');
      expect(text).not.toContain(Buffer.from('SECRET-TOKEN-1234').toString('hex'));
      expect(text).not.toContain('SECRET-TOKEN-1234');
      expect((data.profile as Row).id).toBe(user);
    });
  });

  it('works before onboarding and needs a signed-in user', async () => {
    await withRollback(async (db) => {
      const fresh = await createUser(db);
      const data = await exportData(db, fresh);
      expect(data).toMatchObject({
        transactions: [],
        categories: [],
        subscription: { status: 'none' },
      });
      await asAuthenticatedWithoutUser(db);
      const error = await expectSqlError(
        db,
        SQLSTATE.insufficientPrivilege,
        'select public.export_my_data()',
      );
      expect(error.message).toBe('not signed in');
    });
  });
});
