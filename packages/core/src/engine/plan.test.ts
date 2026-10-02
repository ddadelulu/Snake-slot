import { describe, expect, it } from 'vitest';

import { MAX_ABS_RAPPEN, chf } from '../money';
import { checkAllocation, spendableOf, sumFixedCosts } from './plan';

// A typical Zurich month: CHF 6'500 net, rent 1'850, health insurance 420, phone 65, ZVV 90.
const fixedCosts = [
  { amountRappen: chf(1850) },
  { amountRappen: chf(420), active: true },
  { amountRappen: chf(65) },
  { amountRappen: chf(90) },
];

describe('sumFixedCosts', () => {
  it('adds the active fixed costs', () => {
    expect(sumFixedCosts(fixedCosts)).toBe(chf(2425));
    expect(sumFixedCosts([])).toBe(0);
  });

  it('leaves out paused fixed costs', () => {
    expect(sumFixedCosts([...fixedCosts, { amountRappen: chf(39, 90), active: false }])).toBe(
      chf(2425),
    );
    expect(sumFixedCosts([{ amountRappen: chf(120), active: false }])).toBe(0);
  });

  it('rejects negative, fractional or oversized amounts, paused ones included', () => {
    expect(() => sumFixedCosts([{ amountRappen: -100 }])).toThrow(/fixed cost 0 must not be/);
    expect(() => sumFixedCosts([{ amountRappen: 100 }, { amountRappen: 0.5 }])).toThrow(
      /fixed cost 1/,
    );
    expect(() => sumFixedCosts([{ amountRappen: -100, active: false }])).toThrow(RangeError);
    expect(() =>
      sumFixedCosts([{ amountRappen: MAX_ABS_RAPPEN }, { amountRappen: MAX_ABS_RAPPEN }]),
    ).toThrow(/fixed costs must be/);
  });
});

describe('spendableOf', () => {
  it('is income minus fixed costs minus savings', () => {
    expect(
      spendableOf({
        incomeRappen: chf(6500),
        fixedCostsRappen: chf(2425),
        savingsRappen: chf(500),
      }),
    ).toBe(chf(3575));
  });

  it('adds what the previous period carried over, a deficit included', () => {
    const plan = { incomeRappen: chf(6500), fixedCostsRappen: chf(2425), savingsRappen: chf(500) };
    expect(spendableOf({ ...plan, carriedOverRappen: chf(120, 50) })).toBe(chf(3695, 50));
    expect(spendableOf({ ...plan, carriedOverRappen: chf(-80) })).toBe(chf(3495));
    expect(spendableOf({ ...plan, carriedOverRappen: 0 })).toBe(chf(3575));
  });

  it('may be negative when fixed costs and savings exceed the income', () => {
    expect(
      spendableOf({
        incomeRappen: chf(3000),
        fixedCostsRappen: chf(2800),
        savingsRappen: chf(500),
      }),
    ).toBe(chf(-300));
    expect(spendableOf({ incomeRappen: 0, fixedCostsRappen: 0, savingsRappen: 0 })).toBe(0);
  });

  it('rejects invalid inputs', () => {
    const plan = { incomeRappen: chf(6500), fixedCostsRappen: chf(2425), savingsRappen: chf(500) };
    expect(() => spendableOf({ ...plan, incomeRappen: 6500.5 })).toThrow(/income/);
    expect(() => spendableOf({ ...plan, incomeRappen: -1 })).toThrow(/income must not be/);
    expect(() => spendableOf({ ...plan, fixedCostsRappen: -1 })).toThrow(/fixed costs/);
    expect(() => spendableOf({ ...plan, savingsRappen: -1 })).toThrow(/savings/);
    expect(() => spendableOf({ ...plan, carriedOverRappen: 0.5 })).toThrow(/carried over/);
  });

  it('throws when the result leaves the Rappen range', () => {
    expect(() =>
      spendableOf({
        incomeRappen: MAX_ABS_RAPPEN,
        fixedCostsRappen: 0,
        savingsRappen: 0,
        carriedOverRappen: 1,
      }),
    ).toThrow(/spendable/);
    expect(() =>
      spendableOf({
        incomeRappen: 0,
        fixedCostsRappen: MAX_ABS_RAPPEN,
        savingsRappen: 1,
      }),
    ).toThrow(/spendable/);
    expect(
      spendableOf({ incomeRappen: MAX_ABS_RAPPEN, fixedCostsRappen: 0, savingsRappen: 0 }),
    ).toBe(MAX_ABS_RAPPEN);
  });
});

describe('checkAllocation', () => {
  it('reports money not yet given to a category', () => {
    expect(checkAllocation(chf(3575), [chf(1000), chf(430), chf(250)])).toEqual({
      spendableRappen: chf(3575),
      allocatedRappen: chf(1680),
      unallocatedRappen: chf(1895),
      status: 'under',
    });
  });

  it('is exact when every franc has a job', () => {
    expect(checkAllocation(chf(3575), [chf(3000), chf(575)])).toEqual({
      spendableRappen: chf(3575),
      allocatedRappen: chf(3575),
      unallocatedRappen: 0,
      status: 'exact',
    });
    expect(checkAllocation(0, []).status).toBe('exact');
    expect(checkAllocation(0, [0, 0]).status).toBe('exact');
  });

  it('warns when the budgets exceed the money available', () => {
    expect(checkAllocation(chf(3575), [chf(3000), chf(575), 5])).toEqual({
      spendableRappen: chf(3575),
      allocatedRappen: chf(3575, 5),
      unallocatedRappen: -5,
      status: 'over',
    });
    // With negative spendable money even no budgets at all is too much.
    expect(checkAllocation(chf(-300), [])).toEqual({
      spendableRappen: chf(-300),
      allocatedRappen: 0,
      unallocatedRappen: chf(-300),
      status: 'over',
    });
  });

  it('rejects negative or fractional budgets and invalid spendable money', () => {
    expect(() => checkAllocation(chf(3575), [chf(100), -1])).toThrow(/budget 1 must not be/);
    expect(() => checkAllocation(chf(3575), [12.5])).toThrow(/budget 0/);
    expect(() => checkAllocation(3575.5, [])).toThrow(/spendable/);
  });

  it('throws when the totals leave the Rappen range', () => {
    expect(() => checkAllocation(0, [MAX_ABS_RAPPEN, 1])).toThrow(/allocated/);
    expect(() => checkAllocation(-MAX_ABS_RAPPEN, [1])).toThrow(/unallocated/);
  });
});
