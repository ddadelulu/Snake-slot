import type { DefaultCategoryKey } from '../constants';
import { assertRappen, floorDiv, isRappen, type Rappen } from '../money';
import { multiplyExact } from './integer';

/**
 * The budget split suggested during onboarding (spec section 3, step 5), rules-based until the
 * assistant refines it (M5). Weights are shares of the spendable money and sum to 100 for the
 * default categories; a custom category weighs like a mid-sized default one.
 */
export const CATEGORY_WEIGHTS: Readonly<Record<DefaultCategoryKey, number>> = Object.freeze({
  groceries: 28,
  eating_out: 12,
  clothes: 7,
  going_out: 9,
  transport: 8,
  hobbies: 8,
  personal_care: 5,
  gifts: 4,
  shopping_electronics: 7,
  other: 12,
});

export const CUSTOM_CATEGORY_WEIGHT = 8;

/** Suggestions are whole multiples of CHF 5, so the sliders start on round numbers. */
export const DEFAULT_SUGGESTION_STEP_RAPPEN = 500;

export type SuggestionCategory = { id: string; defaultKey: DefaultCategoryKey | null };

export type SuggestBudgetsInput = {
  spendableRappen: Rappen;
  categories: readonly SuggestionCategory[];
  stepRappen?: number;
};

export type BudgetSuggestion = { id: string; amountRappen: Rappen };

function weightOf(category: SuggestionCategory): number {
  if (category.defaultKey === null) return CUSTOM_CATEGORY_WEIGHT;
  if (!Object.hasOwn(CATEGORY_WEIGHTS, category.defaultKey)) {
    throw new RangeError(`unknown default category "${String(category.defaultKey)}"`);
  }
  return CATEGORY_WEIGHTS[category.defaultKey];
}

/**
 * Splits the spendable money by weight in whole steps (largest-remainder method): every category
 * gets floor(steps × weight / total weight) steps, and the steps left over go one each to the
 * largest remainders (ties: higher weight first, then earlier position). The result keeps the
 * input order, every amount is a multiple of the step, and the sum is exactly the number of whole
 * steps in the spendable money. Nothing to split (spendable ≤ 0) gives 0 everywhere.
 */
export function suggestBudgets(input: SuggestBudgetsInput): BudgetSuggestion[] {
  const spendable = assertRappen(input.spendableRappen, 'spendable');
  const step = input.stepRappen ?? DEFAULT_SUGGESTION_STEP_RAPPEN;
  if (!isRappen(step) || step <= 0) {
    throw new RangeError('step must be a positive integer number of Rappen');
  }
  const ids = new Set<string>();
  for (const { id } of input.categories) {
    if (ids.has(id)) throw new RangeError(`duplicate category id "${id}"`);
    ids.add(id);
  }
  const weighted = input.categories.map((category) => ({
    id: category.id,
    weight: weightOf(category),
  }));

  if (spendable <= 0 || weighted.length === 0) {
    return weighted.map(({ id }) => ({ id, amountRappen: 0 }));
  }

  const totalSteps = floorDiv(spendable, step);
  const totalWeight = weighted.reduce((sum, { weight }) => sum + weight, 0);
  const shares = weighted.map(({ id, weight }, index) => {
    const exact = multiplyExact(totalSteps, weight);
    const steps = floorDiv(exact, totalWeight);
    return { id, index, weight, steps, remainder: exact - steps * totalWeight };
  });

  // Each remainder is below the total weight, so fewer steps are left than there are categories.
  const leftOver = totalSteps - shares.reduce((sum, share) => sum + share.steps, 0);
  const byRemainder = [...shares].sort(
    (a, b) => b.remainder - a.remainder || b.weight - a.weight || a.index - b.index,
  );
  for (const share of byRemainder.slice(0, leftOver)) share.steps += 1;

  return shares.map(({ id, steps }) => ({ id, amountRappen: steps * step }));
}
