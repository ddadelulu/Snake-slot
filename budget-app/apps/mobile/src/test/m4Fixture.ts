import type { FakeRow } from './fakeSupabase';

/**
 * Data for the Milestone 4 route tests, in the snake_case shapes of docs/API.md "Alerts,
 * moments, reminders, editors (Milestone 4)". Balances follow OVERVIEW_JSON (CHF 2'709.50 left
 * after Anna's earlier purchases).
 */

export function momentJson(overrides: Record<string, unknown> & { id: string }) {
  return {
    amount_rappen: -8400,
    booked_at: '2026-10-04T09:00:00+00:00',
    merchant: 'Manor',
    note: null,
    category_id: 'c-groceries',
    balance_before_rappen: 270950,
    balance_after_rappen: 262550,
    remaining_before_rappen: 67000,
    remaining_after_rappen: 58600,
    budget_rappen: 90000,
    over_budget: false,
    ...overrides,
  };
}

/** A purchase that takes Eating out over its budget. */
export const OVER_BUDGET_MOMENT = momentJson({
  id: 't-dinner',
  merchant: 'Zeughauskeller',
  amount_rappen: -6400,
  category_id: 'c-eating-out',
  balance_before_rappen: 262550,
  balance_after_rappen: 256150,
  remaining_before_rappen: -1000,
  remaining_after_rappen: -7400,
  budget_rappen: 40000,
  over_budget: true,
});

export function alertJson(overrides: Record<string, unknown> & { id: string }) {
  return {
    type: 'category_80',
    title: 'Groceries at 80 %',
    body: 'CHF 180 left until the 25th.',
    params: {},
    category_id: null,
    transaction_id: null,
    period_id: null,
    read_at: null,
    created_at: '2026-10-04T09:00:00+00:00',
    ...overrides,
  };
}

/** The notification_settings row as the table returns it (with the M4-09 reminder columns). */
export function settingsRow(overrides: Record<string, unknown> = {}): FakeRow {
  return {
    user_id: '7a1d3c4e-0000-4000-8000-000000000001',
    transaction_moments: true,
    category_thresholds: true,
    total_low: true,
    pace: true,
    unusual_purchase: true,
    daily_allowance: false,
    payday: true,
    weekly_review: true,
    categorize_requests: true,
    reminder_payday: true,
    reminder_stale: false,
    weekly_review_day: 7,
    weekly_review_time: '18:00:00',
    quiet_hours_enabled: true,
    quiet_hours_start: '22:00:00',
    quiet_hours_end: '07:00:00',
    max_per_day: 6,
    ...overrides,
  };
}

/** Groceries: CHF 900 budget, CHF 230 spent, five earlier months. */
export function categoryDetailJson(overrides: Record<string, unknown> = {}) {
  return {
    category_id: 'c-groceries',
    today: '2026-10-02',
    period: { id: 'p-oct', starts_on: '2026-09-25', ends_on: '2026-10-25' },
    budget_rappen: 90000,
    rollover_rappen: 2500,
    spent_rappen: 23000,
    history: [
      { starts_on: '2026-04-25', budget_rappen: 90000, spent_rappen: 81000 },
      { starts_on: '2026-05-25', budget_rappen: 90000, spent_rappen: 95000 },
      { starts_on: '2026-06-25', budget_rappen: 90000, spent_rappen: 70000 },
      { starts_on: '2026-07-25', budget_rappen: 90000, spent_rappen: 88000 },
      { starts_on: '2026-08-25', budget_rappen: 85000, spent_rappen: 86000 },
      { starts_on: '2026-09-25', budget_rappen: 90000, spent_rappen: 23000 },
    ],
    ...overrides,
  };
}
