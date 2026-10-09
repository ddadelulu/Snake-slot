import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { act, fireEvent, screen, waitFor, within } from 'expo-router/testing-library';

import { i18n } from '@/i18n';
import { readEnv } from '@/lib/env';
import { startApp } from '@/test/transactionsFixture';

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));
jest.mock('@/lib/env', () => ({ ...jest.requireActual('@/lib/env'), readEnv: jest.fn() }));
jest.mock('@/lib/supabase', () => ({
  getSupabase: jest.fn(),
  getSupabaseIfConfigured: jest.fn(),
  authRedirectUrl: jest.fn(() => 'batzen://auth/callback'),
}));

const ANNA = {
  net_income_rappen: 620000,
  weekly_work_minutes: 2520,
  savings_monthly_rappen: 50000,
  leftover_policy: 'rollover',
};

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

describe('Settings', () => {
  it('has a row for every editor', async () => {
    const fake = startApp({ url: '/settings', profile: ANNA });
    const rows = {
      'settings-profile': '/profile',
      'settings-fixed-costs': '/fixed-costs',
      'settings-categories': '/categories',
      'settings-alerts': '/alerts',
    };
    for (const [testID, path] of Object.entries(rows)) {
      fireEvent.press(await screen.findByTestId(testID));
      await waitFor(() => expect(fake.getPathname()).toBe(path));
      act(() => router.back());
      await waitFor(() => expect(fake.getPathname()).toBe('/settings'));
    }
  });

  it('sets the pain level and the coin sound', async () => {
    const fake = startApp({ url: '/settings', profile: ANNA });
    fireEvent.press(await screen.findByTestId('settings-pain-brutal'));
    await waitFor(() => expect(fake.state.profile.pain_level).toBe('brutal'));
    fireEvent(screen.getByTestId('settings-sound'), 'valueChange', false);
    await waitFor(() => expect(fake.state.profile.sound_enabled).toBe(false));
  });
});

describe('income and month', () => {
  it('saves income, payday, hours, saving and leftover from the next month', async () => {
    const fake = startApp({ url: '/profile', profile: ANNA });
    expect(await screen.findByTestId('profile-next-month')).toHaveTextContent(
      /Changes apply from your next month\./,
    );
    expect(screen.getByTestId('profile-net-income')).toHaveProp('value', '6200.00');
    expect(screen.getByTestId('profile-hours')).toHaveProp('value', '42');
    fireEvent.changeText(screen.getByTestId('profile-net-income'), '6500');
    fireEvent.press(screen.getByTestId('profile-payday-27'));
    fireEvent(screen.getByTestId('profile-irregular'), 'valueChange', true);
    fireEvent.changeText(screen.getByTestId('profile-hours'), '40,5');
    fireEvent.changeText(screen.getByTestId('profile-savings'), '600');
    fireEvent.press(screen.getByTestId('profile-leftover-savings'));
    fireEvent.press(screen.getByTestId('profile-save'));
    expect(await screen.findByTestId('profile-saved')).toBeOnTheScreen();
    expect(fake.state.profile).toMatchObject({
      net_income_rappen: 650000,
      payday: 27,
      irregular_income: true,
      weekly_work_minutes: 2430,
      savings_monthly_rappen: 60000,
      leftover_policy: 'savings',
    });
  });

  it('says what is wrong and saves nothing', async () => {
    const fake = startApp({ url: '/profile', profile: ANNA });
    fireEvent.changeText(await screen.findByTestId('profile-net-income'), '');
    fireEvent.changeText(screen.getByTestId('profile-hours'), '200');
    fireEvent.press(screen.getByTestId('profile-save'));
    expect(await screen.findByText('Enter your net income.')).toBeOnTheScreen();
    expect(
      screen.getByText('Enter hours per week between 1 and 112, e.g. 42 or 42.5.'),
    ).toBeOnTheScreen();
    expect(fake.state.profile.net_income_rappen).toBe(620000);
  });
});

describe('fixed costs', () => {
  it('lists active ones with their total and the stopped ones', async () => {
    startApp({ url: '/fixed-costs' });
    expect(await screen.findByTestId('fixed-costs-active-0')).toHaveTextContent(/Rent/);
    expect(screen.getByTestId('fixed-costs-active-1')).toHaveTextContent(/Swisscom/);
    expect(screen.getByTestId('fixed-costs-total')).toHaveTextContent(
      'Fixed costs per month: CHF 1,915.00',
    );
    expect(screen.getByTestId('fixed-costs-stopped-0')).toHaveTextContent(/Old gym/);
  });

  it('adds one', async () => {
    const fake = startApp({ url: '/fixed-costs' });
    fireEvent.press(await screen.findByTestId('fixed-costs-add'));
    fireEvent.press(await screen.findByTestId('fixed-costs-save'));
    expect(await screen.findByText('Enter the monthly amount.')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('fixed-costs-amount'), '420.50');
    fireEvent.press(screen.getByTestId('fixed-costs-kind-health_insurance'));
    fireEvent.changeText(screen.getByTestId('fixed-costs-label'), 'CSS');
    fireEvent.press(screen.getByTestId('fixed-costs-save'));
    await waitFor(() => expect(fake.state.tables.fixed_costs).toHaveLength(4));
    expect(fake.state.tables.fixed_costs?.[3]).toMatchObject({
      user_id: fake.state.profile.id,
      kind: 'health_insurance',
      label: 'CSS',
      amount_rappen: 42050,
      active: true,
    });
    expect(await screen.findByTestId('fixed-costs-active-2')).toHaveTextContent(/CSS/);
  });

  it('changes and stops one, never deleting it', async () => {
    const fake = startApp({ url: '/fixed-costs' });
    fireEvent.press(await screen.findByTestId('fixed-costs-active-1'));
    const amount = await screen.findByTestId('fixed-costs-amount');
    expect(amount).toHaveProp('value', '65.00');
    fireEvent.changeText(amount, '70');
    fireEvent.press(screen.getByTestId('fixed-costs-save'));
    await waitFor(() =>
      expect(fake.state.tables.fixed_costs?.[1]).toMatchObject({ amount_rappen: 7000 }),
    );
    fireEvent.press(await screen.findByTestId('fixed-costs-active-0'));
    fireEvent.press(await screen.findByTestId('fixed-costs-stop'));
    await waitFor(() =>
      expect(fake.state.tables.fixed_costs?.[0]).toMatchObject({ id: 'f-rent', active: false }),
    );
    expect(fake.state.tables.fixed_costs).toHaveLength(3);
  });

  it('says when a change cannot be saved', async () => {
    const fake = startApp({ url: '/fixed-costs' });
    fireEvent.press(await screen.findByTestId('fixed-costs-active-0'));
    fake.state.tableErrors.fixed_costs = { message: 'boom' };
    fireEvent.press(await screen.findByTestId('fixed-costs-save'));
    expect(await screen.findByTestId('fixed-costs-error')).toBeOnTheScreen();
  });
});

describe('categories', () => {
  it('adds a category and refuses a name already taken', async () => {
    const fake = startApp({ url: '/categories' });
    const name = await screen.findByTestId('categories-new-name');
    fireEvent.press(screen.getByTestId('categories-add'));
    expect(await screen.findByText('Enter a name.')).toBeOnTheScreen();
    fireEvent.changeText(name, 'groceries');
    fireEvent.press(screen.getByTestId('categories-add'));
    expect(
      await screen.findByText('You already have a category with that name.'),
    ).toBeOnTheScreen();
    fireEvent.changeText(name, 'Climbing');
    fireEvent.press(screen.getByTestId('categories-add'));
    await waitFor(() => expect(fake.state.tables.categories).toHaveLength(5));
    expect(fake.state.tables.categories?.[4]).toMatchObject({
      user_id: fake.state.profile.id,
      name: 'Climbing',
      sort_order: 4,
    });
    expect(await screen.findByTestId('categories-item-Climbing')).toBeOnTheScreen();
  });

  it('renames a default category, keeping its key', async () => {
    const fake = startApp({ url: '/categories' });
    fireEvent.press(await screen.findByTestId('categories-item-groceries'));
    const input = await screen.findByTestId('categories-rename-input');
    expect(input).toHaveProp('value', 'Groceries');
    fireEvent.changeText(input, 'Food');
    fireEvent.press(screen.getByTestId('categories-rename-save'));
    await waitFor(() =>
      expect(fake.state.tables.categories?.[0]).toMatchObject({
        default_key: 'groceries',
        name: 'Food',
      }),
    );
    expect(await screen.findByText('Food')).toBeOnTheScreen();
  });

  it('archives a category and lists it under Archived', async () => {
    const fake = startApp({ url: '/categories' });
    expect(await screen.findByTestId('categories-archived-Old hobby')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('categories-item-Dog'));
    fireEvent.press(await screen.findByTestId('categories-archive'));
    await waitFor(() =>
      expect(fake.state.tables.categories?.[2]?.archived_at).toEqual(expect.any(String)),
    );
    expect(await screen.findByTestId('categories-archived-Dog')).toBeOnTheScreen();
    expect(
      within(screen.getByTestId('categories-screen')).queryByTestId('categories-item-Dog'),
    ).toBeNull();
  });
});
