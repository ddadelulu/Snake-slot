import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { draftStorageKey } from '@/features/onboarding/OnboardingProvider';
import { i18n } from '@/i18n';
import { readEnv } from '@/lib/env';
import { getSupabase, getSupabaseIfConfigured } from '@/lib/supabase';
import { fakeSession } from '@/test/appHarness';
import { createFakeSupabase, type FakeSupabaseState } from '@/test/fakeSupabase';

jest.mock('@react-native-community/slider', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => createElement(View, props),
  };
});
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));
jest.mock('@/lib/env', () => ({ ...jest.requireActual('@/lib/env'), readEnv: jest.fn() }));
jest.mock('@/lib/supabase', () => ({
  getSupabase: jest.fn(),
  getSupabaseIfConfigured: jest.fn(),
  authRedirectUrl: jest.fn(() => 'batzen://auth/callback'),
}));

const OVERVIEW = {
  today: '2026-10-02',
  period: {
    id: 'period-1',
    starts_on: '2026-09-25',
    ends_on: '2026-10-25',
    income_rappen: 620000,
    fixed_costs_rappen: 185000,
    savings_rappen: 0,
    carried_over_rappen: 0,
  },
  categories: [],
  uncategorized_spent_rappen: 0,
  recent_transactions: [],
};

let fake: ReturnType<typeof createFakeSupabase>;
let submitted: unknown;

function start(state: Partial<FakeSupabaseState['profile']> = {}) {
  fake = createFakeSupabase({
    session: fakeSession(),
    profile: state,
    rpc: {
      complete_onboarding: (args) => {
        submitted = (args as { p: unknown }).p;
        fake.state.profile = {
          ...fake.state.profile,
          onboarding_completed_at: '2026-10-02T08:00:00.000000+00:00',
        };
        return { data: 'period-1', error: null };
      },
      get_overview: () => ({ data: OVERVIEW, error: null }),
    },
  });
  jest.mocked(getSupabaseIfConfigured).mockReturnValue(fake.client as never);
  jest.mocked(getSupabase).mockReturnValue(fake.client as never);
  renderRouter('src/app', { initialUrl: '/' });
}

async function continueTo(step: string) {
  fireEvent.press(screen.getByTestId('onboarding-continue'));
  expect(await screen.findByTestId(`onboarding-${step}`)).toBeOnTheScreen();
}

beforeEach(async () => {
  jest.clearAllMocks();
  submitted = undefined;
  jest.mocked(readEnv).mockReturnValue({
    ok: true,
    supabaseUrl: 'http://127.0.0.1:54321',
    supabaseKey: 'publishable-key',
    appEnv: 'development',
  });
  await AsyncStorage.clear();
  await i18n.changeLanguage('en');
});

describe('onboarding', () => {
  it('sends a signed-in user without a month to the first step', async () => {
    start();
    expect(await screen.findByTestId('onboarding-income')).toBeOnTheScreen();
    expect(screen.getByTestId('onboarding-progress')).toHaveAccessibilityValue({
      min: 1,
      max: 10,
      now: 1,
      text: 'Step 1 of 10',
    });
    expect(screen.queryByTestId('onboarding-back')).toBeNull();
  });

  it('asks for income and payday before moving on', async () => {
    start();
    fireEvent.press(await screen.findByTestId('onboarding-continue'));
    expect(await screen.findByText('Enter your net income.')).toBeOnTheScreen();
    expect(screen.getByText('Choose the day your salary arrives.')).toBeOnTheScreen();
    expect(screen.getByTestId('onboarding-income')).toBeOnTheScreen();
  });

  it('goes through every step and starts the month', async () => {
    start();
    fireEvent.changeText(await screen.findByTestId('onboarding-net-income'), "6'200");
    fireEvent.press(screen.getByTestId('onboarding-payday-25'));
    await continueTo('fixed-costs');

    fireEvent.changeText(screen.getByTestId('onboarding-fixed-rent'), '1850');
    expect(screen.getByTestId('onboarding-fixed-total')).toHaveTextContent(
      'Fixed costs per month: CHF 1,850.00',
    );
    await continueTo('savings');

    fireEvent.press(screen.getByTestId('onboarding-skip'));
    expect(await screen.findByTestId('onboarding-categories')).toBeOnTheScreen();
    await continueTo('budgets');

    expect(screen.getByTestId('onboarding-spendable')).toHaveTextContent('CHF 4,350.00');
    await continueTo('payment');
    fireEvent.press(screen.getByTestId('onboarding-payment-twint'));
    await continueTo('pain');
    await continueTo('notifications');
    await continueTo('sources');

    // Step 9: paying with TWINT suggests importing a statement right after setup.
    expect(screen.getByTestId('onboarding-progress')).toHaveAccessibilityValue({
      min: 1,
      max: 10,
      now: 9,
      text: 'Step 9 of 10',
    });
    expect(screen.getByTestId('onboarding-sources-import')).toBeChecked();
    expect(screen.getByTestId('onboarding-sources-import')).toHaveAccessibleName(
      'Import a statement right after setup, Suggested because you pay by card or phone.',
    );
    await continueTo('summary');

    expect(screen.getByTestId('summary-spendable')).toHaveTextContent(/CHF 4,350\.00/);
    fireEvent.press(screen.getByTestId('onboarding-continue'));

    // Once the month is saved, the import opens on top of Home; "Not now" leads Home.
    expect(await screen.findByTestId('import-choose')).toBeOnTheScreen();
    expect(screen.getByTestId('import-header-back')).toHaveTextContent('Not now');
    fireEvent.press(screen.getByTestId('import-header-back'));
    expect(await screen.findByTestId('home-screen')).toBeOnTheScreen();
    expect(submitted).toMatchObject({
      profile: {
        net_income_rappen: 620000,
        payday: 25,
        payment_methods: ['twint'],
        language: 'en',
      },
      fixed_costs: [{ kind: 'rent', label: null, amount_rappen: 185000 }],
    });
    await waitFor(async () =>
      expect(await AsyncStorage.getItem(draftStorageKey(fakeSession().user.id))).toBeNull(),
    );
  });

  it('goes back one step', async () => {
    start();
    fireEvent.changeText(await screen.findByTestId('onboarding-net-income'), '5000');
    fireEvent.press(screen.getByTestId('onboarding-payday-1'));
    await continueTo('fixed-costs');
    fireEvent.press(screen.getByTestId('onboarding-back'));
    expect(await screen.findByTestId('onboarding-income')).toBeOnTheScreen();
    expect(screen.getByTestId('onboarding-net-income').props.value).toBe('5000');
  });

  it('resumes at the furthest step reached', async () => {
    await AsyncStorage.setItem(
      draftStorageKey(fakeSession().user.id),
      JSON.stringify({ version: 1, netIncome: '5000', payday: 1, reached: 3 }),
    );
    start();
    expect(await screen.findByTestId('onboarding-categories')).toBeOnTheScreen();
  });

  it('resumes a draft saved before step 9 existed at step 9 instead of the summary', async () => {
    await AsyncStorage.setItem(
      draftStorageKey(fakeSession().user.id),
      JSON.stringify({ version: 1, netIncome: '5000', payday: 1, paymentMethods: ['cash'], reached: 8 }),
    );
    start();
    expect(await screen.findByTestId('onboarding-sources')).toBeOnTheScreen();
    // Paying only cash: no import suggested, so starting the month leads Home.
    expect(screen.getByTestId('onboarding-sources-import')).not.toBeChecked();
    await continueTo('summary');
    fireEvent.press(screen.getByTestId('onboarding-continue'));
    expect(await screen.findByTestId('home-screen')).toBeOnTheScreen();
    expect(screen.queryByTestId('import-screen')).toBeNull();
  });

  it('skipping step 9 means no import after setup', async () => {
    await AsyncStorage.setItem(
      draftStorageKey(fakeSession().user.id),
      JSON.stringify({ version: 2, netIncome: '5000', payday: 1, paymentMethods: ['card'], reached: 8 }),
    );
    start();
    expect(await screen.findByTestId('onboarding-sources')).toBeOnTheScreen();
    expect(screen.getByTestId('onboarding-sources-import')).toBeChecked();
    fireEvent.press(screen.getByTestId('onboarding-skip'));
    expect(await screen.findByTestId('onboarding-summary')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('onboarding-continue'));
    expect(await screen.findByTestId('home-screen')).toBeOnTheScreen();
    expect(screen.queryByTestId('import-screen')).toBeNull();
  });

  it('turns the import on for someone who pays cash only', async () => {
    await AsyncStorage.setItem(
      draftStorageKey(fakeSession().user.id),
      JSON.stringify({ version: 2, netIncome: '5000', payday: 1, paymentMethods: ['cash'], reached: 8 }),
    );
    start();
    expect(await screen.findByTestId('onboarding-sources-import')).toHaveAccessibleName(
      'Import a statement right after setup, You pay cash, so adding by hand may be all you need.',
    );
    fireEvent.press(screen.getByTestId('onboarding-sources-import'));
    expect(screen.getByTestId('onboarding-sources-import')).toBeChecked();
    await continueTo('summary');
    fireEvent.press(screen.getByTestId('onboarding-continue'));
    expect(await screen.findByTestId('import-choose')).toBeOnTheScreen();
  });

  it('shows a clear message when saving fails and stays on the summary', async () => {
    await AsyncStorage.setItem(
      draftStorageKey(fakeSession().user.id),
      JSON.stringify({ version: 2, netIncome: '5000', payday: 1, reached: 9 }),
    );
    start();
    fake.state.rpc.complete_onboarding = () => ({
      data: null,
      error: { message: 'connection lost' },
    });
    fireEvent.press(await screen.findByTestId('onboarding-continue'));
    expect(await screen.findByTestId('onboarding-summary-error')).toBeOnTheScreen();
    expect(screen.getByTestId('onboarding-summary')).toBeOnTheScreen();

    // A second try that works still opens the import chosen on step 9.
    fake.state.rpc.complete_onboarding = () => {
      fake.state.profile = {
        ...fake.state.profile,
        onboarding_completed_at: '2026-10-02T08:00:00.000000+00:00',
      };
      return { data: 'period-1', error: null };
    };
    fireEvent.press(screen.getByTestId('onboarding-continue'));
    expect(await screen.findByTestId('import-choose')).toBeOnTheScreen();
  });

  it('sends a user who already has a month straight to Home', async () => {
    start({ onboarding_completed_at: '2026-09-25T08:00:00.000000+00:00' });
    expect(await screen.findByTestId('home-screen')).toBeOnTheScreen();
  });
});
