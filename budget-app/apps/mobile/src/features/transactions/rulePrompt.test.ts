import { rulePromptFor, suggestRule } from './rulePrompt';

describe('suggestRule', () => {
  it('builds the pattern from the merchant', () => {
    expect(suggestRule({ merchant: 'MANOR AG 0815', rawText: 'Kauf MANOR' })).toEqual({
      matchField: 'merchant',
      matchType: 'contains',
      pattern: 'manor',
    });
  });

  it('uses the statement text when the merchant gives nothing to match', () => {
    expect(suggestRule({ merchant: null, rawText: 'TWINT *Coop Pronto 4567' })).toEqual({
      matchField: 'raw_text',
      matchType: 'contains',
      pattern: 'coop',
    });
    expect(suggestRule({ merchant: 'TWINT', rawText: 'Bäckerei Hug, Zug' })).toEqual({
      matchField: 'raw_text',
      matchType: 'contains',
      pattern: 'backerei',
    });
  });

  it('offers nothing without anything to recognise the purchase by', () => {
    expect(suggestRule({ merchant: null, rawText: null })).toBeNull();
    expect(suggestRule({ merchant: '1234', rawText: 'TWINT' })).toBeNull();
  });
});

describe('rulePromptFor', () => {
  it('asks only for a real category', () => {
    expect(rulePromptFor('c-clothes', { merchant: 'Manor', rawText: null })?.pattern).toBe('manor');
    expect(rulePromptFor(null, { merchant: 'Manor', rawText: null })).toBeNull();
  });
});
