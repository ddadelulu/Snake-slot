import type { LeftoverPolicy } from '../constants';
import { assertRappen, type Rappen } from '../money';

/**
 * What happens to the money left when a period closes on payday (spec section 4). The database
 * applies the same rule in `private.settle_leftover`; a parity test keeps both in step.
 *
 * - rollover: the whole result moves into the next period, a deficit included.
 * - savings: money left over goes to savings; a deficit is not carried (fresh start).
 * - reset: every period starts fresh.
 */
export type LeftoverOutcome = {
  leftoverRappen: Rappen;
  policy: LeftoverPolicy;
  carriedOverRappen: Rappen;
  toSavingsRappen: Rappen;
};

export function settleLeftover(policy: LeftoverPolicy, leftover: Rappen): LeftoverOutcome {
  const leftoverRappen = assertRappen(leftover, 'leftover');
  switch (policy) {
    case 'rollover':
      return { leftoverRappen, policy, carriedOverRappen: leftoverRappen, toSavingsRappen: 0 };
    case 'savings':
      return {
        leftoverRappen,
        policy,
        carriedOverRappen: 0,
        toSavingsRappen: Math.max(0, leftoverRappen),
      };
    case 'reset':
      return { leftoverRappen, policy, carriedOverRappen: 0, toSavingsRappen: 0 };
    default:
      throw new RangeError(`unknown leftover policy "${String(policy)}"`);
  }
}
