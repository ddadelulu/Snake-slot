import { newSplitPart } from './split';
import {
  EARLIER_DAYS,
  buildQuickAddRow,
  earlierDays,
  initialQuickAdd,
  setSplitting,
  type QuickAddForm,
} from './quickAdd';

const NOW = new Date('2026-10-07T13:45:00.000Z');

function form(change: Partial<QuickAddForm>): QuickAddForm {
  return { ...initialQuickAdd(), ...change };
}

describe('buildQuickAddRow', () => {
  it('turns amount and category into one manual row booked now', () => {
    expect(buildQuickAddRow(form({ amountText: '12.50', categoryId: 'c-groceries' }), NOW)).toEqual(
      {
        ok: true,
        row: {
          amount_rappen: -1250,
          booked_at: '2026-10-07T13:45:00.000Z',
          merchant: null,
          raw_text: null,
          mcc: null,
          source: 'manual',
          external_id: null,
          category_id: 'c-groceries',
        },
      },
    );
  });

  it('adds where and a note, trimmed, and books another day as a local date', () => {
    const result = buildQuickAddRow(
      form({
        amountText: '4,40',
        categoryId: 'c-transport',
        merchant: '  SBB ',
        note: ' Zug nach Bern ',
        day: { kind: 'date', date: '2026-10-05' },
      }),
      NOW,
    );
    expect(result).toEqual({
      ok: true,
      row: expect.objectContaining({
        amount_rappen: -440,
        booked_on: '2026-10-05',
        merchant: 'SBB',
        note: 'Zug nach Bern',
        category_id: 'c-transport',
      }),
    });
    expect(result.ok && 'booked_at' in result.row).toBe(false);
  });

  it('stores money in as a positive amount, with or without a category', () => {
    expect(buildQuickAddRow(form({ amountText: '20', moneyIn: true }), NOW)).toMatchObject({
      ok: true,
      row: { amount_rappen: 2000 },
    });
    const refund = buildQuickAddRow(
      form({ amountText: '20', moneyIn: true, categoryId: 'c-clothes' }),
      NOW,
    );
    expect(refund).toMatchObject({
      ok: true,
      row: { amount_rappen: 2000, category_id: 'c-clothes' },
    });
  });

  it('asks for the amount and, for money out, a category', () => {
    expect(buildQuickAddRow(form({}), NOW)).toEqual({
      ok: false,
      problems: { amount: 'required', category: 'required' },
    });
    expect(buildQuickAddRow(form({ amountText: '-5', categoryId: 'c-1' }), NOW)).toEqual({
      ok: false,
      problems: { amount: 'invalid' },
    });
  });

  it('sends a split instead of a category, with the purchase’s sign', () => {
    const parts = [newSplitPart('c-groceries', '64'), newSplitPart('c-gifts', '20')];
    const result = buildQuickAddRow(
      form({ amountText: '84', categoryId: 'c-groceries', splitting: true, parts }),
      NOW,
    );
    expect(result).toMatchObject({
      ok: true,
      row: {
        amount_rappen: -8400,
        splits: [
          { category_id: 'c-groceries', amount_rappen: -6400, note: null },
          { category_id: 'c-gifts', amount_rappen: -2000, note: null },
        ],
      },
    });
    expect(result.ok && 'category_id' in result.row).toBe(false);
  });

  it('reports a split that does not add up, part by part', () => {
    const empty = newSplitPart('c-gifts', '');
    const result = buildQuickAddRow(
      form({
        amountText: '84',
        splitting: true,
        parts: [newSplitPart('c-groceries', '64'), empty],
      }),
      NOW,
    );
    expect(result).toEqual({
      ok: false,
      problems: { split: 'parts', parts: { [empty.key]: { amount: 'required' } } },
    });
  });
});

describe('quick add helpers', () => {
  it('turns the split on from the chosen category and keeps the parts when toggled', () => {
    const on = setSplitting(form({ categoryId: 'c-groceries' }), true);
    expect(on.splitting).toBe(true);
    expect(on.parts[0]?.categoryId).toBe('c-groceries');
    const off = setSplitting(on, false);
    expect(off.splitting).toBe(false);
    expect(setSplitting(off, true).parts).toBe(on.parts);
  });

  it('offers yesterday back to two weeks ago', () => {
    const days = earlierDays('2026-10-07');
    expect(days).toHaveLength(EARLIER_DAYS);
    expect(days[0]).toBe('2026-10-06');
    expect(days[13]).toBe('2026-09-23');
  });
});
