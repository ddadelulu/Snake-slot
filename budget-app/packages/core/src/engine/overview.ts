import { budgetStatus, progressPermille, type BudgetStatus } from '../budgetStatus';
import { assertRappen, floorDiv, sumRappen, type Rappen } from '../money';
import type { LocalDate } from './dates';
import { assertNonNegativeRappen } from './integer';
import { forecastPace, type PaceForecast } from './pace';
import { dayOfPeriod, daysUntilPayday, type Period } from './period';
import { spendableOf, type PlanInput } from './plan';

/**
 * Per-category totals as the database aggregates them for one period. The engine never sees
 * individual transactions.
 */
export type CategoryTotals = {
  categoryId: string;
  /** The period's budget amount plus its rollover. */
  budgetRappen: Rappen;
  /** Net spending: purchases minus refunds, so it may be negative. */
  spentRappen: Rappen;
};

export type OverviewInput = {
  period: Period;
  today: LocalDate;
  plan: PlanInput;
  categories: readonly CategoryTotals[];
  /** Purchases without a category yet (D-019: refunds count only with a category). */
  uncategorizedSpentRappen: Rappen;
};

export type CategoryOverview = CategoryTotals & {
  /** Budget minus spent; negative when the category is overspent. */
  remainingRappen: Rappen;
  /** How far over budget the category is (0 when it is not). */
  overspentRappen: Rappen;
  status: BudgetStatus;
  progressPermille: number;
  pace: PaceForecast;
};

export type Overview = {
  period: Period;
  today: LocalDate;
  spendableRappen: Rappen;
  /** Every category's net spending plus the uncategorized spending. */
  spentRappen: Rappen;
  /** Spendable minus spent: the big number, "CHF … left this month". */
  balanceRappen: Rappen;
  /** The balance shared out over the days until payday, today included; 0 without a balance. */
  dailyAllowanceRappen: Rappen;
  daysUntilPayday: number;
  dayOfPeriod: number;
  /** Spent against spendable, like a category bar; always 'danger' when the balance is negative. */
  status: BudgetStatus;
  pace: PaceForecast;
  /** In input order. */
  categories: CategoryOverview[];
};

function categoryOverview(
  totals: CategoryTotals,
  period: Period,
  today: LocalDate,
): CategoryOverview {
  const budget = assertNonNegativeRappen(totals.budgetRappen, `budget of ${totals.categoryId}`);
  const spent = assertRappen(totals.spentRappen, `spent in ${totals.categoryId}`);
  const remaining = assertRappen(budget - spent, `remaining in ${totals.categoryId}`);
  return {
    categoryId: totals.categoryId,
    budgetRappen: budget,
    spentRappen: spent,
    remainingRappen: remaining,
    overspentRappen: Math.max(0, -remaining),
    status: budgetStatus(spent, budget),
    progressPermille: progressPermille(spent, budget),
    pace: forecastPace({ budgetRappen: budget, spentRappen: spent, period, today }),
  };
}

/**
 * Everything the home screen shows for the current period, derived from the totals the database
 * computes. Overspending is allowed (spec) and shows as a negative remainder.
 *
 * The total's status and pace use the spendable money as their budget; when nothing is spendable
 * (spendable ≤ 0) any spending means the month's money is exhausted. A negative balance is always
 * 'danger', so the status agrees with the red number even before anything is spent.
 */
export function buildOverview(input: OverviewInput): Overview {
  const { period, today } = input;
  const daysLeft = daysUntilPayday(today, period);
  const day = dayOfPeriod(today, period);
  const spendable = spendableOf(input.plan);

  const seen = new Set<string>();
  const categories = input.categories.map((totals) => {
    if (seen.has(totals.categoryId)) {
      throw new RangeError(`duplicate category id "${totals.categoryId}"`);
    }
    seen.add(totals.categoryId);
    return categoryOverview(totals, period, today);
  });

  const uncategorized = assertRappen(input.uncategorizedSpentRappen, 'uncategorized spent');
  const spent = assertRappen(
    sumRappen([...categories.map((category) => category.spentRappen), uncategorized]),
    'spent',
  );
  const balance = assertRappen(spendable - spent, 'balance');
  const totalBudget = Math.max(0, spendable);

  return {
    period,
    today,
    spendableRappen: spendable,
    spentRappen: spent,
    balanceRappen: balance,
    dailyAllowanceRappen: balance > 0 ? floorDiv(balance, daysLeft) : 0,
    daysUntilPayday: daysLeft,
    dayOfPeriod: day,
    status: balance < 0 ? 'danger' : budgetStatus(spent, totalBudget),
    pace: forecastPace({ budgetRappen: totalBudget, spentRappen: spent, period, today }),
    categories,
  };
}
