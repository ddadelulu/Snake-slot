import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { i18n } from '@/i18n';
import { readEnv } from '@/lib/env';
import type { RpcHandler } from '@/test/fakeSupabase';
import { categoryDetailJson } from '@/test/m4Fixture';
import { ok, page, refused, rpcCalls, startApp, transactionJson } from '@/test/transactionsFixture';

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));
jest.mock('@/lib/env', () => ({ ...jest.requireActual('@/lib/env'), readEnv: jest.fn() }));
jest.mock('@/lib/supabase', () => ({
  getSupabase: jest.fn(),
  getSupabaseIfConfigured: jest.fn(),
  authRedirectUrl: jest.fn(() => 'batzen://auth/callback'),
}));

const MIGROS = transactionJson({
  id: 't-migros',
  merchant: 'Migros',
  amount_rappen: -4250,
  category_id: 'c-groceries',
  categorized_by: 'user',
});

function start(url = '/category/c-groceries', rpc: Record<string, RpcHandler> = {}) {
  return startApp({
    url,
    rpc: {
      get_category_detail: () => ok(categoryDetailJson()),
      list_transactions: () => ok(page([MIGROS])),
      set_budget: () => ok(null),
      ...rpc,
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

describe('category detail', () => {
  it('opens from a category card on Home', async () => {
    const fake = start('/');
    fireEvent.press(await screen.findByTestId('home-category-groceries'));
    expect(await screen.findByTestId('category-name')).toHaveTextContent('Groceries');
    expect(rpcCalls(fake, 'get_category_detail')).toEqual([{ p_category_id: 'c-groceries' }]);
  });

  it('shows budget, spent, left, rollover, pace, six months and its purchases', async () => {
    const fake = start();
    expect(await screen.findByTestId('category-budget')).toHaveTextContent('CHF 900.00');
    expect(screen.getByTestId('category-spent')).toHaveTextContent('CHF 230.00');
    // 900 + 25 rolled over − 230.
    expect(screen.getByTestId('category-left')).toHaveTextContent('CHF 695.00');
    expect(screen.getByTestId('category-rollover')).toHaveTextContent('From last month: CHF 25.00');
    // 230 in 8 days of a 30-day month: 925 lasts until payday.
    expect(screen.getByTestId('category-pace')).toHaveTextContent(
      'At this pace, the budget lasts until payday.',
    );
    expect(screen.getByTestId('category-history-2')).toHaveProp(
      'accessibilityLabel',
      'May: spent CHF 950.00 of CHF 900.00',
    );
    expect(screen.getByTestId('category-history-5')).toBeOnTheScreen();
    expect(await screen.findByTestId('category-transaction-0')).toHaveTextContent(/Migros/);
    expect(rpcCalls(fake, 'list_transactions')).toEqual([
      { p: { limit: 50, category_ids: ['c-groceries'] } },
    ]);
  });

  it('warns when the budget runs out before payday', async () => {
    start('/category/c-groceries', {
      get_category_detail: () =>
        ok(categoryDetailJson({ spent_rappen: 80000, rollover_rappen: 0 })),
    });
    expect(await screen.findByTestId('category-pace')).toHaveTextContent(
      'At this pace, the budget runs out on 3 October.',
    );
  });

  it('changes the budget of this month', async () => {
    const fake = start();
    fireEvent.press(await screen.findByTestId('category-edit-budget'));
    const input = await screen.findByTestId('category-budget-input');
    expect(input).toHaveProp('value', '900.00');
    fireEvent.changeText(input, 'abc');
    fireEvent.press(screen.getByTestId('category-budget-save'));
    expect(
      await screen.findByText('Enter an amount in francs, e.g. 400 or 400.50.'),
    ).toBeOnTheScreen();
    fireEvent.changeText(input, '750');
    fireEvent.press(screen.getByTestId('category-budget-save'));
    await waitFor(() =>
      expect(rpcCalls(fake, 'set_budget')).toEqual([
        { p_category_id: 'c-groceries', p_amount_rappen: 75000 },
      ]),
    );
    await waitFor(() => expect(rpcCalls(fake, 'get_category_detail')).toHaveLength(2));
  });

  it('says when the budget cannot be saved', async () => {
    start('/category/c-groceries', { set_budget: () => refused('boom') });
    fireEvent.press(await screen.findByTestId('category-edit-budget'));
    fireEvent.press(await screen.findByTestId('category-budget-save'));
    expect(await screen.findByTestId('category-budget-error')).toBeOnTheScreen();
  });

  it('says when the category does not exist', async () => {
    start('/category/c-nope', { get_category_detail: () => refused('category_not_found') });
    expect(await screen.findByTestId('category-not-found')).toBeOnTheScreen();
  });

  it('offers a retry when the category cannot be loaded', async () => {
    start('/category/c-groceries', { get_category_detail: () => refused('boom') });
    expect(await screen.findByTestId('category-load-error')).toBeOnTheScreen();
  });
});
