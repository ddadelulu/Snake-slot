import { assertRappen, floorDiv, type Rappen } from './money';

/**
 * Spec section 5: category bars are green, turn orange at 80 % and red at 100 % of the budget.
 * All comparisons are integer arithmetic on Rappen.
 */
export type BudgetStatus = 'ok' | 'warning' | 'danger';

export const WARNING_AT_PERCENT = 80;
export const DANGER_AT_PERCENT = 100;

export function budgetStatus(spent: Rappen, budget: Rappen): BudgetStatus {
  assertRappen(spent, 'spent');
  assertRappen(budget, 'budget');
  if (spent <= 0) return 'ok';
  if (budget <= 0) return 'danger';
  if (spent * 100 >= budget * DANGER_AT_PERCENT) return 'danger';
  if (spent * 100 >= budget * WARNING_AT_PERCENT) return 'warning';
  return 'ok';
}

/** How full the bar is, in thousandths (0..1000), for drawing. Over budget is a full bar. */
export function progressPermille(spent: Rappen, budget: Rappen): number {
  assertRappen(spent, 'spent');
  assertRappen(budget, 'budget');
  if (spent <= 0) return 0;
  if (budget <= 0) return 1000;
  return Math.min(1000, floorDiv(spent * 1000, budget));
}
