import AsyncStorage from '@react-native-async-storage/async-storage';
import { addDays, localDateIn } from '@budget/core';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { LANGUAGE_STORAGE_KEY, i18n } from '@/i18n';
import { readEnv } from '@/lib/env';
import type { RpcHandler } from '@/test/fakeSupabase';
import { ok, refused, rpcCalls, startApp } from '@/test/transactionsFixture';

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));
jest.mock('@/lib/env', () => ({ ...jest.requireActual('@/lib/env'), readEnv: jest.fn() }));
jest.mock('@/lib/supabase', () => ({
  getSupabase: jest.fn(),
  getSupabaseIfConfigured: jest.fn(),
  authRedirectUrl: jest.fn(() => 'batzen://auth/callback'),
}));

type AddArgs = { p: { rows: Record<string, unknown>[]; dry_run: boolean } };

function addResult(outcome: 'added' | 'merged' | 'already_imported') {
  return {
    data_source_id: null,
    results: [
      {
        index: 0,
        outcome,
        transaction_id: outcome === 'already_imported' ? null : 't-new',
        duplicate_of: null,
        category_id: null,
        categorized_by: 'user',
        category_confidence: 100,
        fixed_cost_id: null,
        needs_review: false,
      },
    ],
    counts: {
      added: outcome === 'added' ? 1 : 0,
      merged: outcome === 'merged' ? 1 : 0,
      already_imported: outcome === 'already_imported' ? 1 : 0,
      possible_duplicate: 0,
      needs_review: 0,
    },
  };
}

function start(addTransactions: RpcHandler = () => ok(addResult('added'))) {
  return startApp({ url: '/add', rpc: { add_transactions: addTransactions } });
}

/** The one row sent by the last add_transactions call. */
function sentRow(fake: ReturnType<typeof start>) {
  const calls = rpcCalls(fake, 'add_transactions') as AddArgs[];
  const last = calls[calls.length - 1];
  expect(last?.p.rows).toHaveLength(1);
  expect(last?.p.dry_run).toBe(false);
  return last?.p.rows[0];
}

const today = () => localDateIn(new Date(), 'Europe/Zurich');

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

describe('quick add', () => {
  it('saves amount and one category, booked now, and returns to Home', async () => {
    const fake = start();
    const amount = await screen.findByTestId('add-amount');
    expect(amount).toHaveProp('autoFocus', true);
    expect(amount).toHaveProp('keyboardType', 'decimal-pad');
    expect(await screen.findByTestId('add-category-groceries')).toBeOnTheScreen();
    expect(screen.getByTestId('add-category-eating_out')).toHaveTextContent('Eating out');
    expect(screen.getByTestId('add-category-Dog')).toBeOnTheScreen();
    expect(screen.queryByTestId('add-category-Old hobby')).toBeNull();

    const before = Date.now();
    fireEvent.changeText(amount, '12,50');
    fireEvent.press(screen.getByTestId('add-category-groceries'));
    fireEvent.press(screen.getByTestId('add-save'));

    expect(await screen.findByTestId('home-screen')).toBeOnTheScreen();
    const row = sentRow(fake);
    expect(row).toEqual({
      amount_rappen: -1250,
      booked_at: expect.any(String),
      merchant: null,
      raw_text: null,
      mcc: null,
      source: 'manual',
      external_id: null,
      category_id: 'c-groceries',
    });
    const bookedAt = Date.parse(String(row?.booked_at));
    expect(bookedAt).toBeGreaterThanOrEqual(before - 1000);
    expect(bookedAt).toBeLessThanOrEqual(Date.now() + 1000);
    // Home shows the new state at once: the month is loaded again.
    await waitFor(() => expect(rpcCalls(fake, 'get_overview').length).toBeGreaterThanOrEqual(1));
  });

  it('says what is missing and sends nothing', async () => {
    const fake = start();
    fireEvent.press(await screen.findByTestId('add-save'));
    expect(await screen.findByText('Enter the amount.')).toBeOnTheScreen();
    expect(screen.getByTestId('add-category-error')).toHaveTextContent('Choose a category.');

    fireEvent.changeText(screen.getByTestId('add-amount'), '-3');
    expect(
      await screen.findByText('Enter an amount in francs above zero, e.g. 12.50 or 12,50.'),
    ).toBeOnTheScreen();
    expect(rpcCalls(fake, 'add_transactions')).toHaveLength(0);
  });

  it('records money in as a positive amount, a category being optional', async () => {
    const fake = start();
    fireEvent.changeText(await screen.findByTestId('add-amount'), '20');
    fireEvent.press(screen.getByTestId('add-money-in'));
    fireEvent.press(screen.getByTestId('add-save'));
    expect(await screen.findByTestId('home-screen')).toBeOnTheScreen();
    const row = sentRow(fake);
    expect(row?.amount_rappen).toBe(2000);
    expect(row).not.toHaveProperty('category_id');
  });

  it('adds where and a note', async () => {
    const fake = start();
    fireEvent.changeText(await screen.findByTestId('add-amount'), '4.40');
    fireEvent.press(await screen.findByTestId('add-category-eating_out'));
    fireEvent.changeText(screen.getByTestId('add-merchant'), ' Bäckerei Hug ');
    fireEvent.changeText(screen.getByTestId('add-note'), 'Gipfeli');
    fireEvent.press(screen.getByTestId('add-save'));
    expect(await screen.findByTestId('home-screen')).toBeOnTheScreen();
    expect(sentRow(fake)).toMatchObject({
      merchant: 'Bäckerei Hug',
      note: 'Gipfeli',
      category_id: 'c-eating-out',
    });
  });

  it('books yesterday as a local date', async () => {
    const fake = start();
    fireEvent.changeText(await screen.findByTestId('add-amount'), '9');
    fireEvent.press(await screen.findByTestId('add-category-Dog'));
    fireEvent.press(screen.getByTestId('add-day-yesterday'));
    expect(screen.getByTestId('add-day-yesterday')).toBeChecked();
    fireEvent.press(screen.getByTestId('add-save'));
    expect(await screen.findByTestId('home-screen')).toBeOnTheScreen();
    const row = sentRow(fake);
    expect(row?.booked_on).toBe(addDays(today(), -1));
    expect(row).not.toHaveProperty('booked_at');
  });

  it('picks another day of the last two weeks from a sheet', async () => {
    const fake = start();
    const day = addDays(today(), -5);
    fireEvent.changeText(await screen.findByTestId('add-amount'), '30');
    fireEvent.press(await screen.findByTestId('add-category-groceries'));
    fireEvent.press(screen.getByTestId('add-day-other'));
    expect(await screen.findByText('Which day?')).toBeOnTheScreen();
    expect(screen.getByTestId(`add-day-option-${addDays(today(), -14)}`)).toBeOnTheScreen();
    expect(screen.queryByTestId(`add-day-option-${addDays(today(), -15)}`)).toBeNull();
    fireEvent.press(screen.getByTestId(`add-day-option-${day}`));
    await waitFor(() => expect(screen.getByTestId('add-day-other')).toBeChecked());
    fireEvent.press(screen.getByTestId('add-save'));
    expect(await screen.findByTestId('home-screen')).toBeOnTheScreen();
    expect(sentRow(fake)?.booked_on).toBe(day);
  });

  it('splits the amount across categories, which must add up exactly', async () => {
    const fake = start();
    fireEvent.changeText(await screen.findByTestId('add-amount'), '84');
    fireEvent.press(await screen.findByTestId('add-category-groceries'));
    fireEvent.press(screen.getByTestId('add-split'));

    expect(screen.queryByTestId('add-category-groceries')).toBeNull();
    expect(screen.getByTestId('add-split-editor-remaining')).toHaveTextContent(
      'CHF 84.00 left to assign',
    );
    fireEvent.changeText(screen.getByTestId('add-split-editor-part-0-amount'), '64');
    fireEvent.press(screen.getByTestId('add-split-editor-part-1-category-Dog'));
    fireEvent.changeText(screen.getByTestId('add-split-editor-part-1-amount'), '10');
    expect(screen.getByTestId('add-split-editor-remaining')).toHaveTextContent(
      'CHF 10.00 left to assign',
    );

    fireEvent.press(screen.getByTestId('add-save'));
    expect(await screen.findByTestId('add-split-editor-error')).toHaveTextContent(
      'The parts must add up to exactly CHF 84.00.',
    );
    expect(rpcCalls(fake, 'add_transactions')).toHaveLength(0);

    fireEvent.changeText(screen.getByTestId('add-split-editor-part-1-amount'), '20');
    expect(screen.getByTestId('add-split-editor-remaining')).toHaveTextContent(
      'Everything is assigned',
    );
    fireEvent.press(screen.getByTestId('add-save'));
    expect(await screen.findByTestId('home-screen')).toBeOnTheScreen();
    const row = sentRow(fake);
    expect(row).toMatchObject({
      amount_rappen: -8400,
      splits: [
        { category_id: 'c-groceries', amount_rappen: -6400, note: null },
        { category_id: 'c-dog', amount_rappen: -2000, note: null },
      ],
    });
    expect(row).not.toHaveProperty('category_id');
  });

  it('adds and removes split parts and can go back to one category', async () => {
    start();
    fireEvent.changeText(await screen.findByTestId('add-amount'), '84');
    fireEvent.press(await screen.findByTestId('add-split'));
    fireEvent.press(screen.getByTestId('add-split-editor-add'));
    expect(screen.getByTestId('add-split-editor-part-2')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('add-split-editor-part-2-remove'));
    expect(screen.queryByTestId('add-split-editor-part-2')).toBeNull();
    expect(screen.queryByTestId('add-split-editor-part-1-remove')).toBeNull();
    fireEvent.press(screen.getByTestId('add-split'));
    expect(screen.getByTestId('add-category-groceries')).toBeOnTheScreen();
  });

  it('says so when the purchase was already in the list from the statement', async () => {
    start(() => ok(addResult('merged')));
    fireEvent.changeText(await screen.findByTestId('add-amount'), '84');
    fireEvent.press(await screen.findByTestId('add-category-groceries'));
    fireEvent.press(screen.getByTestId('add-save'));
    expect(await screen.findByTestId('add-merged')).toHaveTextContent(
      /Already in your list.*already came in from your statement.*Your category and note were added unless you had already sorted it yourself\./,
    );
    expect(screen.queryByTestId('home-screen')).toBeNull();
    fireEvent.press(screen.getByTestId('add-done'));
    expect(await screen.findByTestId('home-screen')).toBeOnTheScreen();
  });

  it('says so when nothing was added because it is already there', async () => {
    start(() => ok(addResult('already_imported')));
    fireEvent.changeText(await screen.findByTestId('add-amount'), '84');
    fireEvent.press(await screen.findByTestId('add-category-groceries'));
    fireEvent.press(screen.getByTestId('add-save'));
    expect(await screen.findByTestId('add-merged')).toHaveTextContent(/nothing was added twice/);
  });

  it('shows a refusal inline, keeps the entry and saves on the next try', async () => {
    let fail = true;
    const fake = start(() => (fail ? refused('category_not_found') : ok(addResult('added'))));
    fireEvent.changeText(await screen.findByTestId('add-amount'), '12.50');
    fireEvent.press(await screen.findByTestId('add-category-groceries'));
    fireEvent.press(screen.getByTestId('add-save'));
    expect(await screen.findByTestId('add-error')).toHaveTextContent(
      'That category no longer exists. Choose another one.',
    );
    expect(screen.getByTestId('add-amount')).toHaveProp('value', '12.50');
    expect(screen.getByTestId('add-category-groceries')).toBeChecked();

    fail = false;
    fireEvent.press(screen.getByTestId('add-save'));
    expect(await screen.findByTestId('home-screen')).toBeOnTheScreen();
    expect(rpcCalls(fake, 'add_transactions')).toHaveLength(2);
  });

  it('explains an unknown failure without losing anything', async () => {
    start(() => ({ data: null, error: { message: 'connection reset' } }));
    fireEvent.changeText(await screen.findByTestId('add-amount'), '5');
    fireEvent.press(await screen.findByTestId('add-category-groceries'));
    fireEvent.press(screen.getByTestId('add-save'));
    expect(await screen.findByTestId('add-error')).toHaveTextContent(
      'That did not work. Nothing is lost: try again.',
    );
  });

  it('closes without saving from Cancel', async () => {
    const fake = start();
    fireEvent.changeText(await screen.findByTestId('add-amount'), '5');
    fireEvent.press(screen.getByTestId('add-header-back'));
    expect(await screen.findByTestId('home-screen')).toBeOnTheScreen();
    expect(rpcCalls(fake, 'add_transactions')).toHaveLength(0);
  });

  it('speaks Swiss German', async () => {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, 'de');
    startApp({ url: '/add', profile: { language: 'de' } });
    expect(await screen.findByText('Einkauf erfassen')).toBeOnTheScreen();
    expect(await screen.findByTestId('add-category-groceries')).toHaveTextContent('Lebensmittel');
    expect(screen.getByText('Geld erhalten (Rückerstattung)')).toBeOnTheScreen();
  });
});
