import { readStatement, type ParsedStatement, type SkippedRow } from '@budget/core';
import { UBS_DE } from '@budget/core/src/import/__fixtures__/statements';

import type { AddResult, AddRowResult } from '@/data/transactions';

import {
  bookingDay,
  columnNames,
  columnSamples,
  countByStatus,
  dryRunRows,
  formatMegabytes,
  groupSkipped,
  importInfo,
  initialSelection,
  isStatementBank,
  mappingDraftFrom,
  mappingProblems,
  rowDescription,
  rowsToImport,
  selectAll,
  sourceKey,
  summarize,
  toColumnMapping,
  toggleSelection,
  toggleTextColumn,
  toPreviewRows,
  type MappingDraft,
  type UnknownColumns,
} from './model';

// The statement is synthetic (packages/core/src/import/__fixtures__).
function ubs(): ParsedStatement {
  const result = readStatement(new TextEncoder().encode(UBS_DE));
  if (!result.ok) throw new Error('UBS fixture does not parse');
  return result.statement;
}

function result(
  index: number,
  outcome: AddRowResult['outcome'],
  extra: Partial<AddRowResult> = {},
) {
  return {
    index,
    outcome,
    transactionId: null,
    duplicateOf: null,
    categoryId: null,
    categorizedBy: 'none',
    categoryConfidence: null,
    fixedCostId: null,
    needsReview: false,
    ...extra,
  } satisfies AddRowResult;
}

const MATCH = {
  id: 't-cafe',
  bookedAt: '2026-09-24T07:05:00+00:00',
  merchant: 'Exempla Café Bern',
  amountRappen: -850,
  source: 'statement_import' as const,
};

function dryRun(): AddResult {
  return {
    dataSourceId: null,
    results: [
      result(0, 'merged', { transactionId: 't-manual', categoryId: 'c-groceries' }),
      result(1, 'added', { needsReview: true }),
      result(2, 'already_imported', { transactionId: 't-salary', categoryId: 'c-x' }),
      result(3, 'possible_duplicate', { duplicateOf: MATCH }),
    ],
    counts: { added: 1, merged: 1, already_imported: 1, possible_duplicate: 1, needs_review: 1 },
  };
}

describe('preview rows', () => {
  it('marks each line with what importing it would do', () => {
    const rows = toPreviewRows(ubs(), dryRun());
    expect(
      rows.map((row) => [row.index, row.line, row.status, row.mergeTargetId, row.match?.id]),
    ).toEqual([
      [0, 11, 'merge', 't-manual', undefined],
      [1, 12, 'new', null, undefined],
      [2, 15, 'imported_before', null, undefined],
      [3, 16, 'look_alike', null, 't-cafe'],
    ]);
    expect(rows[0]).toMatchObject({ categoryId: 'c-groceries', needsReview: false });
    expect(rows[1]).toMatchObject({ categoryId: null, needsReview: true });
    expect(countByStatus(rows)).toEqual({ new: 1, merge: 1, imported_before: 1, look_alike: 1 });
  });

  it('treats a line the dry run did not answer as new', () => {
    const rows = toPreviewRows(ubs(), { ...dryRun(), results: [] });
    expect(rows.every((row) => row.status === 'new')).toBe(true);
  });

  it('checks new lines and merges, leaves look-alikes to the person, never re-imports', () => {
    const rows = toPreviewRows(ubs(), dryRun());
    expect([...initialSelection(rows)]).toEqual([0, 1]);
    expect([...selectAll(rows)]).toEqual([0, 1, 3]);
    const [merge, , before, lookAlike] = rows;
    let selection = toggleSelection(initialSelection(rows), lookAlike!);
    expect([...selection].sort()).toEqual([0, 1, 3]);
    selection = toggleSelection(selection, merge!);
    expect([...selection].sort()).toEqual([1, 3]);
    expect(toggleSelection(selection, before!)).toBe(selection);
  });

  it('imports the checked lines in file order; a checked look-alike is stored anyway', () => {
    const rows = toPreviewRows(ubs(), dryRun());
    const imported = rowsToImport(rows, new Set([3, 0, 2]));
    expect(imported.map((row) => [row.external_id, row.allow_duplicate])).toEqual([
      ['csv:CH9300000000000000000:TEST0000000001', undefined],
      ['csv:CH9300000000000000000:TEST0000000004', true],
    ]);
    expect(rowsToImport(rows, new Set())).toEqual([]);
  });

  it('sends every line to the dry run', () => {
    const statement = ubs();
    expect(dryRunRows(statement)).toHaveLength(4);
    expect(dryRunRows(statement)[0]).toMatchObject({
      amount_rappen: -2340,
      source: 'statement_import',
      booked_on: '2026-09-29',
      booked_time: '14:23:05',
    });
    expect(importInfo('ubs.csv', statement)).toEqual({
      fileName: 'ubs.csv',
      format: 'csv',
      bank: 'ubs',
    });
  });

  it('names a line by merchant, else statement text', () => {
    const [first, second] = ubs().rows;
    expect(rowDescription(first!.transaction)).toBe('Mustermarkt-4567 Zürich');
    expect(rowDescription(second!.transaction)).toMatch(/^Sammelauftrag/);
    expect(rowDescription({ ...second!.transaction, rawText: null })).toBeNull();
    expect(bookingDay(first!.transaction)).toBe('2026-09-29');
    expect(
      bookingDay({
        ...first!.transaction,
        bookedOn: undefined,
        bookedAt: '2026-09-30T08:00:00+02:00',
      }),
    ).toBe('2026-09-30');
  });

  it('sums up the import', () => {
    expect(
      summarize({
        dataSourceId: 'ds-1',
        results: [],
        counts: {
          added: 5,
          merged: 2,
          already_imported: 3,
          possible_duplicate: 1,
          needs_review: 4,
        },
      }),
    ).toEqual({ added: 5, merged: 2, alreadyThere: 4, needsReview: 4 });
  });
});

describe('skipped lines', () => {
  it('groups them by reason, expected reasons first, lines in order', () => {
    const skipped: SkippedRow[] = [
      { line: 9, reason: 'invalid_date', text: 'x' },
      { line: 7, reason: 'not_booked', text: 'b' },
      { line: 3, reason: 'not_booked', text: 'a' },
      { line: 5, reason: 'not_chf', text: 'c' },
    ];
    expect(
      groupSkipped(skipped).map((group) => [group.reason, group.rows.map((row) => row.line)]),
    ).toEqual([
      ['not_booked', [3, 7]],
      ['not_chf', [5]],
      ['invalid_date', [9]],
    ]);
    expect(groupSkipped([])).toEqual([]);
  });
});

describe('origin of a file', () => {
  it('is the bank when known, else the format', () => {
    expect(sourceKey('postfinance', 'csv')).toBe('imports.banks.postfinance');
    expect(sourceKey(null, 'camt053')).toBe('imports.formats.camt053');
    expect(sourceKey('bank-of-elsewhere', 'csv')).toBe('imports.formats.csv');
    expect(isStatementBank('zkb')).toBe(true);
    expect(isStatementBank('toString')).toBe(false);
    expect(isStatementBank(3)).toBe(false);
  });

  it('formats the size limit', () => {
    expect(formatMegabytes(5 * 1024 * 1024)).toBe('5 MB');
  });
});

describe('column mapping', () => {
  const request: UnknownColumns = {
    code: 'unknown_columns',
    headerRow: 2,
    columns: ['Tag', '', 'Wieviel'],
    sample: [
      ['30.09.2026', 'Znüni', '-4.50', 'extra'],
      ['', 'Zmittag', '-18.00'],
    ],
    guess: { headerRow: 2, date: 0, text: [3, 1] },
  };

  it('names columns from the header, else by number, and shows examples', () => {
    expect(columnNames(request)).toEqual(['Tag', null, 'Wieviel', null]);
    expect(columnNames({ ...request, headerRow: 0 })).toEqual([null, null, null, null]);
    expect(columnSamples(request, 0)).toEqual(['30.09.2026']);
    expect(columnSamples(request, 1)).toEqual(['Znüni', 'Zmittag']);
    expect(columnSamples(request, 3)).toEqual(['extra']);
    expect(columnSamples(request, 1, 1)).toEqual(['Znüni']);
  });

  it('starts from what the parser recognised', () => {
    expect(mappingDraftFrom(request.guess)).toEqual({
      date: 0,
      amountKind: 'single',
      amount: null,
      debit: null,
      credit: null,
      text: [1, 3],
    });
    expect(mappingDraftFrom({ debit: 2, credit: 3 })).toMatchObject({
      date: null,
      amountKind: 'split',
      debit: 2,
      credit: 3,
      text: [],
    });
    expect(mappingDraftFrom({ amount: 2, debit: 3 }).amountKind).toBe('single');
  });

  it('needs a date, an amount (or debit/credit) and a description', () => {
    const empty: MappingDraft = mappingDraftFrom({});
    expect(mappingProblems(empty)).toEqual(['date', 'amount', 'text']);
    expect(toColumnMapping(empty, 2)).toBeNull();

    const single: MappingDraft = { ...empty, date: 0, amount: 2, text: [1] };
    expect(mappingProblems(single)).toEqual([]);
    expect(toColumnMapping(single, 2)).toEqual({ headerRow: 2, date: 0, amount: 2, text: [1] });

    const split: MappingDraft = { ...single, amountKind: 'split', debit: 2, credit: null };
    expect(toColumnMapping(split, 0)).toEqual({ headerRow: 0, date: 0, debit: 2, text: [1] });
    expect(mappingProblems({ ...split, debit: null })).toEqual(['amount']);
    expect(toColumnMapping({ ...split, debit: 2, credit: 3 }, 2)).toEqual({
      headerRow: 2,
      date: 0,
      debit: 2,
      credit: 3,
      text: [1],
    });
  });

  it('toggles description columns, kept in column order', () => {
    const draft = mappingDraftFrom({});
    const two = toggleTextColumn(toggleTextColumn(draft, 3), 1);
    expect(two.text).toEqual([1, 3]);
    expect(toggleTextColumn(two, 3).text).toEqual([1]);
  });
});
