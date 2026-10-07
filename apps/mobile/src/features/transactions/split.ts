import type { Rappen } from '@budget/core';

import type { TransactionSplit } from '@/data/transactions';

import { parseAmountInput, rappenToInput, type AmountProblem } from './amount';

/**
 * A split while the person edits it (quick add and transaction detail). Amounts are typed as
 * positive numbers; the transaction's sign is applied when the parts are sent, because the
 * database wants every part with the same sign as the transaction and an exact sum.
 */
export type SplitDraftPart = {
  key: string;
  categoryId: string | null;
  amountText: string;
  /** A part's own note (kept as it was; the editors do not change it). */
  note: string | null;
};

export const MIN_SPLIT_PARTS = 2;

let lastKey = 0;

export function newSplitPart(
  categoryId: string | null = null,
  amountText = '',
  note: string | null = null,
): SplitDraftPart {
  lastKey += 1;
  return { key: `part-${lastKey}`, categoryId, amountText, note };
}

/** The parts a new split starts with: the transaction's category (if any) goes into the first. */
export function startSplit(categoryId: string | null): SplitDraftPart[] {
  return [newSplitPart(categoryId), newSplitPart()];
}

/** An existing split, ready to edit. */
export function partsFromSplits(splits: readonly TransactionSplit[]): SplitDraftPart[] {
  return splits.map((part) =>
    newSplitPart(part.categoryId, rappenToInput(part.amountRappen), part.note),
  );
}

export function updatePart(
  parts: readonly SplitDraftPart[],
  key: string,
  change: Partial<Omit<SplitDraftPart, 'key'>>,
): SplitDraftPart[] {
  return parts.map((part) => (part.key === key ? { ...part, ...change } : part));
}

/** Removes a part, never going below the minimum of two. */
export function removePart(parts: readonly SplitDraftPart[], key: string): SplitDraftPart[] {
  if (parts.length <= MIN_SPLIT_PARTS) return [...parts];
  return parts.filter((part) => part.key !== key);
}

/** What the parts typed so far add up to (parts that cannot be read count as nothing yet). */
export function assignedRappen(parts: readonly SplitDraftPart[]): Rappen {
  return parts.reduce((sum, part) => {
    const amount = parseAmountInput(part.amountText);
    return amount.ok ? sum + amount.rappen : sum;
  }, 0);
}

/** Left to assign: positive while parts are missing, negative when they are more than the total. */
export function remainingRappen(totalAbs: Rappen, parts: readonly SplitDraftPart[]): Rappen {
  return totalAbs - assignedRappen(parts);
}

export type SplitPartProblem = { category?: 'required'; amount?: AmountProblem };

export type SplitProblem = 'too_few' | 'parts' | 'not_exact';

export type CheckedSplitPart = { categoryId: string; amountRappen: Rappen; note: string | null };

export type SplitCheck =
  | { ok: true; parts: CheckedSplitPart[] }
  | { ok: false; problem: SplitProblem; partProblems: Record<string, SplitPartProblem> };

/**
 * Checks a split against the transaction's amount (`totalAbs`, positive) and returns the parts
 * with the transaction's sign: at least two, each with a category and an amount above zero,
 * adding up exactly.
 */
export function checkSplit(
  totalAbs: Rappen,
  sign: 1 | -1,
  parts: readonly SplitDraftPart[],
): SplitCheck {
  const partProblems: Record<string, SplitPartProblem> = {};
  const checked: CheckedSplitPart[] = [];
  for (const part of parts) {
    const problem: SplitPartProblem = {};
    const amount = parseAmountInput(part.amountText);
    if (part.categoryId === null) problem.category = 'required';
    if (!amount.ok) problem.amount = amount.problem;
    if (problem.category || problem.amount) partProblems[part.key] = problem;
    else if (part.categoryId !== null && amount.ok) {
      checked.push({
        categoryId: part.categoryId,
        amountRappen: sign * amount.rappen,
        note: part.note,
      });
    }
  }
  if (parts.length < MIN_SPLIT_PARTS) return { ok: false, problem: 'too_few', partProblems };
  if (Object.keys(partProblems).length > 0) return { ok: false, problem: 'parts', partProblems };
  if (remainingRappen(totalAbs, parts) !== 0) {
    return { ok: false, problem: 'not_exact', partProblems };
  }
  return { ok: true, parts: checked };
}
