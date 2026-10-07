import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { i18n } from '@/i18n';
import { readEnv } from '@/lib/env';
import { getSupabase, getSupabaseIfConfigured } from '@/lib/supabase';
import { fakeSession } from '@/test/appHarness';
import { createFakeSupabase } from '@/test/fakeSupabase';
import { OVERVIEW_JSON } from '@/test/overviewFixture';
import { CATEGORY_ROWS, FIXED_COST_ROWS, page, transactionJson } from '@/test/transactionsFixture';

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));
jest.mock('@/lib/env', () => ({ ...jest.requireActual('@/lib/env'), readEnv: jest.fn() }));
jest.mock('@/lib/supabase', () => ({
  getSupabase: jest.fn(),
  getSupabaseIfConfigured: jest.fn(),
  authRedirectUrl: jest.fn(() => 'batzen://auth/callback'),
}));

type Answer = { data: unknown; error: { message: string } | null };

function start(overview: () => Answer) {
  const fake = createFakeSupabase({
    session: fakeSession(),
    profile: { onboarding_completed_at: '2026-09-25T08:00:00.000000+00:00', language: 'en' },
    rpc: {
      get_overview: overview,
      get_transaction: (args) => ({
        data: transactionJson({
          id: (args as { p_id: string }).p_id,
          amount_rappen: -4250,
          merchant: 'Migros',
          category_id: 'c-groceries',
          categorized_by: 'user',
        }),
        error: null,
      }),
      list_transactions: () => ({ data: page([]), error: null }),
    },
    tables: { categories: [...CATEGORY_ROWS], fixed_costs: [...FIXED_COST_ROWS] },
  });
  jest.mocked(getSupabaseIfConfigured).mockReturnValue(fake.client as never);
  jest.mocked(getSupabase).mockReturnValue(fake.client as never);
  const rendered = renderRouter('src/app', { initialUrl: '/' });
  return { ...fake, getPathname: () => rendered.getPathname() };
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

describe('home', () => {
  it('shows the month like a bank balance', async () => {
    start(() => ({ data: OVERVIEW_JSON, error: null }));
    const balance = await screen.findByTestId('home-balance');
    expect(balance).toHaveTextContent(/2,759\.50/);
    expect(balance).toHaveTextContent(/left this month/);
    expect(balance).toHaveTextContent(/CHF 119\.97/);
    expect(balance).toHaveTextContent(/23/);
    expect(balance).toHaveTextContent(/days until payday/);
    expect(screen.getByTestId('home-pace')).toHaveTextContent(
      'At this pace, your money lasts until payday.',
    );
    expect(screen.getByTestId('home-carried')).toHaveTextContent(
      'Includes CHF 45.00 from last month.',
    );
  });

  it('shows each category with what is left, and overspending in red', async () => {
    start(() => ({ data: OVERVIEW_JSON, error: null }));
    expect(await screen.findByTestId('home-category-groceries')).toHaveTextContent(
      /CHF 670\.00 left/,
    );
    expect(screen.getByTestId('home-category-eating_out')).toHaveTextContent(/CHF 10\.00 over/);
    expect(screen.getByTestId('home-category-Dog')).toHaveTextContent(/CHF 105\.00 left/);
    expect(screen.getByTestId('home-uncategorized')).toHaveTextContent(
      'Not categorized yet: CHF 15.00',
    );
  });

  it('lists the latest purchases with category and date', async () => {
    start(() => ({ data: OVERVIEW_JSON, error: null }));
    const first = await screen.findByTestId('home-transaction-0');
    expect(first).toHaveTextContent(/Migros/);
    expect(first).toHaveTextContent(/Groceries · 2 Oct/);
    expect(first).toHaveTextContent(/CHF 42\.50/);
    expect(screen.getByTestId('home-transaction-1')).toHaveTextContent(/CHF \+5\.00/);
  });

  it('says so when there are no purchases yet', async () => {
    start(() => ({
      data: { ...OVERVIEW_JSON, recent_transactions: [] },
      error: null,
    }));
    expect(await screen.findByTestId('home-no-transactions')).toHaveTextContent(
      'No purchases yet this month.',
    );
  });

  it('offers a retry when the month cannot be loaded', async () => {
    let calls = 0;
    start(() => {
      calls += 1;
      return calls === 1
        ? { data: null, error: { message: 'bad request' } }
        : { data: OVERVIEW_JSON, error: null };
    });
    expect(await screen.findByTestId('home-error')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('home-error-action'));
    expect(await screen.findByTestId('home-balance')).toBeOnTheScreen();
  });

  it('opens quick add from the floating + button', async () => {
    const app = start(() => ({ data: OVERVIEW_JSON, error: null }));
    const add = await screen.findByTestId('home-add');
    expect(add).toHaveAccessibleName('Add a purchase');
    fireEvent.press(add);
    expect(await screen.findByTestId('add-amount')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/add');
  });

  it('keeps the + button when the month cannot be loaded', async () => {
    start(() => ({ data: null, error: { message: 'bad request' } }));
    expect(await screen.findByTestId('home-error')).toBeOnTheScreen();
    expect(screen.getByTestId('home-add')).toBeOnTheScreen();
  });

  it('says how many purchases need a category and leads to the questions', async () => {
    const app = start(() => ({ data: { ...OVERVIEW_JSON, needs_review_count: 3 }, error: null }));
    const banner = await screen.findByTestId('home-review');
    expect(banner).toHaveAccessibleName('3 purchases need a category');
    fireEvent.press(banner);
    expect(await screen.findByTestId('review-screen')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/review');
  });

  it('uses the singular for one purchase and shows nothing when none waits', async () => {
    start(() => ({ data: OVERVIEW_JSON, error: null }));
    expect(await screen.findByTestId('home-review')).toHaveAccessibleName(
      '1 purchase needs a category',
    );
    screen.unmount();
    start(() => ({ data: { ...OVERVIEW_JSON, needs_review_count: 0 }, error: null }));
    await screen.findByTestId('home-balance');
    expect(screen.queryByTestId('home-review')).toBeNull();
  });

  it('opens a recent purchase', async () => {
    const app = start(() => ({ data: OVERVIEW_JSON, error: null }));
    fireEvent.press(await screen.findByTestId('home-transaction-0'));
    expect(await screen.findByTestId('detail-amount')).toHaveTextContent('CHF 42.50');
    expect(app.getPathname()).toBe('/transaction/t-1');
  });
});
