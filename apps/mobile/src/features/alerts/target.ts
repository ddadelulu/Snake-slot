import type { Href } from 'expo-router';

/** What an alert (or its push) is about, as the inbox and the push payload carry it. */
export type AlertTargetInput = {
  type: string;
  transactionId: string | null;
  categoryId: string | null;
};

/**
 * Where tapping an alert leads (spec section 9): a question about a purchase opens that purchase
 * to categorize it; any other purchase alert opens its payment moment (which falls through to the
 * purchase once it is confirmed); category alerts open the category; the weekly reminder opens
 * the statement import; everything about the month as a whole opens Home.
 */
export function alertTarget(alert: AlertTargetInput): Href {
  if (alert.type === 'categorize') {
    return alert.transactionId
      ? { pathname: '/transaction/[id]', params: { id: alert.transactionId } }
      : '/review';
  }
  if (alert.transactionId) {
    return { pathname: '/moment', params: { transaction: alert.transactionId } };
  }
  if (alert.categoryId) return { pathname: '/category/[id]', params: { id: alert.categoryId } };
  if (alert.type === 'reminder_weekly') return '/import';
  return '/';
}

const text = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null);

/** Reads the target from a push's data (`type`, `transaction_id`, `category_id`). */
export function pushTarget(data: unknown): Href | null {
  if (typeof data !== 'object' || data === null) return null;
  const payload = data as Record<string, unknown>;
  const type = text(payload.type);
  if (type === null) return null;
  return alertTarget({
    type,
    transactionId: text(payload.transaction_id),
    categoryId: text(payload.category_id),
  });
}
