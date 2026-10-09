import type { TablesUpdate } from '@budget/core';
import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { RequestError, toRequestError } from '@/lib/requestError';
import { getSupabase } from '@/lib/supabase';

import { jsonReader } from './json';

/**
 * The person's notification settings (one `notification_settings` row, written directly under
 * row-level security): which alert types may notify, the three budget reminders (M4-09), quiet
 * hours and the daily cap. docs/API.md, "Alerts, moments, reminders, editors (Milestone 4)".
 */

export const ALERT_TOGGLES = [
  'transaction_moments',
  'category_thresholds',
  'total_low',
  'pace',
  'unusual_purchase',
  'daily_allowance',
  'payday',
  'categorize_requests',
] as const;
export type AlertToggle = (typeof ALERT_TOGGLES)[number];

/** Reminder switches; `weekly_review` is the weekly "log cash, import your statement". */
export const REMINDER_TOGGLES = ['reminder_payday', 'weekly_review', 'reminder_stale'] as const;
export type ReminderToggle = (typeof REMINDER_TOGGLES)[number];

/** ISO weekdays, 1 = Monday … 7 = Sunday. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export type NotificationSettings = Record<AlertToggle | ReminderToggle, boolean> & {
  weeklyReviewDay: Weekday;
  /** Minutes after midnight in the profile's time zone. */
  weeklyReviewMinutes: number;
  quietHoursEnabled: boolean;
  quietStartMinutes: number;
  quietEndMinutes: number;
  maxPerDay: number;
};

/** Columns the reminders add (M4-09); their database defaults until the row has them. */
const REMINDER_DEFAULTS = {
  reminder_payday: true,
  reminder_stale: true,
  weekly_review_day: 7,
  weekly_review_time: '18:00',
} as const;

const read = jsonReader('notification_settings');

/** "22:00" or "22:00:00" → 1320. */
export function clockMinutes(value: unknown, field: string): number {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(read.text(value, field));
  const hours = Number(match?.[1]);
  const minutes = Number(match?.[2]);
  if (!match || hours > 23 || minutes > 59) return read.fail(field);
  return hours * 60 + minutes;
}

export function clockText(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hours = String(Math.floor(normalized / 60)).padStart(2, '0');
  return `${hours}:${String(normalized % 60).padStart(2, '0')}`;
}

export function parseNotificationSettings(json: unknown): NotificationSettings {
  const row: Record<string, unknown> = { ...REMINDER_DEFAULTS, ...read.object(json, 'row') };
  const flag = (key: AlertToggle | ReminderToggle) => read.boolean(row[key], key);
  const day = read.integer(row.weekly_review_day, 'weekly_review_day');
  return {
    transaction_moments: flag('transaction_moments'),
    category_thresholds: flag('category_thresholds'),
    total_low: flag('total_low'),
    pace: flag('pace'),
    unusual_purchase: flag('unusual_purchase'),
    daily_allowance: flag('daily_allowance'),
    payday: flag('payday'),
    categorize_requests: flag('categorize_requests'),
    reminder_payday: flag('reminder_payday'),
    weekly_review: flag('weekly_review'),
    reminder_stale: flag('reminder_stale'),
    weeklyReviewDay: (WEEKDAYS as readonly number[]).includes(day)
      ? (day as Weekday)
      : read.fail('weekly_review_day'),
    weeklyReviewMinutes: clockMinutes(row.weekly_review_time, 'weekly_review_time'),
    quietHoursEnabled: read.boolean(row.quiet_hours_enabled, 'quiet_hours_enabled'),
    quietStartMinutes: clockMinutes(row.quiet_hours_start, 'quiet_hours_start'),
    quietEndMinutes: clockMinutes(row.quiet_hours_end, 'quiet_hours_end'),
    maxPerDay: read.integer(row.max_per_day, 'max_per_day'),
  };
}

/** The columns a change writes. */
export function toSettingsColumns(change: Partial<NotificationSettings>): Record<string, unknown> {
  const columns: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(change)) {
    if (value === undefined) continue;
    if (key === 'weeklyReviewDay') columns.weekly_review_day = value;
    else if (key === 'weeklyReviewMinutes') columns.weekly_review_time = clockText(value as number);
    else if (key === 'quietHoursEnabled') columns.quiet_hours_enabled = value;
    else if (key === 'quietStartMinutes') columns.quiet_hours_start = clockText(value as number);
    else if (key === 'quietEndMinutes') columns.quiet_hours_end = clockText(value as number);
    else if (key === 'maxPerDay') columns.max_per_day = value;
    else columns[key] = value;
  }
  return columns;
}

export const notificationSettingsKeys = {
  all: ['notification_settings'] as const,
  detail: (userId: string) => ['notification_settings', userId] as const,
};

async function fetchNotificationSettings(userId: string): Promise<NotificationSettings> {
  const { data, error, status } = await getSupabase()
    .from('notification_settings')
    .select('*')
    .eq('user_id', userId)
    .limit(1);
  if (error) throw toRequestError({ error, status });
  const row = (data ?? [])[0];
  if (row === undefined) throw new RequestError('No notification settings', 404, 'not_found');
  return parseNotificationSettings(row);
}

export function useNotificationSettings() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: userId ? notificationSettingsKeys.detail(userId) : notificationSettingsKeys.all,
    queryFn: userId ? () => fetchNotificationSettings(userId) : skipToken,
  });
}

type Context = { previous: NotificationSettings | undefined; key: readonly string[] };

/** Saves one change at once (optimistic); a refused change puts the old value back. */
export function useUpdateNotificationSettings() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useMutation<void, Error, Partial<NotificationSettings>, Context>({
    mutationFn: async (change) => {
      if (!userId) throw new RequestError('Not signed in', 401, 'not_signed_in');
      // The reminder columns (M4-09) arrive with the database types of the M4 migration.
      const columns = toSettingsColumns(change) as TablesUpdate<'notification_settings'>;
      const { error, status } = await getSupabase()
        .from('notification_settings')
        .update(columns)
        .eq('user_id', userId);
      if (error) throw toRequestError({ error, status });
    },
    onMutate: async (change) => {
      const key = userId ? notificationSettingsKeys.detail(userId) : notificationSettingsKeys.all;
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<NotificationSettings>(key);
      if (previous) queryClient.setQueryData(key, { ...previous, ...change });
      return { previous, key };
    },
    onError: (_error, _change, context) => {
      if (context?.previous) queryClient.setQueryData(context.key, context.previous);
    },
  });
}
