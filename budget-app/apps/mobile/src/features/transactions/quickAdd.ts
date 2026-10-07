import {
  BASE_CURRENCY,
  addDays,
  toIngestRow,
  type IngestChoices,
  type IngestRow,
  type LocalDate,
  type SourceTransaction,
} from '@budget/core';

import { parseAmountInput, type AmountProblem } from './amount';
import {
  checkSplit,
  startSplit,
  type SplitDraftPart,
  type SplitPartProblem,
  type SplitProblem,
} from './split';

/**
 * Quick add (US-3.1): amount, one category tap, Save. Everything else is optional: money in,
 * where, a note, another day, a split.
 */

/** Today means "now" (the exact instant); any other day is a local date without a time. */
export type DayChoice = { kind: 'today' } | { kind: 'date'; date: LocalDate };

export type QuickAddForm = {
  amountText: string;
  /** A refund or other money coming in: stored as a positive amount. */
  moneyIn: boolean;
  categoryId: string | null;
  merchant: string;
  note: string;
  day: DayChoice;
  splitting: boolean;
  parts: SplitDraftPart[];
};

/** Limits of the database (docs/API.md, IngestRow). */
export const MERCHANT_MAX_LENGTH = 200;
export const NOTE_MAX_LENGTH = 500;

/** How far back "another day" reaches: yesterday and the 13 days before it. */
export const EARLIER_DAYS = 14;

export function initialQuickAdd(): QuickAddForm {
  return {
    amountText: '',
    moneyIn: false,
    categoryId: null,
    merchant: '',
    note: '',
    day: { kind: 'today' },
    splitting: false,
    parts: [],
  };
}

/** Turns the split on (starting from the chosen category) or off. */
export function setSplitting(form: QuickAddForm, splitting: boolean): QuickAddForm {
  if (!splitting) return { ...form, splitting: false };
  return {
    ...form,
    splitting: true,
    parts: form.parts.length > 0 ? form.parts : startSplit(form.categoryId),
  };
}

/** The days offered under "Another day", newest first: yesterday back to two weeks ago. */
export function earlierDays(today: LocalDate, count = EARLIER_DAYS): LocalDate[] {
  return Array.from({ length: count }, (_, index) => addDays(today, -(index + 1)));
}

export type QuickAddProblems = {
  amount?: AmountProblem;
  category?: 'required';
  split?: SplitProblem;
  parts?: Record<string, SplitPartProblem>;
};

export type QuickAddResult =
  { ok: true; row: IngestRow } | { ok: false; problems: QuickAddProblems };

/**
 * Checks the form and builds the one `add_transactions` row. Money out needs a category (or a
 * split); money in may come without one (it then does not count against a budget).
 */
export function buildQuickAddRow(form: QuickAddForm, now: Date): QuickAddResult {
  const problems: QuickAddProblems = {};
  const amount = parseAmountInput(form.amountText);
  const sign = form.moneyIn ? 1 : -1;
  if (!amount.ok) problems.amount = amount.problem;

  const choices: IngestChoices = {};
  if (form.splitting) {
    if (amount.ok) {
      const split = checkSplit(amount.rappen, sign, form.parts);
      if (split.ok) choices.splits = split.parts;
      else {
        problems.split = split.problem;
        problems.parts = split.partProblems;
      }
    }
  } else if (form.categoryId !== null) {
    choices.categoryId = form.categoryId;
  } else if (!form.moneyIn) {
    problems.category = 'required';
  }

  if (!amount.ok || Object.keys(problems).length > 0) return { ok: false, problems };

  const merchant = form.merchant.trim();
  const note = form.note.trim();
  if (note !== '') choices.note = note.slice(0, NOTE_MAX_LENGTH);

  const transaction: SourceTransaction = {
    amountRappen: sign * amount.rappen,
    currency: BASE_CURRENCY,
    ...(form.day.kind === 'today' ? { bookedAt: now.toISOString() } : { bookedOn: form.day.date }),
    merchant: merchant === '' ? null : merchant.slice(0, MERCHANT_MAX_LENGTH),
    rawText: null,
    mcc: null,
    source: 'manual',
    sourceId: null,
  };
  return { ok: true, row: toIngestRow(transaction, choices) };
}
