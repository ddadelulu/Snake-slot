import { RequestError } from '@/lib/requestError';

import { IMPORT_REQUEST_ERRORS, importRequestError } from './errors';

describe('importRequestError', () => {
  it('names the refusals of add_transactions', () => {
    for (const reason of ['too_many_rows', 'invalid_row', 'invalid_input', 'not_onboarded']) {
      expect(importRequestError(new RequestError(reason, 400, '22023'))).toBe(reason);
    }
  });

  it('tells a network failure from anything else', () => {
    expect(importRequestError(new RequestError('Failed to fetch', 0, ''))).toBe('network');
    expect(importRequestError(new RequestError('category_not_found', 400, '22023'))).toBe(
      'unknown',
    );
    expect(importRequestError(new RequestError('Internal error', 500, ''))).toBe('unknown');
    expect(importRequestError(new Error('boom'))).toBe('unknown');
  });

  it('has a message for every code', () => {
    const { en } = jest.requireActual<typeof import('@/i18n/en')>('@/i18n/en');
    for (const code of IMPORT_REQUEST_ERRORS) expect(en.imports.requestErrors[code]).toBeTruthy();
  });
});
