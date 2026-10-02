import { assertRappen, floorDiv, type Rappen } from '../money';
import { multiplyExact } from './integer';

/** The profile's `weekly_work_minutes` allows at most 112 hours (the same CHECK as the database). */
export const MAX_WEEKLY_WORK_MINUTES = 6720;

const WEEKS_PER_YEAR = 52;
const MONTHS_PER_YEAR = 12;

export type WorkIncome = {
  /** Monthly net income. */
  netIncomeRappen: Rappen | null;
  weeklyWorkMinutes: number | null;
};

/**
 * "= X hours of work" (spec: amount ÷ hourly income). A month has weeklyMinutes × 52 / 12 minutes
 * of work, so an amount costs |amount| × weeklyMinutes × 52 / (netIncome × 12) minutes, rounded
 * half up with integer arithmetic. Refunds count like purchases. Null when the income or the
 * working time is missing or not positive: then the app shows no hours.
 */
export function minutesOfWork(amountRappen: Rappen, income: WorkIncome): number | null {
  const amount = Math.abs(assertRappen(amountRappen, 'amount'));
  const { netIncomeRappen, weeklyWorkMinutes } = income;
  if (netIncomeRappen === null || weeklyWorkMinutes === null) return null;
  assertRappen(netIncomeRappen, 'net income');
  if (!Number.isSafeInteger(weeklyWorkMinutes) || weeklyWorkMinutes > MAX_WEEKLY_WORK_MINUTES) {
    throw new RangeError(`weekly work minutes must be an integer up to ${MAX_WEEKLY_WORK_MINUTES}`);
  }
  if (netIncomeRappen <= 0 || weeklyWorkMinutes <= 0) return null;

  // At most 10^10 × 6720 × 52 ≈ 3.5 × 10^15: inside the safe integer range, checked anyway.
  const numerator = multiplyExact(multiplyExact(amount, weeklyWorkMinutes), WEEKS_PER_YEAR);
  const denominator = multiplyExact(netIncomeRappen, MONTHS_PER_YEAR);
  const minutes = floorDiv(numerator, denominator);
  const remainder = numerator - minutes * denominator;
  return remainder * 2 >= denominator ? minutes + 1 : minutes;
}
