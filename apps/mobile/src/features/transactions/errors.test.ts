import { en } from '@/i18n/en';
import { de } from '@/i18n/de';
import { RequestError } from '@/lib/requestError';

import { TRANSACTION_ERROR_CODES, transactionErrorCode } from './errors';

describe('transactionErrorCode', () => {
  it.each([
    'transaction_not_found',
    'category_not_found',
    'invalid_splits',
    'transaction_is_split',
    'not_editable',
    'fixed_cost_not_found',
    'rule_needs_category',
  ])('passes the database’s reason %s through', (reason) => {
    expect(transactionErrorCode(new RequestError(reason, 400, '22023'))).toBe(reason);
  });

  it('tells a network failure from an unknown one', () => {
    expect(transactionErrorCode(new RequestError('Failed to fetch', 0, ''))).toBe('network');
    expect(transactionErrorCode(new RequestError('some_new_reason', 400, '22023'))).toBe('unknown');
    expect(transactionErrorCode(new Error('boom'))).toBe('unknown');
  });

  it('has a message in both languages for every code', () => {
    for (const code of TRANSACTION_ERROR_CODES) {
      expect(en.transactionErrors[code]).toBeTruthy();
      expect(de.transactionErrors[code]).toBeTruthy();
    }
  });
});
