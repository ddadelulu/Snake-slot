import { describe, expect, it } from 'vitest';

import { DEFAULT_CATEGORY_KEYS, type DefaultCategoryKey } from '../constants';
import { MAX_ABS_RAPPEN, chf, floorDiv } from '../money';
import {
  CATEGORY_WEIGHTS,
  CUSTOM_CATEGORY_WEIGHT,
  DEFAULT_SUGGESTION_STEP_RAPPEN,
  suggestBudgets,
  type SuggestionCategory,
} from './suggest';

const defaults = (...keys: DefaultCategoryKey[]): SuggestionCategory[] =>
  keys.map((key) => ({ id: key, defaultKey: key }));
const custom = (id: string): SuggestionCategory => ({ id, defaultKey: null });
const allDefaults = defaults(...DEFAULT_CATEGORY_KEYS);

const amounts = (input: Parameters<typeof suggestBudgets>[0]) =>
  Object.fromEntries(suggestBudgets(input).map(({ id, amountRappen }) => [id, amountRappen]));

describe('weights', () => {
  it('gives every default category a weight, summing to 100', () => {
    expect(Object.keys(CATEGORY_WEIGHTS).sort()).toEqual([...DEFAULT_CATEGORY_KEYS].sort());
    expect(Object.values(CATEGORY_WEIGHTS).reduce((sum, weight) => sum + weight, 0)).toBe(100);
    expect(CUSTOM_CATEGORY_WEIGHT).toBe(8);
    expect(DEFAULT_SUGGESTION_STEP_RAPPEN).toBe(chf(5));
  });

  it('cannot be changed at runtime', () => {
    expect(Object.isFrozen(CATEGORY_WEIGHTS)).toBe(true);
  });
});

describe('suggestBudgets', () => {
  it('splits CHF 3’575 over the ten default categories in CHF 5 steps', () => {
    // 715 steps; the floors give 711 and the 4 steps left go to the largest remainders:
    // eating_out and other (0.80 each), personal_care (0.75) and gifts (0.60).
    expect(amounts({ spendableRappen: chf(3575), categories: allDefaults })).toEqual({
      groceries: chf(1000),
      eating_out: chf(430),
      clothes: chf(250),
      going_out: chf(320),
      transport: chf(285),
      hobbies: chf(285),
      personal_care: chf(180),
      gifts: chf(145),
      shopping_electronics: chf(250),
      other: chf(430),
    });
  });

  it('keeps the input order and ids', () => {
    const categories = [custom('c-climbing'), ...defaults('other', 'groceries')];
    expect(suggestBudgets({ spendableRappen: chf(1000), categories }).map(({ id }) => id)).toEqual([
      'c-climbing',
      'other',
      'groceries',
    ]);
  });

  it('weighs a custom category like a mid-sized default one', () => {
    // Weights 28 + 8 + 8 = 44; 2'200 / 5 = 440 steps → 280, 80, 80.
    expect(
      amounts({
        spendableRappen: chf(2200),
        categories: [...defaults('groceries'), custom('climbing'), custom('dog')],
      }),
    ).toEqual({ groceries: chf(1400), climbing: chf(400), dog: chf(400) });
  });

  it('breaks remainder ties by weight first, then by position', () => {
    // Weights 4 and 12 with 2 steps: shares 0.5 and 1.5, equal remainders → the heavier wins.
    expect(
      suggestBudgets({ spendableRappen: chf(10), categories: defaults('gifts', 'eating_out') }),
    ).toEqual([
      { id: 'gifts', amountRappen: 0 },
      { id: 'eating_out', amountRappen: chf(10) },
    ]);
    // Three equal custom categories and 2 steps: the first two get one each.
    expect(
      suggestBudgets({
        spendableRappen: chf(10),
        categories: [custom('a'), custom('b'), custom('c')],
      }),
    ).toEqual([
      { id: 'a', amountRappen: chf(5) },
      { id: 'b', amountRappen: chf(5) },
      { id: 'c', amountRappen: 0 },
    ]);
    // One step for all defaults: the largest share (groceries) gets it.
    expect(amounts({ spendableRappen: chf(5), categories: allDefaults }).groceries).toBe(chf(5));
  });

  it('suggests nothing when the money does not reach one step', () => {
    for (const spendableRappen of [1, 499]) {
      expect(suggestBudgets({ spendableRappen, categories: allDefaults })).toEqual(
        allDefaults.map(({ id }) => ({ id, amountRappen: 0 })),
      );
    }
  });

  it('suggests nothing when there is nothing to split', () => {
    for (const spendableRappen of [0, -1, chf(-300), -MAX_ABS_RAPPEN]) {
      const result = suggestBudgets({ spendableRappen, categories: allDefaults });
      expect(result.every(({ amountRappen }) => Object.is(amountRappen, 0))).toBe(true);
    }
    expect(suggestBudgets({ spendableRappen: chf(3575), categories: [] })).toEqual([]);
  });

  it('accepts other step sizes', () => {
    const categories = defaults('groceries', 'other');
    // 3'575 steps: 2'502.5 and 1'072.5, equal remainders → the heavier groceries get the last.
    expect(amounts({ spendableRappen: chf(3575), categories, stepRappen: 100 })).toEqual({
      groceries: chf(2503),
      other: chf(1072),
    });
    expect(amounts({ spendableRappen: 101, categories, stepRappen: 1 })).toEqual({
      groceries: 71,
      other: 30,
    });
  });

  it('rejects invalid steps', () => {
    for (const stepRappen of [0, -500, 2.5, Number.NaN, MAX_ABS_RAPPEN + 1]) {
      expect(() =>
        suggestBudgets({ spendableRappen: chf(3575), categories: allDefaults, stepRappen }),
      ).toThrow(/step must be/);
    }
  });

  it('rejects duplicate ids, unknown default keys and invalid amounts', () => {
    expect(() =>
      suggestBudgets({ spendableRappen: 0, categories: [custom('x'), custom('x')] }),
    ).toThrow(/duplicate category id "x"/);
    expect(() =>
      suggestBudgets({
        spendableRappen: chf(100),
        categories: [{ id: 'x', defaultKey: 'toString' as DefaultCategoryKey }],
      }),
    ).toThrow(/unknown default category "toString"/);
    expect(() => suggestBudgets({ spendableRappen: 12.5, categories: allDefaults })).toThrow(
      /spendable/,
    );
  });

  it('always sums to the whole steps of the spendable money, in whole steps', () => {
    const categorySets: SuggestionCategory[][] = [
      allDefaults,
      defaults('groceries'),
      defaults('groceries', 'transport', 'gifts'),
      [...defaults('clothes', 'hobbies'), custom('climbing'), custom('dog'), custom('kids')],
      Array.from({ length: 25 }, (_, index) => custom(`c${index}`)),
    ];
    const spendables = [
      ...Array.from({ length: 400 }, (_, index) => index * 1_237),
      chf(3575),
      chf(3575) + 499,
      1_234_567_891,
      MAX_ABS_RAPPEN,
    ];
    for (const categories of categorySets) {
      const totalWeight = categories
        .map(({ defaultKey }) =>
          defaultKey === null ? CUSTOM_CATEGORY_WEIGHT : CATEGORY_WEIGHTS[defaultKey],
        )
        .reduce((sum, weight) => sum + weight, 0);
      for (const stepRappen of [DEFAULT_SUGGESTION_STEP_RAPPEN, 100, 1, 2_000]) {
        for (const spendableRappen of spendables) {
          const result = suggestBudgets({ spendableRappen, categories, stepRappen });
          const totalSteps = floorDiv(spendableRappen, stepRappen);
          expect(result.map(({ id }) => id)).toEqual(categories.map(({ id }) => id));
          expect(result.reduce((sum, { amountRappen }) => sum + amountRappen, 0)).toBe(
            totalSteps * stepRappen,
          );
          result.forEach(({ amountRappen }, index) => {
            const category = categories[index]!;
            const weight =
              category.defaultKey === null
                ? CUSTOM_CATEGORY_WEIGHT
                : CATEGORY_WEIGHTS[category.defaultKey];
            const steps = amountRappen / stepRappen;
            expect(Number.isInteger(steps)).toBe(true);
            // Largest remainder: every share is its exact share rounded down or up.
            const floor = floorDiv(totalSteps * weight, totalWeight);
            expect(steps === floor || steps === floor + 1).toBe(true);
          });
        }
      }
    }
  });
});
