import { describe, expect, it } from 'vitest';

import { LEFTOVER_POLICIES, type LeftoverPolicy } from '../constants';
import { MAX_ABS_RAPPEN } from '../money';
import { settleLeftover } from './leftover';

describe('settleLeftover', () => {
  it('rollover carries the whole result, a deficit included', () => {
    expect(settleLeftover('rollover', 23_550)).toEqual({
      leftoverRappen: 23_550,
      policy: 'rollover',
      carriedOverRappen: 23_550,
      toSavingsRappen: 0,
    });
    expect(settleLeftover('rollover', -8_000)).toEqual({
      leftoverRappen: -8_000,
      policy: 'rollover',
      carriedOverRappen: -8_000,
      toSavingsRappen: 0,
    });
  });

  it('savings moves money left over to savings and drops a deficit', () => {
    expect(settleLeftover('savings', 23_550)).toEqual({
      leftoverRappen: 23_550,
      policy: 'savings',
      carriedOverRappen: 0,
      toSavingsRappen: 23_550,
    });
    expect(settleLeftover('savings', -8_000)).toEqual({
      leftoverRappen: -8_000,
      policy: 'savings',
      carriedOverRappen: 0,
      toSavingsRappen: 0,
    });
  });

  it('reset starts every period fresh', () => {
    for (const leftover of [23_550, 0, -8_000]) {
      expect(settleLeftover('reset', leftover)).toEqual({
        leftoverRappen: leftover,
        policy: 'reset',
        carriedOverRappen: 0,
        toSavingsRappen: 0,
      });
    }
  });

  it('never creates or loses money when something is left over', () => {
    for (const policy of LEFTOVER_POLICIES) {
      for (const leftover of [0, 1, 5, 99_995, MAX_ABS_RAPPEN]) {
        const outcome = settleLeftover(policy, leftover);
        const kept = outcome.carriedOverRappen + outcome.toSavingsRappen;
        expect(kept === leftover || (policy === 'reset' && kept === 0)).toBe(true);
        expect(Object.is(outcome.toSavingsRappen, -0)).toBe(false);
      }
    }
  });

  it('normalises an empty leftover', () => {
    for (const policy of LEFTOVER_POLICIES) {
      const outcome = settleLeftover(policy, -0);
      expect(Object.is(outcome.leftoverRappen, 0)).toBe(true);
      expect(Object.is(outcome.carriedOverRappen, 0)).toBe(true);
      expect(Object.is(outcome.toSavingsRappen, 0)).toBe(true);
    }
  });

  it('rejects amounts that are not Rappen', () => {
    expect(() => settleLeftover('rollover', 12.5)).toThrow(/leftover/);
    expect(() => settleLeftover('savings', MAX_ABS_RAPPEN + 1)).toThrow(RangeError);
  });

  it('rejects unknown policies', () => {
    expect(() => settleLeftover('donate' as LeftoverPolicy, 100)).toThrow(/unknown leftover policy/);
  });
});
