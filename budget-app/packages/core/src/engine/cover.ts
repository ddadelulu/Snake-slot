import { assertRappen, isRappen, type Rappen } from '../money';
import { assertNonNegativeRappen } from './integer';

export type CoverSide = { budgetRappen: Rappen; spentRappen: Rappen };

export type CoverOverspendInput = {
  /** The category that gives money. */
  from: CoverSide;
  /** The category that receives it, usually an overspent one. */
  to: CoverSide;
  /** How much to move; when absent, as much of the overspend as `from` can give. */
  amountRappen?: Rappen;
};

export type CoverOverspendResult =
  | { ok: true; movedRappen: Rappen; fromBudgetRappen: Rappen; toBudgetRappen: Rappen }
  | { ok: false; reason: 'not_overspent' | 'nothing_available' | 'invalid_amount' };

/**
 * Covers overspending from another category (spec: "Overspending allowed … option to cover it
 * from another category (with confirmation)"). The giving category keeps at least what was
 * already spent from it, and never goes below 0: refunds do not make more than its budget
 * available. The result is the new pair of budgets for the person to confirm.
 *
 * Without an amount, `to` must be overspent and receives min(overspend, available). With an
 * amount, any positive whole number of Rappen up to the available money may move.
 */
export function coverOverspend(input: CoverOverspendInput): CoverOverspendResult {
  const fromBudget = assertNonNegativeRappen(input.from.budgetRappen, 'from budget');
  const fromSpent = assertRappen(input.from.spentRappen, 'from spent');
  const toBudget = assertNonNegativeRappen(input.to.budgetRappen, 'to budget');
  const toSpent = assertRappen(input.to.spentRappen, 'to spent');
  const available = Math.max(0, fromBudget - Math.max(0, fromSpent));

  let moved: Rappen;
  if (input.amountRappen === undefined) {
    if (toSpent <= toBudget) return { ok: false, reason: 'not_overspent' };
    if (available === 0) return { ok: false, reason: 'nothing_available' };
    moved = Math.min(toSpent - toBudget, available);
  } else {
    if (available === 0) return { ok: false, reason: 'nothing_available' };
    const amount = input.amountRappen;
    if (!isRappen(amount) || amount <= 0 || amount > available) {
      return { ok: false, reason: 'invalid_amount' };
    }
    moved = amount;
  }

  return {
    ok: true,
    movedRappen: moved,
    fromBudgetRappen: fromBudget - moved,
    toBudgetRappen: assertRappen(toBudget + moved, 'to budget after the cover'),
  };
}
