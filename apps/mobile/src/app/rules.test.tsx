import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';

import { i18n, LANGUAGE_STORAGE_KEY } from '@/i18n';
import { readEnv } from '@/lib/env';
import { startImportsApp } from '@/test/importsFixture';
import type { FakeRow } from '@/test/fakeSupabase';

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));
jest.mock('@/lib/env', () => ({ ...jest.requireActual('@/lib/env'), readEnv: jest.fn() }));
jest.mock('@/lib/supabase', () => ({
  getSupabase: jest.fn(),
  getSupabaseIfConfigured: jest.fn(),
  authRedirectUrl: jest.fn(() => 'batzen://auth/callback'),
}));

const RULES: FakeRow[] = [
  {
    id: 'r-manor',
    match_field: 'merchant',
    match_type: 'contains',
    pattern: 'manor',
    category_id: 'c-clothes',
    priority: 3,
    created_at: '2026-10-03T09:00:00Z',
  },
  {
    id: 'r-rent',
    match_field: 'raw_text',
    match_type: 'equals',
    pattern: 'Dauerauftrag Exempla',
    category_id: 'c-old',
    priority: 2,
    created_at: '2026-10-02T09:00:00Z',
  },
  {
    id: 'r-mcc',
    match_field: 'mcc',
    match_type: 'equals',
    pattern: '5411',
    category_id: 'c-gone',
    priority: 1,
    created_at: '2026-10-01T09:00:00Z',
  },
];

function start(rules: FakeRow[] = RULES) {
  return startImportsApp({
    url: '/rules',
    tables: { categorization_rules: rules.map((rule) => ({ ...rule })) },
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

describe('categorization rules', () => {
  it('lists the rules in plain words', async () => {
    start();
    expect(await screen.findByTestId('rules-rule-r-manor')).toHaveTextContent(
      'Merchant contains “manor” → Clothes',
    );
    // Archived categories keep their name; a category that is gone is named as such.
    expect(screen.getByTestId('rules-rule-r-rent')).toHaveTextContent(
      'Statement text is “Dauerauftrag Exempla” → Old hobby',
    );
    expect(screen.getByTestId('rules-rule-r-mcc')).toHaveTextContent(
      'Card category code is “5411” → A deleted category',
    );
    expect(screen.getByTestId('rules-delete-r-manor')).toHaveAccessibleName(
      'Delete rule: Merchant contains “manor” → Clothes',
    );
  });

  it('deletes a rule after confirmation', async () => {
    const fake = start();
    fireEvent.press(await screen.findByTestId('rules-delete-r-manor'));
    const sheet = await screen.findByTestId('rules-delete-sheet-panel');
    expect(sheet).toHaveTextContent(/Transactions it already sorted keep their category\./);
    fireEvent.press(within(sheet).getByTestId('rules-delete-confirm'));
    await waitFor(() => expect(screen.queryByTestId('rules-rule-r-manor')).toBeNull());
    expect(fake.state.tables.categorization_rules?.map((rule) => rule.id)).toEqual([
      'r-rent',
      'r-mcc',
    ]);
  });

  it('keeps the rule when deleting fails, or when the person changes their mind', async () => {
    const fake = start();
    fireEvent.press(await screen.findByTestId('rules-delete-r-rent'));
    fake.state.tableErrors.categorization_rules = { message: 'boom' };
    fireEvent.press(await screen.findByTestId('rules-delete-confirm'));
    expect(await screen.findByTestId('rules-delete-error')).toHaveTextContent(
      'The rule could not be deleted. Check your connection and try again.',
    );
    fireEvent.press(screen.getByTestId('rules-delete-cancel'));
    await waitFor(() => expect(screen.queryByTestId('rules-delete-sheet-panel')).toBeNull());
    expect(screen.getByTestId('rules-rule-r-rent')).toBeOnTheScreen();
  });

  it('explains how rules are made when there are none', async () => {
    start([]);
    expect(await screen.findByTestId('rules-empty')).toHaveTextContent(
      /No rules yet.*Always do this for …\?/,
    );
  });

  it('offers to try again when the rules cannot be loaded', async () => {
    const fake = start();
    fake.state.tableErrors.categorization_rules = { message: 'boom' };
    expect(await screen.findByTestId('rules-error')).toHaveTextContent(
      /Your rules could not be loaded\./,
    );
    delete fake.state.tableErrors.categorization_rules;
    fireEvent.press(screen.getByTestId('rules-error-action'));
    expect(await screen.findByTestId('rules-rule-r-manor')).toBeOnTheScreen();
  });

  it('shows the rules in German', async () => {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, 'de');
    start();
    expect(await screen.findByTestId('rules-rule-r-manor')).toHaveTextContent(
      'Händler enthält «manor» → Kleider',
    );
  });
});
