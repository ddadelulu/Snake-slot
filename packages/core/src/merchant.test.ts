import { describe, expect, it } from 'vitest';

import { MERCHANT_STOPWORDS, keyContains, merchantKey } from './merchant';

describe('merchantKey', () => {
  it.each([
    ['COOP-4567 ZÜRICH', 'coop zurich'],
    ['TWINT *Coop Pronto', 'twint coop pronto'],
    ['Migros M Zürich HB', 'migros m zurich hb'],
    ['Digitec Galaxus AG', 'digitec galaxus'],
    ['Bäckerei Hug GmbH, 8001 Zürich', 'backerei hug zurich'],
    ['Crêperie Café Brûlée Sàrl', 'creperie cafe brulee'],
    ['Straße & Œuvre Æsch', 'strasse ouvre asch'],
    ['Čokolada Šumava Žilina Ÿ', 'cokolada sumava zilina y'],
    ['www.zalando.ch', 'zalando'],
    ['XXXX1234 MANOR 0815', 'manor'],
    ['ÑANDÚ ÌSOLA ÒRO', 'nandu isola oro'],
    ['', ''],
    ['  -- 1234 --  ', ''],
  ])('%s → %s', (input, key) => {
    expect(merchantKey(input)).toBe(key);
  });

  it.each([
    ["McDonald's Bern", 'mcdonalds bern'],
    ['McDonald’s', 'mcdonalds'],
    ['MCDONALD´S', 'mcdonalds'],
    ['Levi`s', 'levis'],
    ["L'Osteria", 'losteria'],
    ['H&M', 'h m'],
  ])('drops apostrophes: %s → %s', (input, key) => {
    expect(merchantKey(input)).toBe(key);
  });

  it.each([
    ['Bäckerei', 'BAECKEREI', 'backerei'],
    ['Müller', 'MUELLER', 'muller'],
    ['Sprüngli', 'SPRUENGLI', 'sprungli'],
    ['Orell Füssli', 'ORELL FUESSLI', 'orell fussli'],
    ['Vögele', 'VOEGELE', 'vogele'],
    ['Zürich', 'ZUERICH', 'zurich'],
    ['Coop Mineralöl', 'COOP MINERALOEL', 'coop mineralol'],
  ])('folds ae/oe/ue: %s and %s → %s', (umlaut, spelled, key) => {
    expect(merchantKey(umlaut)).toBe(key);
    expect(merchantKey(spelled)).toBe(key);
  });

  it.each([
    ['Michael', 'michal'],
    ['Queen', 'quen'],
    ['Blue Cinema', 'blu cinema'],
    ['Noël', 'nol'],
    ['aee', 'ae'],
    ['uee oee', 'ue oe'],
  ])('folds every e after a, o or u once, also in other words: %s → %s', (input, key) => {
    expect(merchantKey(input)).toBe(key);
  });

  it('treats decomposed accents (NFD) as separators, like any character outside the table', () => {
    expect(merchantKey('Zürich')).toBe('zu rich');
    expect(merchantKey('Zürich'.normalize('NFD'))).toBe('zu rich');
  });

  it('drops every stopword', () => {
    expect(merchantKey(MERCHANT_STOPWORDS.join(' '))).toBe('');
    expect(merchantKey('Coop AG Co Sàrl')).toBe('coop');
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
