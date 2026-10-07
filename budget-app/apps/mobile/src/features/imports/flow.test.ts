import { readStatement } from '@budget/core';

import { UBS_STATEMENT } from '@/test/statementFixture';

import { applyMapping, readPickedFile, type MappingStep } from './flow';

// The real parser, watched: the tests check the column mapping handed to it.
jest.mock('@budget/core', () => {
  const actual = jest.requireActual('@budget/core');
  return { ...actual, readStatement: jest.fn(actual.readStatement) };
});

// All statements are synthetic.
const file = (name: string, text: string) => ({ name, bytes: new TextEncoder().encode(text) });

const UNKNOWN = [
  'Mein Export',
  'Tag;Was;Wieviel;Wo',
  '30.09.2026;Znüni;-4.50;Exempla Kiosk',
  '29.09.2026;Zmittag;-18.00;Exempla Bistro',
].join('\n');

function mappingStep(text = UNKNOWN): MappingStep {
  const step = readPickedFile(file('export.csv', text));
  if (step.kind !== 'mapping') throw new Error(`expected the mapping step, got ${step.kind}`);
  return step;
}

describe('readPickedFile', () => {
  it('previews a statement it knows', () => {
    const step = readPickedFile(file('ubs.csv', UBS_STATEMENT));
    expect(step).toMatchObject({ kind: 'preview', file: { name: 'ubs.csv' } });
    expect(step.kind === 'preview' && step.statement.rows).toHaveLength(4);
  });

  it('asks for the columns of an unknown CSV', () => {
    expect(mappingStep()).toMatchObject({
      kind: 'mapping',
      request: { code: 'unknown_columns', headerRow: 2, columns: ['Tag', 'Was', 'Wieviel', 'Wo'] },
      draft: { date: null, amount: null, text: [] },
      rejected: false,
    });
  });

  it('names the problem of a file it cannot import', () => {
    expect(readPickedFile(file('leer.csv', ''))).toEqual({
      kind: 'problem',
      fileName: 'leer.csv',
      problem: { code: 'empty' },
    });
  });
});

describe('applyMapping', () => {
  it('previews the file read with the person’s columns', () => {
    const step = mappingStep();
    const next = applyMapping({
      ...step,
      draft: { ...step.draft, date: 0, amount: 2, text: [1, 3] },
    });
    expect(next.kind).toBe('preview');
    expect(
      next.kind === 'preview' && next.statement.rows.map((row) => row.transaction.amountRappen),
    ).toEqual([-450, -1800]);
  });

  it('hands the debit/credit column and the sign switch to the parser', () => {
    const step = mappingStep();
    applyMapping({
      ...step,
      draft: { ...step.draft, date: 0, amount: 2, direction: 3, text: [1] },
    });
    expect(jest.mocked(readStatement).mock.calls.at(-1)?.[1]).toEqual({
      mapping: { headerRow: 2, date: 0, amount: 2, direction: 3, text: [1] },
    });
    applyMapping({
      ...step,
      draft: { ...step.draft, date: 0, amount: 2, invertAmounts: true, text: [1, 3] },
    });
    expect(jest.mocked(readStatement).mock.calls.at(-1)?.[1]).toEqual({
      mapping: { headerRow: 2, date: 0, amount: 2, invertAmounts: true, text: [1, 3] },
    });
  });

  it('stays on the mapping while it is incomplete', () => {
    const step = mappingStep();
    expect(applyMapping(step)).toBe(step);
  });

  it('asks to check the columns when they read nothing', () => {
    const step = mappingStep();
    expect(
      applyMapping({ ...step, draft: { ...step.draft, date: 1, amount: 2, text: [3] } }),
    ).toMatchObject({
      kind: 'mapping',
      rejected: true,
    });
    const outOfRange = { ...step, request: { ...step.request, headerRow: 9 } };
    expect(
      applyMapping({ ...outOfRange, draft: { ...step.draft, date: 0, amount: 2, text: [1] } }),
    ).toMatchObject({ kind: 'mapping', rejected: true });
  });

  it('ends the mapping for a problem of the file itself', () => {
    const long = [
      'Tag;Was;Wieviel',
      ...Array.from({ length: 2001 }, (_, line) => `30.09.2026;Exempla ${line};-1.00`),
    ].join('\n');
    const step = mappingStep(long);
    expect(
      applyMapping({ ...step, draft: { ...step.draft, date: 0, amount: 2, text: [1] } }),
    ).toEqual({
      kind: 'problem',
      fileName: 'export.csv',
      problem: { code: 'too_many_rows', count: 2001, max: 2000 },
    });
  });
});
