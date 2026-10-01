import { describe, expect, it } from 'vitest';

import { validateSourceTransaction, type SourceTransaction } from './sources';

const valid: SourceTransaction = {
  amountRappen: -8400,
  currency: 'CHF',
  bookedAt: '2026-10-01T12:34:00+02:00',
  merchant: 'Manor',
  rawText: 'Zahlung CHF 84.00 Manor Zürich',
  mcc: 5311,
  source: 'android_notification',
  sourceId: 'notif-123',
};

const problemsOf = (patch: Partial<SourceTransaction>) => {
  const result = validateSourceTransaction({ ...valid, ...patch } as SourceTransaction);
  return result.ok ? [] : result.problems;
};

describe('validateSourceTransaction', () => {
  it('accepts a well-formed transaction', () => {
    expect(validateSourceTransaction(valid)).toEqual({ ok: true, value: valid });
  });

  it('accepts refunds, foreign purchases, items and missing optional data', () => {
    expect(
      problemsOf({
        amountRappen: 1990,
        original: { amountMinor: 2050, currency: 'EUR' },
        bookedAt: '2026-10-01T10:00:00Z',
        merchant: null,
        rawText: null,
        mcc: null,
        sourceId: null,
        items: [{ description: 'Pullover', amountRappen: 1990, quantity: 1 }],
      }),
    ).toEqual([]);
  });

  it('rejects zero, float and out-of-range amounts', () => {
    expect(problemsOf({ amountRappen: 0 })).toHaveLength(1);
    expect(problemsOf({ amountRappen: 84.5 })).toHaveLength(1);
    expect(problemsOf({ amountRappen: 10_000_000_001 })).toHaveLength(1);
  });

  it('rejects non-CHF bookings and malformed original amounts', () => {
    expect(problemsOf({ currency: 'EUR' as 'CHF' })).toEqual(['currency must be CHF']);
    expect(problemsOf({ original: { amountMinor: 0, currency: 'EUR' } })).toHaveLength(1);
    expect(problemsOf({ original: { amountMinor: 100, currency: 'euro' } })).toHaveLength(1);
  });

  it('requires an ISO date-time with an offset', () => {
    expect(problemsOf({ bookedAt: '2026-10-01 12:34' })).toHaveLength(1);
    expect(problemsOf({ bookedAt: '2026-10-01T12:34:00' })).toHaveLength(1);
    expect(problemsOf({ bookedAt: '2026-13-45T12:34:00Z' })).toHaveLength(1);
  });

  it('checks text lengths, MCC, source and source id', () => {
    expect(problemsOf({ merchant: '  ' })).toHaveLength(1);
    expect(problemsOf({ merchant: 'x'.repeat(201) })).toHaveLength(1);
    expect(problemsOf({ rawText: 'x'.repeat(4001) })).toHaveLength(1);
    expect(problemsOf({ mcc: 10000 })).toHaveLength(1);
    expect(problemsOf({ mcc: 53.11 })).toHaveLength(1);
    expect(problemsOf({ source: 'carrier_pigeon' as 'manual' })).toHaveLength(1);
    expect(problemsOf({ sourceId: '' })).toHaveLength(1);
  });

  it('checks line items', () => {
    expect(
      problemsOf({
        items: [
          { description: '', amountRappen: 100 },
          { description: 'Brot', amountRappen: 1.5 },
          { description: 'Milch', amountRappen: 150, quantity: 0 },
        ],
      }),
    ).toHaveLength(3);
  });

  it('reports every problem at once', () => {
    expect(problemsOf({ amountRappen: 0, mcc: -1, merchant: '' })).toHaveLength(3);
  });
});
