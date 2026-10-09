import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { LANGUAGE_STORAGE_KEY, i18n } from '@/i18n';
import { readEnv } from '@/lib/env';
import {
  MANOR_RULE,
  ok,
  page,
  refused,
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
type UpdateArgs = { p_id: string; p: Record<string, unknown> };

const MANOR = transactionJson({
  id: 't-manor',
  amount_rappen: -8400,
  booked_at: '2026-10-04T09:00:00+00:00',
  merchant: 'Manor',
  source: 'statement_import',
  categorized_by: 'merchant_list',
  category_id: 'c-groceries',
  category_confidence: 50,
  needs_review: true,
  suggested_rule: MANOR_RULE,
});
const MANOR_AGAIN = transactionJson({
  id: 't-manor-2',
  amount_rappen: -3000,
  booked_at: '2026-10-03T09:00:00+00:00',
  merchant: 'MANOR AG 0815',
  source: 'statement_import',
  needs_review: true,
  suggested_rule: MANOR_RULE,
});
/** Money back from Manor, guessed as a refund of an earlier grocery purchase (D-039). */
const REFUND = transactionJson({
  id: 't-refund',
  amount_rappen: 5000,
  booked_at: '2026-10-05T09:00:00+00:00',
  merchant: 'Manor',
  source: 'statement_import',
  categorized_by: 'refund',
  category_id: 'c-groceries',
  category_confidence: 60,
  needs_review: true,
});
const UNKNOWN = transactionJson({
  id: 't-unknown',
  amount_rappen: -1200,
  booked_at: '2026-10-03T08:00:00+00:00',
  merchant: null,
  raw_text: null,
  source: 'statement_import',
  needs_review: true,
});

/**
 * list_transactions (needs_review) and update_transaction over a store. A rule places every other
 * transaction whose merchant contains (or equals) the pattern, as the database does.
 */
function start(items: TransactionJson[], updateAnswer?: () => ReturnType<typeof refused>) {
  const store = new Map(items.map((item) => [item.id, { ...item }]));
  return startApp({
    url: '/review',
    rpc: {
      list_transactions: (args) => {
        const p = (args as ListArgs).p;
        const rows = [...store.values()].filter((row) => !p.needs_review || row.needs_review);
        return ok(page(rows));
      },
      update_transaction: (args) => {
        if (updateAnswer) return updateAnswer();
        const { p_id, p } = args as UpdateArgs;
        const current = store.get(p_id);
        if (!current) return refused('transaction_not_found');
        const next = { ...current, category_id: p.category_id, needs_review: false };
        store.set(p_id, next);
        let recategorized = 0;
        const rule = p.rule as { match_type: string; pattern: string } | undefined;
        if (rule) {
          for (const row of store.values()) {
            const merchant = typeof row.merchant === 'string' ? row.merchant.toLowerCase() : '';
            const matches =
              rule.match_type === 'equals'
                ? merchant === rule.pattern
                : merchant.includes(rule.pattern);
            if (row.id !== p_id && row.needs_review && matches) {
              store.set(row.id, { ...row, category_id: p.category_id, needs_review: false });
              recategorized += 1;
            }
          }
        }
        return ok({
          transaction: next,
          rule_id: rule ? 'r-1' : null,
          recategorized_count: recategorized,
        });
      },
    },
  });
}

function updates(fake: ReturnType<typeof start>) {
  return (rpcCalls(fake, 'update_transaction') as UpdateArgs[]).map(({ p_id, p }) => ({
    p_id,
    ...p,
  }));
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

describe('review', () => {
  it('asks about this month’s unclear purchases one at a time, with a rule offer', async () => {
    const fake = start([MANOR, MANOR_AGAIN, UNKNOWN]);
    expect(await screen.findByTestId('review-question')).toHaveTextContent(
      'CHF 84.00 at Manor: what was it?',
    );
    expect(rpcCalls(fake, 'list_transactions')[0]).toEqual({
      p: { limit: 50, needs_review: true, from: '2026-09-25', to: '2026-10-24' },
    });
    expect(screen.getByTestId('review-progress')).toHaveAccessibilityValue({
      min: 1,
      max: 3,
      now: 1,
      text: '1 of 3',
    });

    fireEvent.press(await screen.findByTestId('review-category-eating_out'));
    expect(await screen.findByText('Always do this for “manor”?')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('review-rule-yes'));

    // The rule also placed the second Manor purchase, so the next question is the third one.
    expect(await screen.findByTestId('review-rule-result')).toHaveTextContent(
      'Also re-sorted 1 earlier purchase.',
    );
    expect(screen.getByTestId('review-question')).toHaveTextContent(
      'CHF 12.00 on Saturday, 3 October: what was it?',
    );
    expect(screen.getByTestId('review-progress')).toHaveAccessibilityValue({
      min: 1,
      max: 3,
      now: 3,
      text: '3 of 3',
    });
    expect(updates(fake)).toEqual([
      {
        p_id: 't-manor',
        category_id: 'c-eating-out',
        rule: { match_field: 'merchant', match_type: 'contains', pattern: 'manor' },
      },
    ]);

    // Nothing to build a rule from: the answer is saved at once.
    fireEvent.press(screen.getByTestId('review-category-Dog'));
    expect(await screen.findByTestId('review-done')).toHaveTextContent(/All sorted/);
    expect(updates(fake)[1]).toEqual({ p_id: 't-unknown', category_id: 'c-dog' });
  });

  it('places only this one on "Only this time", and skips with "Not now"', async () => {
    const fake = start([MANOR, MANOR_AGAIN]);
    fireEvent.press(await screen.findByTestId('review-category-groceries'));
    fireEvent.press(await screen.findByTestId('review-rule-no'));
    expect(await screen.findByTestId('review-question')).toHaveTextContent(
      'CHF 30.00 at MANOR AG 0815: what was it?',
    );
    expect(updates(fake)).toEqual([{ p_id: 't-manor', category_id: 'c-groceries' }]);

    fireEvent.press(screen.getByTestId('review-skip'));
    expect(await screen.findByTestId('review-done')).toHaveTextContent(
      /You skipped 1 purchase\. It stays on the list for later\./,
    );
    fireEvent.press(screen.getByTestId('review-done-action'));
    expect(await screen.findByTestId('home-screen')).toBeOnTheScreen();
  });

  it('says when there is nothing to sort', async () => {
    start([]);
    expect(await screen.findByTestId('review-done')).toHaveTextContent(/Nothing to sort/);
  });

  it('shows a failed answer and stays on the question', async () => {
    start([UNKNOWN], () => refused('category_not_found'));
    fireEvent.press(await screen.findByTestId('review-category-Dog'));
    expect(await screen.findByTestId('review-save-error')).toHaveTextContent(
      'That category no longer exists. Choose another one.',
    );
    expect(screen.getByTestId('review-question')).toHaveTextContent(/CHF 12\.00/);
  });

  it('offers exactly the rule the database proposed, and none without a proposal', async () => {
    const fake = start([
      { ...MANOR, suggested_rule: { ...MANOR_RULE, match_type: 'equals' } },
      { ...MANOR_AGAIN, suggested_rule: null },
    ]);
    fireEvent.press(await screen.findByTestId('review-category-Dog'));
    expect(await screen.findByText('Always do this for “manor”?')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('review-rule-yes'));
    expect(await screen.findByTestId('review-question')).toHaveTextContent(
      'CHF 30.00 at MANOR AG 0815: what was it?',
    );
    // No proposal: the answer is saved at once, without asking about a rule.
    fireEvent.press(screen.getByTestId('review-category-groceries'));
    expect(await screen.findByTestId('review-done')).toBeOnTheScreen();
    expect(screen.queryByTestId('review-rule')).toBeNull();
    expect(updates(fake)).toEqual([
      {
        p_id: 't-manor',
        category_id: 'c-dog',
        rule: { match_field: 'merchant', match_type: 'equals', pattern: 'manor' },
      },
      { p_id: 't-manor-2', category_id: 'c-groceries' },
    ]);
  });

  it('asks about money that looks like a refund as money back', async () => {
    const fake = start([REFUND, { ...REFUND, id: 't-refund-2', merchant: null }]);
    expect(await screen.findByTestId('review-question')).toHaveTextContent(
      'CHF 50.00 back from Manor: which category?',
    );
    await waitFor(() =>
      expect(screen.getByTestId('review-refund')).toHaveTextContent(
        'Looks like money back for an earlier purchase (Groceries).',
      ),
    );
    fireEvent.press(screen.getByTestId('review-category-groceries'));
    expect(await screen.findByTestId('review-question')).toHaveTextContent(
      'CHF 50.00 back on Monday, 5 October: which category?',
    );
    expect(updates(fake)).toEqual([{ p_id: 't-refund', category_id: 'c-groceries' }]);
  });

  it('asks about a refund in German', async () => {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, 'de');
    start([REFUND]);
    expect(await screen.findByTestId('review-question')).toHaveTextContent(
      'CHF 50.00 zurück von Manor: Welche Kategorie?',
    );
    await waitFor(() =>
      expect(screen.getByTestId('review-refund')).toHaveTextContent(
        'Sieht aus wie Geld zurück für einen früheren Einkauf (Lebensmittel).',
      ),
    );
  });

  it('is reached from the banner on Home', async () => {
    const app = start([UNKNOWN]);
    fireEvent.press(await screen.findByTestId('review-header-back'));
    const banner = await screen.findByTestId('home-review');
    expect(banner).toHaveAccessibleName('1 purchase needs a category');
    fireEvent.press(banner);
    expect(await screen.findByTestId('review-question')).toBeOnTheScreen();
    await waitFor(() => expect(app.getPathname()).toBe('/review'));
  });
});
