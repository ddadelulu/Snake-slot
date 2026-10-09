import { categoryDetailJson, momentJson, settingsRow } from '@/test/m4Fixture';
import { OVERVIEW_JSON } from '@/test/overviewFixture';

import { parseAlertPage } from './alerts';
import { parseCategoryDetail } from './categoryDetail';
import { ResponseFormatError } from './json';
import { parseMoments } from './moments';
import {
  clockMinutes,
  clockText,
  parseNotificationSettings,
  toSettingsColumns,
} from './notificationSettings';
import { parseOverview } from './overview';

describe('Milestone 4 responses', () => {
  it('reads payment moments and refuses a malformed one', () => {
    expect(
      parseMoments([momentJson({ transaction_id: 't-1', category_id: null, budget_rappen: null })]),
    ).toEqual([
      expect.objectContaining({
        id: 't-1',
        categoryId: null,
        budgetRappen: null,
        overBudget: false,
      }),
    ]);
    expect(parseMoments(null)).toEqual([]);
    expect(() => parseMoments([momentJson({ transaction_id: 't-1', over_budget: 'yes' })])).toThrow(
      ResponseFormatError,
    );
  });

  it('reads an alerts page', () => {
    const result = parseAlertPage({
      items: [
        {
          id: 'a',
          type: 'pace',
          title: 'T',
          body: 'B',
          category_id: 'c',
          transaction_id: null,
          read_at: '2026-10-04T10:00:00Z',
          created_at: '2026-10-04T09:00:00Z',
        },
      ],
      next_cursor: null,
    });
    expect(result).toEqual({
      items: [
        {
          id: 'a',
          type: 'pace',
          title: 'T',
          body: 'B',
          categoryId: 'c',
          transactionId: null,
          read: true,
          createdAt: '2026-10-04T09:00:00Z',
        },
      ],
      nextCursor: null,
    });
  });

  it('reads notification settings with the weekly reminder', () => {
    expect(parseNotificationSettings(settingsRow())).toMatchObject({
      reminder_weekly: true,
      weeklyDay: 7,
      weeklyMinutes: 18 * 60,
      quietStartMinutes: 22 * 60,
      quietEndMinutes: 7 * 60,
      maxPerDay: 6,
    });
    expect(() => parseNotificationSettings(settingsRow({ reminder_weekly_day: 9 }))).toThrow(
      ResponseFormatError,
    );
  });

  it('converts clock times and changes to columns', () => {
    expect(clockMinutes('07:30:00', 'x')).toBe(450);
    expect(() => clockMinutes('25:00', 'x')).toThrow(ResponseFormatError);
    expect(clockText(-30)).toBe('23:30');
    expect(
      toSettingsColumns({
        pace: false,
        weeklyDay: 1,
        weeklyMinutes: 570,
        quietHoursEnabled: true,
        quietStartMinutes: 1290,
        quietEndMinutes: 420,
        maxPerDay: 4,
      }),
    ).toEqual({
      pace: false,
      reminder_weekly_day: 1,
      reminder_weekly_time: '09:30',
      quiet_hours_enabled: true,
      quiet_hours_start: '21:30',
      quiet_hours_end: '07:00',
      max_per_day: 4,
    });
  });

  it('reads the unread alert count, 0 from a server before Milestone 4', () => {
    expect(parseOverview(OVERVIEW_JSON)?.unreadAlertCount).toBe(0);
    expect(parseOverview({ ...OVERVIEW_JSON, unread_alert_count: 4 })?.unreadAlertCount).toBe(4);
  });

  it('reads a category detail with its history oldest first', () => {
    const detail = parseCategoryDetail(categoryDetailJson());
    expect(detail.category).toEqual({
      id: 'c-groceries',
      defaultKey: 'groceries',
      name: null,
      archived: false,
    });
    expect(detail.today).toBe('2026-10-02');
    expect(detail.history.map((month) => month.startsOn)).toEqual([
      '2026-03-25',
      '2026-04-25',
      '2026-05-25',
      '2026-06-25',
      '2026-07-25',
      '2026-08-25',
    ]);
    expect(() => parseCategoryDetail({ category: {} })).toThrow(ResponseFormatError);
  });
});
