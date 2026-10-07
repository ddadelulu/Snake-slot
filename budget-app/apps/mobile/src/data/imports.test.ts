import { ResponseFormatError } from './json';
import { parseRemoveImportResult } from './imports';

jest.mock('@/lib/supabase', () => ({ getSupabase: jest.fn(), getSupabaseIfConfigured: jest.fn() }));

describe('parseRemoveImportResult', () => {
  it('reads how many transactions were removed and restored (D-041)', () => {
    expect(parseRemoveImportResult({ removed: 12, restored: 3 })).toEqual({
      removed: 12,
      restored: 3,
    });
  });

  it('refuses an answer without both counts', () => {
    for (const answer of [12, null, { removed: 12 }, { removed: '12', restored: 0 }]) {
      expect(() => parseRemoveImportResult(answer)).toThrow(ResponseFormatError);
    }
  });
});
