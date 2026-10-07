import { RequestError } from '@/lib/requestError';

/**
 * Why saving (or checking) the statement's transactions failed, as the import screen explains
 * it: the refusals `add_transactions` names (docs/API.md), a network problem, or unknown.
 */
export const IMPORT_REQUEST_ERRORS = [
  'network',
  'too_many_rows',
  'invalid_row',
  'invalid_input',
  'not_onboarded',
  'unknown',
] as const;

export type ImportRequestError = (typeof IMPORT_REQUEST_ERRORS)[number];

const REASONS: ReadonlySet<string> = new Set(['too_many_rows', 'invalid_row', 'invalid_input', 'not_onboarded']);

export function importRequestError(error: unknown): ImportRequestError {
  if (!(error instanceof RequestError)) return 'unknown';
  const reason = error.reason;
  if (reason !== null && REASONS.has(reason)) return reason as ImportRequestError;
  if (error.isNetworkError) return 'network';
  return 'unknown';
}
