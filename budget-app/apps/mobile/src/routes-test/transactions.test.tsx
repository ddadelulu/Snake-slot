import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { LANGUAGE_STORAGE_KEY, i18n } from '@/i18n';
import { readEnv } from '@/lib/env';
import { OVERVIEW_JSON } from '@/test/overviewFixture';
import {
  ok,
  page,
  rpcCalls,
  startApp,
  transactionJson,
  type TransactionJson,
} from '@/test/transactionsFixture';

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));
jest.mock('@/lib/env', () => ({ ...jest.requireActual('@/lib/env'), readEnv: jest.fn() }));
jest.mock('@/lib/supabase', () => ({
  getSupabase: jest.fn(),
  getSupabaseIfConfigured: jest.fn(),
  authRedirectUrl: jest.fn(() => 'batzen://auth/callback'),
}));

type ListArgs = { p: Record<string, unknown> };

const ITEMS: TransactionJson[] = [
  transactionJson({
    id: 't-migros',
    amount_rappen: -4250,
    booked_at: '2026-10-02T10:15:00+00:00',
    merchant: 'Migros',
    category_id: 'c-groceries',
    categorized_by: 'user',
    category_confidence: 100,
  }),
  transactionJson({
    id: 't-manor',
    amount_rappen: -8400,
    booked_at: '2026-10-02T08:00:00+00:00',
    merchant: 'Manor',
    raw_text: 'Kauf MANOR AG 0815',
    source: 'statement_import',
    needs_review: true,
  }),
  transactionJson({
    id: 't-coop',
    amount_rappen: -9000,
    booked_at: '2026-10-01T16:00:00+00:00',
    merchant: 'Coop',
    splits: [
      { id: 's-1', category_id: 'c-groceries', amount_rappen: -7000, note: null },
      { id: 's-2', category_id: 'c-dog', amount_rappen: -2000, note: null },
    ],
  }),
  transactionJson({
    id: 't-rent',
    amount_rappen: -185000,
    booked_at: '2026-10-01T06:00:00+00:00',
    merchant: 'Verwaltung Muster',
    source: 'statement_import',
    fixed_cost_id: 'f-rent',
  }),
  transactionJson({
    id: 't-refund',
    amount_rappen: 2000,
    booked_at: '2026-09-28T09:00:00+00:00',
    merchant: null,
    note: 'Refund jacket',
    category_id: 'c-old',
  }),
];

/** list_transactions over ITEMS with the filters the screen sends; pages of `pageSize`. */
function listHandler(items: TransactionJson[], pageSize = 50) {
  return (args: unknown) => {
    const p = (args as ListArgs).p;
    let rows = items;
    const search = typeof p.search === 'string' ? p.search.toLowerCase() : '';
    if (search) {
      rows = rows.filter((row) =>
        [row.merchant, row.note, row.raw_text].some(
          (text) => typeof text === 'string' && text.toLowerCase().includes(search),
        ),
      );
    }
    const cursor = p.cursor as { id: string } | undefined;
    const start = cursor ? rows.findIndex((row) => row.id === cursor.id) + 1 : 0;
    const slice = rows.slice(start, start + pageSize);
    const last = slice[slice.length - 1];
    const more = start + pageSize < rows.length && last !== undefined;
    return ok(page(slice, more ? { booked_at: String(last.booked_at), id: last.id } : null));
  };
}

function start(
  options: { list?: (args: unknown) => ReturnType<typeof ok>; overview?: unknown } = {},
) {
  return startApp({
    url: '/transactions',
    overview: options.overview,
    rpc: {
      list_transactions: options.list ?? listHandler(ITEMS),
      get_transaction: (args) =>
        ok(ITEMS.find((item) => item.id === (args as { p_id: string }).p_id) ?? null),
    },
  });
}

function lastListParams(fake: ReturnType<typeof start>) {
  const calls = rpcCalls(fake, 'list_transactions') as ListArgs[];
  return calls[calls.length - 1]?.p;
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

describe('transactions tab', () => {
  it('lists everything newest first, by day, with category and day', async () => {
    const fake = start();
    const migros = await screen.findByTestId('transactions-row-t-migros');
    expect(lastListParams(fake)).toEqual({ limit: 50 });
    expect(migros).toHaveTextContent(/Migros/);
    expect(migros).toHaveTextContent(/Groceries · 2 Oct/);
    expect(migros).toHaveTextContent(/CHF 42\.50/);
    expect(screen.getByTestId('transactions-row-t-manor')).toHaveTextContent(
      /Not categorized · 2 Oct/,
    );
    expect(screen.getByTestId('transactions-row-t-coop')).toHaveTextContent(/Split · 1 Oct/);
    expect(await screen.findByText(/Rent \(fixed cost\) · 1 Oct/)).toBeOnTheScreen();
    const refund = screen.getByTestId('transactions-row-t-refund');
    expect(refund).toHaveTextContent(/Refund jacket/);
    expect(refund).toHaveTextContent(/Old hobby · 28 Sept?/);
    expect(refund).toHaveTextContent(/CHF \+20\.00/);

    expect(screen.getByTestId('transactions-day-2026-10-02')).toHaveTextContent(
      /Friday, 2 October/,
    );
    expect(screen.getByTestId('transactions-day-2026-10-01')).toHaveTextContent(
      /Thursday, 1 October/,
    );
  });

  it('opens a transaction', async () => {
    const app = start();
    fireEvent.press(await screen.findByTestId('transactions-row-t-migros'));
    expect(await screen.findByTestId('detail-amount')).toHaveTextContent('CHF 42.50');
    expect(app.getPathname()).toBe('/transaction/t-migros');
  });

  it('searches merchant, note and statement text once typing stops', async () => {
    const fake = start();
    await screen.findByTestId('transactions-row-t-migros');
    fireEvent.changeText(screen.getByTestId('transactions-search'), 'manor');
    await waitFor(() => expect(lastListParams(fake)).toEqual({ limit: 50, search: 'manor' }));
    // The previous list stays on screen until the search answer arrives.
    await waitFor(() => expect(screen.queryByTestId('transactions-row-t-migros')).toBeNull());
    expect(screen.getByTestId('transactions-row-t-manor')).toBeOnTheScreen();
  });

  it('offers to show everything when nothing matches', async () => {
    start();
    await screen.findByTestId('transactions-row-t-migros');
    fireEvent.changeText(screen.getByTestId('transactions-search'), 'zalando');
    expect(await screen.findByTestId('transactions-no-matches')).toHaveTextContent(/Nothing found/);
    fireEvent.press(screen.getByTestId('transactions-no-matches-action'));
    expect(await screen.findByTestId('transactions-row-t-migros')).toBeOnTheScreen();
    expect(screen.getByTestId('transactions-search')).toHaveProp('value', '');
  });

  it('filters by categories, including "Not categorized"', async () => {
    const fake = start();
    await screen.findByTestId('transactions-row-t-migros');
    const chip = screen.getByTestId('transactions-filter-category');
    expect(chip).toHaveAccessibleName('Category: All');
    fireEvent.press(chip);
    expect(await screen.findByText('Show categories')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('transactions-category-groceries'));
    expect(screen.getByTestId('transactions-filter-category')).toHaveAccessibleName(
      'Category: Groceries',
    );
    fireEvent.press(screen.getByTestId('transactions-category-none'));
    fireEvent.press(screen.getByTestId('transactions-category-done'));
    await waitFor(() =>
      expect(lastListParams(fake)).toEqual({
        limit: 50,
        category_ids: ['c-groceries'],
        uncategorized: true,
      }),
    );
    expect(screen.getByTestId('transactions-filter-category')).toHaveAccessibleName(
      'Category: 2 selected',
    );

    fireEvent.press(screen.getByTestId('transactions-filter-category'));
    fireEvent.press(await screen.findByTestId('transactions-category-clear'));
    // Back to the unfiltered list, which is still in the cache.
    expect(screen.getByTestId('transactions-filter-category')).toHaveAccessibleName(
      'Category: All',
    );
    expect(await screen.findByTestId('transactions-row-t-migros')).toBeOnTheScreen();
  });

  it('filters by source and by budget month', async () => {
    const fake = start();
    await screen.findByTestId('transactions-row-t-migros');

    fireEvent.press(screen.getByTestId('transactions-filter-source'));
    fireEvent.press(await screen.findByTestId('transactions-source-manual'));
    await waitFor(() => expect(lastListParams(fake)).toEqual({ limit: 50, sources: ['manual'] }));
    expect(screen.getByTestId('transactions-filter-source')).toHaveAccessibleName(
      'Source: By hand',
    );

    fireEvent.press(screen.getByTestId('transactions-filter-source'));
    fireEvent.press(await screen.findByTestId('transactions-source-statement_import'));
    await waitFor(() =>
      expect(lastListParams(fake)).toEqual({ limit: 50, sources: ['statement_import'] }),
    );

    fireEvent.press(screen.getByTestId('transactions-filter-period'));
    fireEvent.press(await screen.findByTestId('transactions-period-this_month'));
    await waitFor(() =>
      expect(lastListParams(fake)).toEqual({
        limit: 50,
        sources: ['statement_import'],
        from: '2026-09-25',
        to: '2026-10-24',
      }),
    );

    fireEvent.press(screen.getByTestId('transactions-filter-period'));
    fireEvent.press(await screen.findByTestId('transactions-period-last_month'));
    await waitFor(() =>
      expect(lastListParams(fake)).toMatchObject({ from: '2026-08-25', to: '2026-09-24' }),
    );
    expect(screen.getByTestId('transactions-filter-period')).toHaveAccessibleName(
      'Period: Last month',
    );
  });

  it('loads the next page at the end of the list', async () => {
    const fake = start({ list: listHandler(ITEMS, 2) });
    await screen.findByTestId('transactions-row-t-manor');
    expect(screen.queryByTestId('transactions-row-t-coop')).toBeNull();
    await act(async () => {
      fireEvent(screen.getByTestId('transactions-list'), 'endReached');
    });
    expect(await screen.findByTestId('transactions-row-t-coop')).toBeOnTheScreen();
    expect(lastListParams(fake)).toEqual({
      limit: 50,
      cursor: { booked_at: '2026-10-02T08:00:00+00:00', id: 't-manor' },
    });
  });

  it('keeps the loaded pages when the next one fails, with a retry', async () => {
    let failNext = true;
    const pages = listHandler(ITEMS, 2);
    start({
      list: (args) => {
        if ((args as ListArgs).p.cursor && failNext) {
          return { data: null, error: { message: 'timeout' } } as never;
        }
        return pages(args);
      },
    });
    await screen.findByTestId('transactions-row-t-manor');
    await act(async () => {
      fireEvent(screen.getByTestId('transactions-list'), 'endReached');
    });
    expect(await screen.findByTestId('transactions-more-error')).toHaveTextContent(
      /More transactions could not be loaded/,
    );
    expect(screen.getByTestId('transactions-row-t-migros')).toBeOnTheScreen();
    failNext = false;
    fireEvent.press(screen.getByTestId('transactions-more-error-action'));
    expect(await screen.findByTestId('transactions-row-t-coop')).toBeOnTheScreen();
  });

  it('says when there is nothing yet', async () => {
    start({ list: () => ok(page([])) });
    expect(await screen.findByTestId('transactions-empty')).toHaveTextContent(
      /No transactions yet/,
    );
  });

  it('offers a retry when the list cannot be loaded', async () => {
    let calls = 0;
    const items = listHandler(ITEMS);
    start({
      list: (args) => {
        calls += 1;
        return calls === 1
          ? ({ data: null, error: { message: 'bad request' } } as never)
          : items(args);
      },
    });
    expect(await screen.findByTestId('transactions-error')).toHaveTextContent(
      /Your transactions could not be loaded/,
    );
    fireEvent.press(screen.getByTestId('transactions-error-action'));
    expect(await screen.findByTestId('transactions-row-t-migros')).toBeOnTheScreen();
  });

  it('leads to the questions when this month has purchases to review', async () => {
    const app = start({ overview: { ...OVERVIEW_JSON, needs_review_count: 2 } });
    const entry = await screen.findByTestId('transactions-review');
    expect(entry).toHaveAccessibleName('2 purchases this month to review');
    fireEvent.press(entry);
    await waitFor(() => expect(app.getPathname()).toBe('/review'));
  });

  it('shows no review entry when nothing waits', async () => {
    start({ overview: { ...OVERVIEW_JSON, needs_review_count: 0 } });
    await screen.findByTestId('transactions-row-t-migros');
    expect(screen.queryByTestId('transactions-review')).toBeNull();
  });

  it('speaks Swiss German', async () => {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, 'de');
    start();
    const row = await screen.findByTestId('transactions-row-t-manor');
    expect(row).toHaveTextContent(/Ohne Kategorie/);
    expect(screen.getByTestId('transactions-filter-source')).toHaveAccessibleName(
      'Quelle: Alle Quellen',
    );
  });
});
