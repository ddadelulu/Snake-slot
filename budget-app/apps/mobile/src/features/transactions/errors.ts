import { RequestError } from '@/lib/requestError';

/**
 * Why a transaction request failed, as the screens explain it. The database names its refusals
 * (docs/API.md, "Transactions (Milestone 3)"); anything else is a network problem or unknown.
 */
export const TRANSACTION_ERROR_CODES = [
  'transaction_not_found',
  'category_not_found',
  'invalid_splits',
  'transaction_is_split',
  'not_editable',
  'fixed_cost_not_found',
  'rule_needs_category',
  'invalid_input',
  'invalid_row',
  'not_onboarded',
  'network',
  'unknown',
] as const;

export type TransactionErrorCode = (typeof TRANSACTION_ERROR_CODES)[number];

const REASONS: ReadonlySet<string> = new Set(
  TRANSACTION_ERROR_CODES.filter((code) => code !== 'network' && code !== 'unknown'),
);

export function transactionErrorCode(error: unknown): TransactionErrorCode {
  if (!(error instanceof RequestError)) return 'unknown';
  const reason = error.reason;
  if (reason !== null && REASONS.has(reason)) return reason as TransactionErrorCode;
  if (error.isNetworkError) return 'network';
  return 'unknown';
}
