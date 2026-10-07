import { describe, expect, it } from 'vitest';

import { keyContains, merchantKey, suggestRulePattern } from './merchant';

describe('merchantKey', () => {
  it.each([
    ['COOP-4567 ZÜRICH', 'coop zurich'],
    ['TWINT *Coop Pronto', 'twint coop pronto'],
    ['Migros M Zürich HB', 'migros m zurich hb'],
    ['Digitec Galaxus AG', 'digitec galaxus'],
    ['Bäckerei Hug GmbH, 8001 Zürich', 'backerei hug zurich'],
    ['Crêperie Café Brûlée Sàrl', 'creperie cafe brulee'],
    ['Straße & Œuvre Æsch', 'strasse oeuvre aesch'],
    ['Čokolada Šumava Žilina Ÿ', 'cokolada sumava zilina y'],
    ['www.zalando.ch', 'zalando'],
    ['XXXX1234 MANOR 0815', 'manor'],
    ['ÑANDÚ ÌSOLA ÒRO', 'nandu isola oro'],
    ['', ''],
    ['  -- 1234 --  ', ''],
  ])('%s → %s', (input, key) => {
    expect(merchantKey(input)).toBe(key);
  });

  it('is empty for missing names', () => {
    expect(merchantKey(null)).toBe('');
    expect(merchantKey(undefined)).toBe('');
  });
});

describe('keyContains', () => {
  it('matches whole words in order', () => {
    expect(keyContains('coop pronto zurich', 'coop')).toBe(true);
    expect(keyContains('coop pronto zurich', 'coop pronto')).toBe(true);
    expect(keyContains('coop pronto zurich', 'pronto zurich')).toBe(true);
    expect(keyContains('coop pronto zurich', 'coop zurich')).toBe(false);
    expect(keyContains('coopers', 'coop')).toBe(false);
  });

  it('never matches an empty key', () => {
    expect(keyContains('coop', '')).toBe(false);
    expect(keyContains('', 'coop')).toBe(false);
  });
});

describe('suggestRulePattern', () => {
  it.each([
    ['MANOR AG ZUERICH 1234', 'manor'],
    ['TWINT *Coop Pronto', 'coop'],
    ['Mc Donalds Bern', 'mc donalds'],
    ['M', 'm'],
    ['Kauf/Dienstleistung Karte Visa', null],
    ['1234', null],
    [null, null],
  ])('%s → %s', (merchant, pattern) => {
    expect(suggestRulePattern(merchant)).toBe(pattern);
  });
});
