import { assertRappen, floorDiv, type Rappen } from '../money';

/**
 * Integer helpers for the budget engine. Money is integer Rappen (spec section 2), so every
 * division rounds explicitly and every product is checked instead of silently losing precision.
 */

/** Exact ceiling division of safe integers, the counterpart of `floorDiv`. */
export function ceilDiv(a: number, b: number): number {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || b === 0) {
    throw new RangeError('ceilDiv() takes safe integers and a non-zero divisor');
  }
  const q = -floorDiv(-a, b);
  return q === 0 ? 0 : q;
}

/** Product of safe integers; throws instead of returning a rounded result. */
export function multiplyExact(a: number, b: number): number {
  const product = a * b;
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || !Number.isSafeInteger(product)) {
    throw new RangeError('multiplyExact() takes safe integers whose product is a safe integer');
  }
  return product === 0 ? 0 : product;
}

/**
 * Budgets, fixed costs, income and savings are never negative (the database has the same CHECK
 * constraints); amounts that may be negative, such as spending net of refunds, use `assertRappen`.
 */
export function assertNonNegativeRappen(value: number, label = 'amount'): Rappen {
  const amount = assertRappen(value, label);
  if (amount < 0) throw new RangeError(`${label} must not be negative`);
  return amount;
}
