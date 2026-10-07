import { CATEGORIZED_BY, type CategorizedBy } from '@budget/core';

/**
 * How a transaction got its category (`categorized_by`). Besides the values in `@budget/core`
 * the database may answer 'refund' (D-039): money in that looks like money back for an earlier
 * purchase got that purchase's category as a guess (confidence 60, so the app asks).
 *
 * 'refund' joins `CATEGORIZED_BY` in `@budget/core` with the database change; it is listed here
 * too so the app reads it either way. Once the core constant has it, this adds nothing.
 */
export type TransactionCategorizedBy = CategorizedBy | 'refund';

export const TRANSACTION_CATEGORIZED_BY: readonly TransactionCategorizedBy[] = [
  ...new Set<TransactionCategorizedBy>([...CATEGORIZED_BY, 'refund']),
];
