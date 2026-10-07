import { transactionJson } from '@/test/transactionsFixture';

import { ResponseFormatError } from './json';
import { parseAddResult, parseTransactionItem } from './transactions';

jest.mock('@/lib/supabase', () => ({ getSupabase: jest.fn(), getSupabaseIfConfigured: jest.fn() }));

describe('parseTransactionItem', () => {
  it('reads the rule the database proposes', () => {
    const item = parseTransactionItem(
      transactionJson({
        id: 't-1',
        merchant: 'Manor',
        suggested_rule: { match_field: 'merchant', match_type: 'contains', pattern: 'manor' },
      }),
    );
    expect(item.suggestedRule).toEqual({
      matchField: 'merchant',
      matchType: 'contains',
      pattern: 'manor',
    });
    expect(parseTransactionItem(transactionJson({ id: 't-2' })).suggestedRule).toBeNull();
    const { suggested_rule: _left, ...withoutField } = transactionJson({ id: 't-3' });
    expect(parseTransactionItem(withoutField).suggestedRule).toBeNull();
  });

  it('refuses a proposal it cannot send back', () => {
    for (const suggested_rule of [
      { match_field: 'mcc', match_type: 'equals', pattern: '5411' },
      { match_field: 'merchant', match_type: 'starts_with', pattern: 'manor' },
      { match_field: 'merchant', match_type: 'contains' },
      'manor',
    ]) {
      expect(() => parseTransactionItem(transactionJson({ id: 't-1', suggested_rule }))).toThrow(
        ResponseFormatError,
      );
    }
  });

  it('reads money in placed as a refund (D-039)', () => {
    const item = parseTransactionItem(
      transactionJson({
        id: 't-refund',
        amount_rappen: 5000,
        categorized_by: 'refund',
        category_id: 'c-clothes',
        category_confidence: 60,
        needs_review: true,
      }),
    );
    expect(item).toMatchObject({ categorizedBy: 'refund', categoryConfidence: 60 });
    expect(() =>
      parseTransactionItem(transactionJson({ id: 't-1', categorized_by: 'guess' })),
    ).toThrow(ResponseFormatError);
  });
});

describe('parseAddResult', () => {
  const counts = {
    added: 0,
    merged: 1,
    already_imported: 0,
    possible_duplicate: 1,
    needs_review: 0,
  };
  const row = (index: number, outcome: string, duplicateOf: unknown) => ({
    index,
    outcome,
    transaction_id: outcome === 'merged' ? 't-kept' : null,
    duplicate_of: duplicateOf,
    category_id: 'c-groceries',
    categorized_by: 'refund',
    category_confidence: 60,
    fixed_cost_id: null,
    needs_review: true,
  });
  const kept = {
    id: 't-kept',
    booked_at: '2026-10-02T12:05:00+00:00',
    merchant: null,
    amount_rappen: -990,
    source: 'manual',
  };

  it('describes the transaction a row was merged into or looks like', () => {
    const result = parseAddResult({
      data_source_id: null,
      results: [row(0, 'merged', kept), row(1, 'possible_duplicate', kept)],
      counts,
    });
    const expected = {
      id: 't-kept',
      bookedAt: '2026-10-02T12:05:00+00:00',
      merchant: null,
      amountRappen: -990,
      source: 'manual',
    };
    expect(result.results.map((entry) => [entry.outcome, entry.duplicateOf])).toEqual([
      ['merged', expected],
      ['possible_duplicate', expected],
    ]);
    expect(result.results[0]).toMatchObject({ transactionId: 't-kept', categorizedBy: 'refund' });
  });
});
