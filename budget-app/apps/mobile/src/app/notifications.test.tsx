import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { i18n } from '@/i18n';
import { readEnv } from '@/lib/env';
import type { RpcHandler } from '@/test/fakeSupabase';
import { settingsRow } from '@/test/m4Fixture';
import { ok, refused, rpcCalls, startApp } from '@/test/transactionsFixture';

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));
jest.mock('@/lib/env', () => ({ ...jest.requireActual('@/lib/env'), readEnv: jest.fn() }));
jest.mock('@/lib/supabase', () => ({
  getSupabase: jest.fn(),
  getSupabaseIfConfigured: jest.fn(),
  authRedirectUrl: jest.fn(() => 'batzen://auth/callback'),
}));

function start(row = settingsRow(), rpc: Record<string, RpcHandler> = {}) {
  return startApp({
    url: '/notifications',
    tables: { notification_settings: [row] },
    rpc: { register_push_token: () => ok(null), ...rpc },
  });
}

const stored = (fake: ReturnType<typeof start>) => fake.state.tables.notification_settings?.[0];

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

describe('notification settings', () => {
  it('opens from Settings and shows the stored choices', async () => {
    startApp({ url: '/settings', tables: { notification_settings: [settingsRow()] } });
    fireEvent.press(await screen.findByTestId('settings-notifications'));
    expect(await screen.findByTestId('notifications-total_low')).toHaveProp('accessibilityState', {
      checked: true,
      disabled: false,
    });
    expect(screen.getByTestId('notifications-daily_allowance')).toHaveProp('accessibilityState', {
      checked: false,
      disabled: false,
    });
    expect(screen.getByTestId('notifications-weekly-time')).toHaveTextContent(/18:00/);
    expect(screen.getByTestId('notifications-quiet-hours')).toHaveTextContent(
      /No notifications from 22:00 to 07:00\./,
    );
    expect(screen.getByTestId('notifications-max-per-day')).toHaveTextContent(/6/);
  });

  it('saves each switch at once', async () => {
    const fake = start();
    fireEvent(await screen.findByTestId('notifications-pace'), 'valueChange', false);
    await waitFor(() => expect(stored(fake)?.pace).toBe(false));
    fireEvent(screen.getByTestId('notifications-reminder_stale'), 'valueChange', true);
    await waitFor(() => expect(stored(fake)?.reminder_stale).toBe(true));
  });

  it('sets the weekly reminder day and time, quiet hours and the daily cap', async () => {
    const fake = start();
    fireEvent.press(await screen.findByTestId('notifications-weekly-day-1'));
    await waitFor(() => expect(stored(fake)?.reminder_weekly_day).toBe(1));
    fireEvent.press(screen.getByTestId('notifications-weekly-time-increment'));
    await waitFor(() => expect(stored(fake)?.reminder_weekly_time).toBe('18:30'));
    fireEvent.press(screen.getByTestId('notifications-quiet-start-decrement'));
    await waitFor(() => expect(stored(fake)?.quiet_hours_start).toBe('21:30'));
    fireEvent.press(screen.getByTestId('notifications-quiet-end-increment'));
    await waitFor(() => expect(stored(fake)?.quiet_hours_end).toBe('07:30'));
    fireEvent.press(screen.getByTestId('notifications-max-per-day-increment'));
    await waitFor(() => expect(stored(fake)?.max_per_day).toBe(7));
    fireEvent(screen.getByTestId('notifications-quiet-hours'), 'valueChange', false);
    await waitFor(() => expect(stored(fake)?.quiet_hours_enabled).toBe(false));
    await waitFor(() => expect(screen.queryByTestId('notifications-quiet-start')).toBeNull());
  });

  it('asks for the phone permission and registers the push token', async () => {
    const fake = start();
    expect(await screen.findByTestId('notifications-device-status')).toHaveTextContent(
      'Notifications are off for this phone.',
    );
    fireEvent.press(screen.getByTestId('notifications-allow'));
    expect(await screen.findByText('Notifications are on for this phone.')).toBeOnTheScreen();
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(rpcCalls(fake, 'register_push_token')).toEqual([
      { p_token: 'ExponentPushToken[test]', p_platform: 'ios' },
    ]);
  });

  it('asks the first time a switch is turned on', async () => {
    const fake = start();
    fireEvent(await screen.findByTestId('notifications-daily_allowance'), 'valueChange', true);
    await waitFor(() => expect(rpcCalls(fake, 'register_push_token')).toHaveLength(1));
    expect(stored(fake)?.daily_allowance).toBe(true);
  });

  it('points to the phone settings when notifications are blocked there', async () => {
    jest
      .mocked(Notifications.getPermissionsAsync)
      .mockResolvedValueOnce({ status: 'denied', canAskAgain: false } as never);
    start();
    expect(await screen.findByTestId('notifications-open-settings')).toBeOnTheScreen();
    expect(screen.getByTestId('notifications-device-status')).toHaveTextContent(
      'Notifications are turned off in your phone’s settings.',
    );
  });

  it('says when the phone cannot be registered', async () => {
    start(settingsRow(), { register_push_token: () => refused('boom') });
    fireEvent.press(await screen.findByTestId('notifications-allow'));
    expect(await screen.findByTestId('notifications-register-error')).toBeOnTheScreen();
  });

  it('puts a switch back and says so when saving fails', async () => {
    const fake = start();
    const pace = await screen.findByTestId('notifications-pace');
    fake.state.tableErrors.notification_settings = { message: 'boom' };
    fireEvent(pace, 'valueChange', false);
    expect(await screen.findByTestId('notifications-error')).toBeOnTheScreen();
    expect(screen.getByTestId('notifications-pace')).toHaveProp('accessibilityState', {
      checked: true,
      disabled: false,
    });
  });

  it('offers a retry when the settings cannot be loaded', async () => {
    const fake = startApp({ url: '/notifications', tables: {} });
    fake.state.tableErrors.notification_settings = { message: 'boom' };
    expect(await screen.findByTestId('notifications-load-error')).toBeOnTheScreen();
  });
});
