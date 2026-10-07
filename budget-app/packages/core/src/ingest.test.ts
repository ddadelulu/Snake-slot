import { describe, expect, it } from 'vitest';

import { toIngestRow } from './ingest';
import type { SourceTransaction } from './sources';

const base: SourceTransaction = {
  amountRappen: -2340,
  currency: 'CHF',
  bookedOn: '2026-10-03',
  bookedTime: '14:23',
  merchant: 'Coop',
  rawText: 'KAUF COOP-4567 ZUERICH',
  mcc: 5411,
  source: 'statement_import',
  sourceId: 'csv:2026-10-03:-2340:coop zuerich:1',
};

describe('toIngestRow', () => {
  it('maps a statement row', () => {
    expect(toIngestRow(base)).toEqual({
      amount_rappen: -2340,
      booked_on: '2026-10-03',
      booked_time: '14:23',
      merchant: 'Coop',
      raw_text: 'KAUF COOP-4567 ZUERICH',
      mcc: 5411,
      source: 'statement_import',
      external_id: 'csv:2026-10-03:-2340:coop zuerich:1',
    });
  });

  it('maps an instant, a foreign amount and items', () => {
    const row = toIngestRow({
      ...base,
      bookedOn: undefined,
      bookedTime: undefined,
      bookedAt: '2026-10-03T14:23:00+02:00',
      original: { amountMinor: -2500, currency: 'EUR' },
      items: [
        { description: 'Brot', amountRappen: -340, quantity: 2 },
        { description: 'Milch', amountRappen: -2000 },
      ],
    });
    expect(row).toMatchObject({
      booked_at: '2026-10-03T14:23:00+02:00',
      original_amount_minor: -2500,
      original_currency: 'EUR',
      items: [
        { description: 'Brot', amount_rappen: -340, quantity: 2 },
        { description: 'Milch', amount_rappen: -2000 },
      ],
    });
    expect(row).not.toHaveProperty('booked_on');
    expect(row.items?.[1]).not.toHaveProperty('quantity');
  });

  it('adds the person’s choices', () => {
    expect(
      toIngestRow(
        { ...base, source: 'manual', sourceId: null },
        {
          categoryId: null,
          splits: [
            { categoryId: 'a', amountRappen: -2000, note: 'food' },
            { categoryId: null, amountRappen: -340 },
          ],
          note: 'Weekly shop',
          allowDuplicate: true,
        },
      ),
    ).toMatchObject({
      category_id: null,
      splits: [
        { category_id: 'a', amount_rappen: -2000, note: 'food' },
        { category_id: null, amount_rappen: -340, note: null },
      ],
      note: 'Weekly shop',
      allow_duplicate: true,
    });
    expect(toIngestRow(base, { categoryId: 'b' }).category_id).toBe('b');
  });
});
