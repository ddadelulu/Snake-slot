import { rulePromptFor } from './rulePrompt';

const MANOR = { matchField: 'merchant', matchType: 'contains', pattern: 'manor' } as const;

describe('rulePromptFor', () => {
  it('offers exactly the rule the database proposed', () => {
    expect(rulePromptFor('c-clothes', { suggestedRule: MANOR })).toBe(MANOR);
    const exact = {
      matchField: 'merchant',
      matchType: 'equals',
      pattern: 'coop vitality',
    } as const;
    expect(rulePromptFor('c-health', { suggestedRule: exact })).toEqual(exact);
  });

  it('asks nothing without a proposal', () => {
    expect(rulePromptFor('c-clothes', { suggestedRule: null })).toBeNull();
  });

  it('asks only for a real category', () => {
    expect(rulePromptFor(null, { suggestedRule: MANOR })).toBeNull();
  });
});
