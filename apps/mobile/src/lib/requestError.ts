/**
 * The error data hooks throw for a failed Supabase request, so React Query (retry policy) and
 * screens (messages) can tell a network failure from a rejected request without parsing text.
 */
export class RequestError extends Error {
  /** HTTP status of the response; 0 when no response arrived (offline, timeout, DNS). */
  readonly status: number;
  /** PostgREST / Postgres error code (e.g. "PGRST116", "23514"), or '' when there was none. */
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'RequestError';
    this.status = status;
    this.code = code;
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

/** The fields of a postgrest-js response this module needs. */
export type PostgrestFailure = {
  error: { message: string; code?: string } | null;
  status: number;
};

/** Wraps a postgrest-js error. The message stays developer-facing; screens show their own text. */
export function toRequestError({ error, status }: PostgrestFailure): RequestError {
  return new RequestError(error?.message ?? 'Request failed', status, error?.code ?? '');
}

/**
 * True for failures that repeating the same request cannot fix: a 4xx answer other than 408
 * (timeout) and 429 (rate limit). Network failures and 5xx answers are worth retrying.
 */
export function isClientError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('status' in error)) return false;
  const { status } = error;
  return (
    typeof status === 'number' && status >= 400 && status < 500 && status !== 408 && status !== 429
  );
}
