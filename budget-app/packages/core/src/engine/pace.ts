import { assertRappen, type Rappen } from '../money';
import { addDays, type LocalDate } from './dates';
import { ceilDiv, assertNonNegativeRappen, multiplyExact } from './integer';
import { dayOfPeriod, periodLength, type Period } from './period';

/**
 * Pace forecast (spec: "date when a category or the total runs out at the current rate"), also
 * behind the `pace` alert (spec section 9). The rate is today's average daily spending.
 *
 * - no_spending: nothing (or only refunds) spent yet, so there is no rate.
 * - exhausted: the budget is already used up.
 * - on_track: at this rate the budget lasts until payday.
 * - runs_out: at this rate the budget is used up on `on`, before payday.
 */
export type PaceForecast =
  | { kind: 'no_spending' }
  | { kind: 'on_track' }
  | { kind: 'runs_out'; on: LocalDate }
  | { kind: 'exhausted' };

export type PaceInput = {
  budgetRappen: Rappen;
  /** Net spending so far this period (refunds subtract, so it may be negative). */
  spentRappen: Rappen;
  period: Period;
  today: LocalDate;
};

/**
 * After `elapsed` days (today included) the average is spent / elapsed per day, so spending
 * reaches the budget on day ceil(budget × elapsed / spent) of the period. A run-out day after the
 * period's last day means the money lasts until payday.
 */
export function forecastPace(input: PaceInput): PaceForecast {
  const budget = assertNonNegativeRappen(input.budgetRappen, 'budget');
  const spent = assertRappen(input.spentRappen, 'spent');
  const elapsed = dayOfPeriod(input.today, input.period);
  if (spent <= 0) return { kind: 'no_spending' };
  if (spent >= budget) return { kind: 'exhausted' };
  const runOutDay = ceilDiv(multiplyExact(budget, elapsed), spent);
  if (runOutDay > periodLength(input.period)) return { kind: 'on_track' };
  return { kind: 'runs_out', on: addDays(input.period.startsOn, runOutDay - 1) };
}
