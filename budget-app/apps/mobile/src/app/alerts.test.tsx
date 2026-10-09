import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';

import { alertTarget } from '@/features/alerts/target';
import { i18n } from '@/i18n';
import { readEnv } from '@/lib/env';
import type { RpcHandler } from '@/test/fakeSupabase';
import { alertJson, categoryDetailJson, momentJson } from '@/test/m4Fixture';
import { OVERVIEW_JSON } from '@/test/overviewFixture';
import { ok, page, refused, rpcCalls, startApp } from '@/test/transactionsFixture';

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));
jest.mock('@/lib/env', () => ({ ...jest.requireActual('@/lib/env'), readEnv: jest.fn() }));
jest.mock('@/lib/supabase', () => ({
  getSupabase: jest.fn(),
  getSupabaseIfConfigured: jest.fn(),
  authRedirectUrl: jest.fn(() => 'batzen://auth/callback'),
}));

const GROCERIES_80 = alertJson({ id: 'a-1', category_id: 'c-groceries' });
const PURCHASE = alertJson({
  id: 'a-2',
  type: 'unusual_purchase',
  title: 'Unusual purchase',
  body: 'CHF 84 at Manor is more than usual.',
  transaction_id: 't-manor',
  read_at: '2026-10-04T10:00:00+00:00',
});

function start(options: { url?: string; alerts?: unknown[]; rpc?: Record<string, RpcHandler> }) {
  // The inbox as the database keeps it: marking and dismissing change it.
  let alerts: Record<string, unknown>[] = (options.alerts ?? [GROCERIES_80, PURCHASE]).map(
    (alert) => ({ ...(alert as Record<string, unknown>) }),
  );
  return startApp({
    url: options.url ?? '/alerts',
    overview: { ...OVERVIEW_JSON, unread_alert_count: 3 },
    rpc: {
      list_alerts: () => ok({ items: alerts, next_cursor: null }),
      mark_alerts_read: (args) => {
        const { p_ids } = args as { p_ids: string[] };
        alerts = alerts.map((alert) =>
          p_ids.includes(String(alert.id)) ? { ...alert, read_at: '2026-10-05T08:00:00Z' } : alert,
        );
        return ok(null);
      },
      dismiss_alert: (args) => {
        alerts = alerts.filter((alert) => alert.id !== (args as { p_id: string }).p_id);
        return ok(null);
      },
      get_category_detail: () => ok(categoryDetailJson()),
      list_transactions: () => ok(page([])),
      pending_moments: () => ok([]),
      ...options.rpc,
    },
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  jest.mocked(readEnv).mockReturnValue({
    ok: true,
    supabaseUrl: 'http://127.0.0.1:54321',
    supabaseKey: 'publishable-key',
    appEnv: 'development',
  });
  await AsyncStorage.clear();
  await i18n.changeLanguage('en');
});

describe('alerts inbox', () => {
  it('opens from the bell on Home, which shows the unread count', async () => {
    start({ url: '/' });
    const bell = await screen.findByTestId('home-alerts');
    expect(bell).toHaveProp('accessibilityLabel', 'Alerts, 3 unread');
    expect(within(bell).getByTestId('home-alerts-count')).toHaveTextContent('3');
    fireEvent.press(bell);
    expect(await screen.findByTestId('alerts-screen')).toBeOnTheScreen();
  });

  it('lists alerts newest first with unread ones marked', async () => {
    start({});
    expect(await screen.findByTestId('alerts-item-0')).toHaveProp(
      'accessibilityLabel',
      expect.stringMatching(/^Unread\. Groceries at 80 %\. CHF 180 left until the 25th\./),
    );
    expect(screen.getByTestId('alerts-item-0-unread')).toBeOnTheScreen();
    expect(screen.queryByTestId('alerts-item-1-unread')).toBeNull();
  });

  it('tapping an alert marks it read and opens its category', async () => {
    const fake = start({});
    fireEvent.press(await screen.findByTestId('alerts-item-0'));
    expect(await screen.findByTestId('category-screen')).toBeOnTheScreen();
    expect(rpcCalls(fake, 'mark_alerts_read')).toEqual([{ p_ids: ['a-1'] }]);
  });

  it('a purchase alert opens its payment moment', async () => {
    // Nothing waits when the app opens; the purchase is pending by the time the alert is tapped.
    let calls = 0;
    const fake = start({
      rpc: {
        pending_moments: () => ok(calls++ === 0 ? [] : [momentJson({ transaction_id: 't-manor' })]),
      },
    });
    fireEvent.press(await screen.findByTestId('alerts-item-1'));
    expect(await screen.findByTestId('moment-merchant')).toHaveTextContent('Manor');
    // Already read: nothing to mark.
    expect(rpcCalls(fake, 'mark_alerts_read')).toEqual([]);
  });

  it('marks all as read and dismisses one', async () => {
    const fake = start({});
    fireEvent.press(await screen.findByTestId('alerts-mark-all'));
    await waitFor(() => expect(rpcCalls(fake, 'mark_alerts_read')).toEqual([{ p_ids: ['a-1'] }]));
    await waitFor(() => expect(screen.queryByTestId('alerts-item-0-unread')).toBeNull());

    fireEvent.press(screen.getByTestId('alerts-item-1-dismiss'));
    await waitFor(() => expect(rpcCalls(fake, 'dismiss_alert')).toEqual([{ p_id: 'a-2' }]));
    await waitFor(() => expect(screen.queryByTestId('alerts-item-1')).toBeNull());
  });

  it('says when a change fails', async () => {
    start({ rpc: { dismiss_alert: () => refused('boom') } });
    fireEvent.press(await screen.findByTestId('alerts-item-0-dismiss'));
    expect(await screen.findByTestId('alerts-error')).toBeOnTheScreen();
  });

  it('pages back through older alerts', async () => {
    const fake = start({
      rpc: {
        list_alerts: (args) =>
          (args as { p: { cursor?: unknown } }).p.cursor
            ? ok({ items: [PURCHASE], next_cursor: null })
            : ok({
                items: [GROCERIES_80],
                next_cursor: { created_at: GROCERIES_80.created_at, id: 'a-1' },
              }),
      },
    });
    fireEvent.press(await screen.findByTestId('alerts-load-more'));
    expect(await screen.findByTestId('alerts-item-1')).toBeOnTheScreen();
    expect(rpcCalls(fake, 'list_alerts')).toEqual([
      { p: { limit: 30 } },
      { p: { limit: 30, cursor: { created_at: GROCERIES_80.created_at, id: 'a-1' } } },
    ]);
  });

  it('shows an empty inbox and a load error', async () => {
    start({ alerts: [] });
    expect(await screen.findByTestId('alerts-empty')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('alerts-settings'));
    expect(await screen.findByTestId('notifications-screen')).toBeOnTheScreen();
  });

  it('offers a retry when the inbox cannot be loaded', async () => {
    start({ rpc: { list_alerts: () => refused('boom') } });
    expect(await screen.findByTestId('alerts-load-error')).toBeOnTheScreen();
  });

  it('opens what a tapped push notification is about', async () => {
    jest.mocked(Notifications.getLastNotificationResponseAsync).mockResolvedValueOnce({
      notification: {
        request: {
          identifier: 'push-1',
          content: { data: { type: 'category_100', category_id: 'c-groceries' } },
        },
      },
    } as never);
    start({ url: '/' });
    expect(await screen.findByTestId('category-screen')).toBeOnTheScreen();
  });
});

describe('alert targets', () => {
  it('leads each kind of alert to its screen', () => {
    expect(alertTarget({ type: 'categorize', transactionId: 't', categoryId: null })).toEqual({
      pathname: '/transaction/[id]',
      params: { id: 't' },
    });
    expect(alertTarget({ type: 'categorize', transactionId: null, categoryId: null })).toBe(
      '/review',
    );
    expect(alertTarget({ type: 'unusual_purchase', transactionId: 't', categoryId: 'c' })).toEqual({
      pathname: '/moment',
      params: { transaction: 't' },
    });
    expect(alertTarget({ type: 'pace', transactionId: null, categoryId: 'c' })).toEqual({
      pathname: '/category/[id]',
      params: { id: 'c' },
    });
    expect(alertTarget({ type: 'reminder_weekly', transactionId: null, categoryId: null })).toBe(
      '/import',
    );
    expect(alertTarget({ type: 'payday', transactionId: null, categoryId: null })).toBe('/');
  });
});
