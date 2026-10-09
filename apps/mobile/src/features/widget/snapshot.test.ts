import { parseOverview, toHomeModel, type HomeModel } from '@/data/overview';
import { OVERVIEW_JSON } from '@/test/overviewFixture';

import {
  WIDGET_ADD_URL,
  buildWidgetSnapshot,
  neutralSnapshot,
  parseWidgetSnapshot,
  snapshotContent,
  widgetView,
} from './snapshot';

const NOW = new Date('2026-10-02T08:00:00Z');

function home(overrides: Partial<typeof OVERVIEW_JSON> = {}): HomeModel {
  return toHomeModel(parseOverview({ ...OVERVIEW_JSON, ...overrides })!);
}

describe('buildWidgetSnapshot', () => {
  it('formats balance, per day and days until payday like the home screen (German)', () => {
    const snapshot = buildWidgetSnapshot(home(), 'de', NOW);
    expect(snapshot).toMatchObject({
      version: 1,
      state: 'ready',
      language: 'de',
      updatedAt: '2026-10-02T08:00:00.000Z',
      balanceText: 'CHF 2’759.50',
      perDayText: 'CHF 119.97',
      daysText: '23',
      daysLabel: 'Tage bis zum Zahltag',
      message: null,
      addUrl: 'batzen://add',
      labels: {
        balance: 'übrig diesen Monat',
        perDay: 'pro Tag',
        add: 'Ausgabe erfassen',
        open: 'Batzen öffnen',
        newMonth: 'Neuer Monat: Batzen öffnen',
      },
    });
  });

  it('uses the English labels and number format', () => {
    const snapshot = buildWidgetSnapshot(home(), 'en', NOW);
    expect(snapshot.balanceText).toBe('CHF 2,759.50');
    expect(snapshot.daysLabel).toBe('days until payday');
    expect(snapshot.labels.perDay).toBe('per day');
  });

  it('has one entry per day until the day before payday, so the widget moves on at midnight', () => {
    const { days } = buildWidgetSnapshot(home(), 'en', NOW);
    expect(days).toHaveLength(23);
    expect(days[0]).toMatchObject({ date: '2026-10-02', daysText: '23', overspent: false });
    expect(days[1]).toMatchObject({ date: '2026-10-03', daysText: '22', perDayText: 'CHF 125.43' });
    expect(days[22]).toMatchObject({
      date: '2026-10-24',
      daysText: '1',
      daysLabel: 'day until payday',
      balanceText: 'CHF 2,759.50',
      perDayText: 'CHF 2,759.50',
    });
  });

  it('marks an overspent month', () => {
    const snapshot = buildWidgetSnapshot(
      home({ period: { ...OVERVIEW_JSON.period, income_rappen: 300000 } }),
      'de',
      NOW,
    );
    expect(snapshot.balanceText).toMatch(/^CHF -/);
    expect(snapshot.perDayText).toBe('CHF 0.00');
    expect(snapshot.days.every((day) => day.overspent)).toBe(true);
  });

  it('shows no numbers without a current month', () => {
    const snapshot = buildWidgetSnapshot(null, 'en', NOW);
    expect(snapshot).toMatchObject({
      state: 'empty',
      balanceText: null,
      perDayText: null,
      daysText: null,
      message: 'Open Batzen to set up your month',
      days: [],
    });
  });
});

describe('neutralSnapshot', () => {
  it('keeps no financial data after sign-out', () => {
    const snapshot = neutralSnapshot('signed_out', 'de', NOW);
    expect(snapshot).toMatchObject({ state: 'signed_out', message: 'Batzen öffnen', days: [] });
    expect(snapshotContent(snapshot)).not.toMatch(/CHF|\d\.\d\d/);
  });
});

describe('snapshotContent', () => {
  it('ignores the timestamp so unchanged data is not written again', () => {
    const a = buildWidgetSnapshot(home(), 'de', NOW);
    const b = buildWidgetSnapshot(home(), 'de', new Date('2026-10-02T09:00:00Z'));
    expect(snapshotContent(a)).toBe(snapshotContent(b));
    expect(snapshotContent(a)).not.toBe(snapshotContent(buildWidgetSnapshot(home(), 'en', NOW)));
  });
});

describe('parseWidgetSnapshot', () => {
  it('reads back what the app wrote', () => {
    const snapshot = buildWidgetSnapshot(home(), 'en', NOW);
    expect(parseWidgetSnapshot(JSON.stringify(snapshot))).toEqual(snapshot);
  });

  it.each([null, '', 'not json', 'null', '{"version":2}', '{"version":1,"language":"fr"}'])(
    'treats %p as no snapshot',
    (json) => {
      expect(parseWidgetSnapshot(json)).toBeNull();
    },
  );
});

describe('widgetView', () => {
  const snapshot = buildWidgetSnapshot(home(), 'en', NOW);

  it("shows today's entry", () => {
    const view = widgetView(snapshot, '2026-10-10');
    expect(view).toMatchObject({ kind: 'numbers', day: { date: '2026-10-10', daysText: '15' } });
  });

  it('shows the first entry when the device is behind the server date', () => {
    expect(widgetView(snapshot, '2026-10-01')).toMatchObject({ day: { date: '2026-10-02' } });
  });

  it('shows "new month" instead of old numbers from payday on', () => {
    expect(widgetView(snapshot, '2026-10-25')).toEqual({
      kind: 'message',
      message: 'New month: open Batzen',
      addUrl: WIDGET_ADD_URL,
    });
  });

  it('shows the neutral message when signed out, set up is missing or nothing was written', () => {
    expect(widgetView(neutralSnapshot('signed_out', 'en', NOW), '2026-10-02')).toMatchObject({
      kind: 'message',
      message: 'Open Batzen',
    });
    expect(widgetView(null, '2026-10-02')).toEqual({
      kind: 'message',
      message: 'Batzen',
      addUrl: 'batzen://add',
    });
  });
});
