import { RAPPEN_PER_FRANC, floorDiv, parseChf, type Rappen } from '@budget/core';

export type AmountProblem = 'required' | 'invalid';

export type AmountCheck = { ok: true; rappen: Rappen } | { ok: false; problem: AmountProblem };

/**
 * A positive amount as a person types it ("12.50", "12,50", "1'240", "12.–"), in Rappen and
 * without floating point (parseChf). Whether it is money out or in is decided elsewhere (the
 * "Money in" switch, the transaction's sign), so a typed sign or zero is refused.
 */
export function parseAmountInput(text: string): AmountCheck {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: false, problem: 'required' };
  if (/^[-−+]/.test(trimmed)) return { ok: false, problem: 'invalid' };
  const rappen = parseChf(trimmed);
  if (rappen === null || rappen <= 0) return { ok: false, problem: 'invalid' };
  return { ok: true, rappen };
}

/** The size of an amount as an editable text without grouping, e.g. -124050 → "1240.50". */
export function rappenToInput(amount: Rappen): string {
  const abs = Math.abs(amount);
  const francs = floorDiv(abs, RAPPEN_PER_FRANC);
  const cents = abs - francs * RAPPEN_PER_FRANC;
  return `${francs}.${String(cents).padStart(2, '0')}`;
}
