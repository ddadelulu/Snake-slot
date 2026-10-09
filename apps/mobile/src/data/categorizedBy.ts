import { CATEGORIZED_BY, type CategorizedBy } from '@budget/core';

/**
 * How a transaction got its category (`categorized_by`), including 'refund' (D-039: money in that
 * looks like money back for an earlier purchase, guessed with confidence 60 so the app asks).
 */
export type TransactionCategorizedBy = CategorizedBy;

export const TRANSACTION_CATEGORIZED_BY: readonly TransactionCategorizedBy[] = CATEGORIZED_BY;
