import { assertRappen, sumRappen, type Rappen } from '../money';
import { assertNonNegativeRappen } from './integer';

/**
 * The month plan from onboarding (spec section 3) and the `budget_periods` snapshot: what comes
 * in, what is fixed, what is saved first, and what the previous period carried over.
 */
export type PlanInput = {
  incomeRappen: Rappen;
  fixedCostsRappen: Rappen;
  savingsRappen: Rappen;
  /** Rollover policy only (spec section 4); negative when a deficit was carried. Default 0. */
  carriedOverRappen?: Rappen;
};

/**
 * Money available for the categories (spec section 3, summary "Your month"): income minus fixed
 * costs minus savings plus the carried-over amount. Negative when the fixed part already exceeds
 * the income; the app shows that instead of hiding it.
 */
export function spendableOf(plan: PlanInput): Rappen {
  const income = assertNonNegativeRappen(plan.incomeRappen, 'income');
  const fixedCosts = assertNonNegativeRappen(plan.fixedCostsRappen, 'fixed costs');
  const savings = assertNonNegativeRappen(plan.savingsRappen, 'savings');
  const carriedOver = assertRappen(plan.carriedOverRappen ?? 0, 'carried over');
  return assertRappen(income - fixedCosts - savings + carriedOver, 'spendable');
}

/** Total of the fixed costs that count this month; paused ones (`active: false`) do not. */
export function sumFixedCosts(costs: readonly { amountRappen: Rappen; active?: boolean }[]): Rappen {
  const counted = costs
    .map((cost, index) => ({
      amount: assertNonNegativeRappen(cost.amountRappen, `fixed cost ${index}`),
      active: cost.active !== false,
    }))
    .filter((cost) => cost.active)
    .map((cost) => cost.amount);
  return assertRappen(sumRappen(counted), 'fixed costs');
}

export type AllocationStatus = 'under' | 'exact' | 'over';

export type AllocationCheck = {
  spendableRappen: Rappen;
  allocatedRappen: Rappen;
  /** Spendable minus allocated; negative when the budgets ask for more than there is. */
  unallocatedRappen: Rappen;
  status: AllocationStatus;
};

/**
 * Compares the category budgets with the spendable money (spec section 3, step 5): the split
 * screen warns when the total exceeds the money available ('over').
 */
export function checkAllocation(
  spendableRappen: Rappen,
  budgetsRappen: readonly Rappen[],
): AllocationCheck {
  const spendable = assertRappen(spendableRappen, 'spendable');
  const budgets = budgetsRappen.map((budget, index) =>
    assertNonNegativeRappen(budget, `budget ${index}`),
  );
  const allocated = assertRappen(sumRappen(budgets), 'allocated');
  const unallocated = assertRappen(spendable - allocated, 'unallocated');
  const status = allocated > spendable ? 'over' : allocated === spendable ? 'exact' : 'under';
  return {
    spendableRappen: spendable,
    allocatedRappen: allocated,
    unallocatedRappen: unallocated,
    status,
  };
}
