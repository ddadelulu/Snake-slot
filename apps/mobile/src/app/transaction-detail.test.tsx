import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { i18n } from '@/i18n';
import { readEnv } from '@/lib/env';
import type { RpcHandler } from '@/test/fakeSupabase';
import {
  ok,
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

type UpdateArgs = { p_id: string; p: Record<string, unknown> };
type SplitArgs = { p_id: string; p_parts: Record<string, unknown>[] };

const STATEMENT = transactionJson({
  id: 't-manor',
  amount_rappen: -8400,
  booked_at: '2026-10-02T12:05:00+00:00',
  merchant: 'Manor',
  raw_text:
    'Einkauf Debitkarte MANOR AG 0815 Zürich Bahnhofstrasse 75, Kartennummer XXXX 1234, Transaktion 778899',
  source: 'statement_import',
  data_source_id: 'ds-1',
  data_source_name: 'konto-september.csv',
  merged_sources: ['manual'],
  original_amount_minor: 4500,
  original_currency: 'EUR',
  categorized_by: 'merchant_list',
  category_id: 'c-groceries',
  category_confidence: 50,
  needs_review: true,
});

const CASH = transactionJson({
  id: 't-cash',
  amount_rappen: -1250,
  booked_at: '2026-10-05T14:30:00+00:00',
  merchant: null,
  source: 'manual',
  category_id: 'c-eating-out',
  categorized_by: 'user',
  category_confidence: 100,
});

/**
 * get_transaction, update_transaction and set_transaction_splits over an in-memory store, as the
 * database applies them (simplified). `updateAnswer` can replace the answer of update_transaction.
 */
function start(
  transaction: TransactionJson,
  options: {
    updateAnswer?: (args: UpdateArgs) => ReturnType<RpcHandler> | null;
    recategorized?: number;
  } = {},
) {
  const store = new Map<string, TransactionJson>([[transaction.id, { ...transaction }]]);
  const fake = startApp({
    url: `/transaction/${transaction.id}`,
    rpc: {
      get_transaction: (args) => ok(store.get((args as { p_id: string }).p_id) ?? null),
      list_transactions: () => ok({ items: [...store.values()], next_cursor: null }),
      update_transaction: (args) => {
        const { p_id, p } = args as UpdateArgs;
        const answer = options.updateAnswer?.(args as UpdateArgs);
        if (answer) return answer;
        const current = store.get(p_id);
        if (!current) return refused('transaction_not_found');
        const next: TransactionJson = { ...current };
        if ('category_id' in p) {
          next.category_id = p.category_id;
          next.categorized_by = 'user';
          next.category_confidence = 100;
          next.fixed_cost_id = null;
          next.needs_review = false;
        }
        if ('fixed_cost_id' in p) next.fixed_cost_id = p.fixed_cost_id;
        if ('note' in p) next.note = p.note === '' ? null : p.note;
        if ('merchant' in p) next.merchant = p.merchant === '' ? null : p.merchant;
        if ('amount_rappen' in p) next.amount_rappen = p.amount_rappen;
        if ('booked_at' in p) next.booked_at = p.booked_at;
        if ('deleted' in p) next.deleted_at = p.deleted ? '2026-10-07T10:00:00+00:00' : null;
        store.set(p_id, next);
        return ok({
          transaction: next,
          rule_id: p.rule ? 'r-1' : null,
          recategorized_count: p.rule ? (options.recategorized ?? 0) : 0,
        });
      },
      set_transaction_splits: (args) => {
        const { p_id, p_parts } = args as SplitArgs;
        const current = store.get(p_id);
        if (!current) return refused('transaction_not_found');
        const next: TransactionJson = {
          ...current,
          category_id: null,
          needs_review: false,
          splits: p_parts.map((part, index) => ({ id: `s-${index}`, ...part })),
        };
        store.set(p_id, next);
        return ok(next);
      },
    },
  });
  return { fake, store };
}

function updates(fake: ReturnType<typeof start>['fake']) {
  return (rpcCalls(fake, 'update_transaction') as UpdateArgs[]).map((call) => call.p);
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

describe('transaction detail', () => {
  it('shows what is known: amount, merchant, date and time, sources, foreign amount, text', async () => {
    start(STATEMENT);
    expect(await screen.findByTestId('detail-amount')).toHaveTextContent('CHF 84.00');
    expect(screen.getByTestId('detail-merchant-title')).toHaveTextContent('Manor');
    expect(screen.getByTestId('detail-when')).toHaveTextContent('Friday, 2 October 2026, 14:05');
    expect(screen.getByTestId('detail-source')).toHaveTextContent(
      'From statement konto-september.csv',
    );
    expect(screen.getByTestId('detail-also-seen')).toHaveTextContent('Also seen in: By hand');
    expect(screen.getByTestId('detail-foreign')).toHaveTextContent('Original amount: EUR 45.00');
    expect(screen.getByTestId('detail-needs-review')).toBeOnTheScreen();
    await waitFor(() =>
      expect(screen.getByTestId('detail-category')).toHaveTextContent(/Groceries/),
    );

    const text = screen.getByTestId('detail-raw-text');
    expect(text).toHaveProp('numberOfLines', 2);
    fireEvent.press(screen.getByTestId('detail-raw-text-toggle'));
    expect(screen.getByTestId('detail-raw-text').props.numberOfLines).toBeUndefined();
    expect(screen.getByText('Show less')).toBeOnTheScreen();

    // Amount and day belong to the statement; only hand-typed entries can change them.
    expect(screen.queryByTestId('detail-edit-amount')).toBeNull();
  });

  it('shows money in with a plus', async () => {
    start(transactionJson({ id: 't-in', amount_rappen: 2000, note: 'Refund' }));
    expect(await screen.findByTestId('detail-amount')).toHaveTextContent('CHF +20.00');
    expect(screen.getByTestId('detail-merchant-title')).toHaveTextContent('Money in');
    expect(screen.getByTestId('detail-source')).toHaveTextContent('Added by hand');
    expect(screen.queryByTestId('detail-fixed-cost')).toBeNull();
  });

  it('changes the category and, on yes, makes it a rule that re-sorts earlier purchases', async () => {
    const { fake } = start(STATEMENT, { recategorized: 3 });
    fireEvent.press(await screen.findByTestId('detail-category'));
    expect(await screen.findByText('Choose a category')).toBeOnTheScreen();
    expect(screen.queryByTestId('detail-category-option-Old hobby')).toBeNull();
    fireEvent.press(screen.getByTestId('detail-category-option-eating_out'));

    expect(await screen.findByText('Always do this for “manor”?')).toBeOnTheScreen();
    expect(updates(fake)).toHaveLength(0);
    fireEvent.press(screen.getByTestId('detail-rule-yes'));

    expect(await screen.findByTestId('detail-rule-result')).toHaveTextContent(
      'Also re-sorted 3 earlier purchases.',
    );
    expect(updates(fake)).toEqual([
      {
        category_id: 'c-eating-out',
        rule: { match_field: 'merchant', match_type: 'contains', pattern: 'manor' },
      },
    ]);
    await waitFor(() =>
      expect(screen.getByTestId('detail-category')).toHaveTextContent(/Eating out/),
    );
    expect(screen.queryByTestId('detail-needs-review')).toBeNull();
  });

  it('says what the rule does when nothing earlier was re-sorted', async () => {
    start(STATEMENT, { recategorized: 0 });
    fireEvent.press(await screen.findByTestId('detail-category'));
    fireEvent.press(await screen.findByTestId('detail-category-option-Dog'));
    fireEvent.press(await screen.findByTestId('detail-rule-yes'));
    expect(await screen.findByTestId('detail-rule-result')).toHaveTextContent(
      'From now on, “manor” goes to Dog.',
    );
  });

  it('changes only this one on "Only this time"', async () => {
    const { fake } = start(STATEMENT);
    fireEvent.press(await screen.findByTestId('detail-category'));
    fireEvent.press(await screen.findByTestId('detail-category-option-groceries'));
    fireEvent.press(await screen.findByTestId('detail-rule-no'));
    await waitFor(() => expect(updates(fake)).toEqual([{ category_id: 'c-groceries' }]));
    await waitFor(() => expect(screen.queryByTestId('detail-rule')).toBeNull());
    expect(screen.queryByTestId('detail-rule-result')).toBeNull();
  });

  it('saves a category at once when there is nothing to build a rule from, or "No category"', async () => {
    const { fake } = start(CASH);
    fireEvent.press(await screen.findByTestId('detail-category'));
    fireEvent.press(await screen.findByTestId('detail-category-option-groceries'));
    await waitFor(() => expect(updates(fake)).toEqual([{ category_id: 'c-groceries' }]));
    expect(screen.queryByTestId('detail-rule')).toBeNull();

    await waitFor(() =>
      expect(screen.getByTestId('detail-category')).toHaveTextContent(/Groceries/),
    );
    fireEvent.press(screen.getByTestId('detail-category'));
    fireEvent.press(await screen.findByTestId('detail-category-option-none'));
    await waitFor(() => expect(updates(fake)[1]).toEqual({ category_id: null }));
    await waitFor(() =>
      expect(screen.getByTestId('detail-category')).toHaveTextContent(/Not categorized/),
    );
  });

  it('splits across categories, checks the sum, and removes the split again', async () => {
    const { fake } = start(STATEMENT);
    fireEvent.press(await screen.findByTestId('detail-split'));
    expect(screen.getByTestId('detail-split-editor-remaining')).toHaveTextContent(
      'CHF 84.00 left to assign',
    );
    fireEvent.changeText(screen.getByTestId('detail-split-editor-part-0-amount'), '64');
    fireEvent.press(screen.getByTestId('detail-split-editor-part-1-category-Dog'));
    fireEvent.changeText(screen.getByTestId('detail-split-editor-part-1-amount'), '30');
    fireEvent.press(screen.getByTestId('detail-split-save'));
    expect(await screen.findByTestId('detail-split-editor-error')).toHaveTextContent(
      'The parts must add up to exactly CHF 84.00.',
    );
    expect(rpcCalls(fake, 'set_transaction_splits')).toHaveLength(0);

    fireEvent.changeText(screen.getByTestId('detail-split-editor-part-1-amount'), '20');
    fireEvent.press(screen.getByTestId('detail-split-save'));
    await waitFor(() =>
      expect(rpcCalls(fake, 'set_transaction_splits')).toEqual([
        {
          p_id: 't-manor',
          p_parts: [
            { category_id: 'c-groceries', amount_rappen: -6400, note: null },
            { category_id: 'c-dog', amount_rappen: -2000, note: null },
          ],
        },
      ]),
    );
    expect(await screen.findByText('Split into 2 parts')).toBeOnTheScreen();
    expect(screen.getByTestId('detail-split-part-1')).toHaveTextContent(/Dog.*CHF 20\.00/);

    fireEvent.press(screen.getByTestId('detail-split'));
    expect(screen.getByTestId('detail-split-editor-part-0-amount')).toHaveProp('value', '64.00');
    fireEvent.press(screen.getByTestId('detail-split-remove'));
    await waitFor(() =>
      expect(rpcCalls(fake, 'set_transaction_splits')[1]).toEqual({ p_id: 't-manor', p_parts: [] }),
    );
    await waitFor(() => expect(screen.queryByText('Split into 2 parts')).toBeNull());
  });

  it('saves a note and a new merchant name', async () => {
    const { fake } = start(STATEMENT);
    fireEvent.changeText(await screen.findByTestId('detail-note'), 'Gift for Lea');
    fireEvent.press(screen.getByTestId('detail-note-save'));
    await waitFor(() => expect(updates(fake)).toEqual([{ note: 'Gift for Lea' }]));
    await waitFor(() => expect(screen.queryByTestId('detail-note-save')).toBeNull());

    fireEvent.changeText(screen.getByTestId('detail-merchant'), 'Manor Bahnhofstrasse');
    fireEvent.press(screen.getByTestId('detail-merchant-save'));
    await waitFor(() => expect(updates(fake)[1]).toEqual({ merchant: 'Manor Bahnhofstrasse' }));
    expect(await screen.findByText('Manor Bahnhofstrasse')).toBeOnTheScreen();
  });

  it('marks the payment of a fixed cost and says it is already in the plan', async () => {
    const { fake } = start(STATEMENT);
    fireEvent.press(await screen.findByTestId('detail-fixed-cost'));
    expect(await screen.findByText('Is this a fixed cost?')).toBeOnTheScreen();
    expect(screen.queryByTestId('detail-fixed-cost-option-f-gym')).toBeNull();
    fireEvent.press(screen.getByTestId('detail-fixed-cost-option-f-rent'));
    await waitFor(() => expect(updates(fake)).toEqual([{ fixed_cost_id: 'f-rent' }]));
    expect(await screen.findByTestId('detail-fixed-cost-plan')).toHaveTextContent(
      'Already in your plan as Rent, so it does not count against a budget.',
    );
    expect(screen.getByTestId('detail-category')).toHaveTextContent(/Rent \(fixed cost\)/);

    fireEvent.press(screen.getByTestId('detail-fixed-cost'));
    fireEvent.press(await screen.findByTestId('detail-fixed-cost-option-none'));
    await waitFor(() => expect(updates(fake)[1]).toEqual({ fixed_cost_id: null }));
  });

  it('changes amount and day of a purchase typed in by hand', async () => {
    const { fake } = start(CASH);
    const amount = await screen.findByTestId('detail-edit-amount');
    expect(amount).toHaveProp('value', '12.50');
    expect(screen.queryByTestId('detail-edit-save')).toBeNull();
    fireEvent.changeText(amount, '15');
    fireEvent.press(screen.getByTestId('detail-edit-day-decrement'));
    expect(screen.getByTestId('detail-edit-day-value')).toHaveTextContent('Sunday, 4 October');
    fireEvent.press(screen.getByTestId('detail-edit-save'));
    // 14:30 UTC is 16:30 in Zurich; a day earlier at the same local time.
    await waitFor(() =>
      expect(updates(fake)).toEqual([
        { amount_rappen: -1500, booked_at: '2026-10-04T14:30:00.000Z' },
      ]),
    );
    await waitFor(() => expect(screen.getByTestId('detail-amount')).toHaveTextContent('CHF 15.00'));
    expect(screen.queryByTestId('detail-edit-save')).toBeNull();
  });

  it('deletes after confirmation and brings it back with Undo', async () => {
    const { fake } = start(CASH);
    fireEvent.press(await screen.findByTestId('detail-delete'));
    expect(await screen.findByText('Delete this purchase?')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('detail-delete-confirm'));
    const undo = await screen.findByTestId('detail-undo');
    expect(undo).toHaveAccessibleName('Purchase deleted, Undo');
    expect(updates(fake)).toEqual([{ deleted: true }]);
    expect(screen.queryByTestId('detail-category')).toBeNull();

    fireEvent.press(undo);
    expect(await screen.findByTestId('detail-restored')).toHaveTextContent('Purchase restored');
    expect(updates(fake)[1]).toEqual({ deleted: false });
    expect(screen.getByTestId('detail-delete')).toBeOnTheScreen();
  });

  it('keeps it when the person changes their mind, and leaves after deleting', async () => {
    const { fake } = start(CASH);
    fireEvent.press(await screen.findByTestId('detail-delete'));
    fireEvent.press(await screen.findByTestId('detail-delete-cancel'));
    await waitFor(() => expect(screen.queryByText('Delete this purchase?')).toBeNull());
    expect(updates(fake)).toHaveLength(0);

    fireEvent.press(screen.getByTestId('detail-delete'));
    fireEvent.press(await screen.findByTestId('detail-delete-confirm'));
    fireEvent.press(await screen.findByTestId('detail-leave'));
    expect(await screen.findByTestId('transactions-screen')).toBeOnTheScreen();
  });

  it('offers to restore a purchase that was deleted earlier', async () => {
    const { fake } = start({ ...CASH, deleted_at: '2026-10-06T10:00:00+00:00' });
    expect(await screen.findByTestId('detail-deleted')).toHaveTextContent(
      /This purchase is deleted/,
    );
    fireEvent.press(screen.getByTestId('detail-deleted-action'));
    await waitFor(() => expect(updates(fake)).toEqual([{ deleted: false }]));
    expect(await screen.findByTestId('detail-delete')).toBeOnTheScreen();
  });

  it.each([
    ['category_not_found', 'That category no longer exists. Choose another one.'],
    [
      'transaction_is_split',
      'This purchase is split. Change its parts, or remove the split first.',
    ],
    ['transaction_not_found', 'This transaction no longer exists.'],
    ['rule_needs_category', 'Choose a category to make it a rule.'],
  ])('explains the refusal %s', async (reason, message) => {
    start(CASH, { updateAnswer: () => refused(reason) });
    fireEvent.press(await screen.findByTestId('detail-category'));
    fireEvent.press(await screen.findByTestId('detail-category-option-Dog'));
    expect(await screen.findByTestId('detail-error')).toHaveTextContent(message);
  });

  it.each([
    ['not_editable', 'Amount and day can only be changed on purchases you added by hand.'],
    ['fixed_cost_not_found', 'That fixed cost no longer exists.'],
  ])('explains the refusal %s of an edit', async (reason, message) => {
    start(CASH, { updateAnswer: () => refused(reason) });
    fireEvent.changeText(await screen.findByTestId('detail-edit-amount'), '20');
    fireEvent.press(screen.getByTestId('detail-edit-save'));
    expect(await screen.findByTestId('detail-error')).toHaveTextContent(message);
    expect(screen.getByTestId('detail-edit-amount')).toHaveProp('value', '20');
  });

  it('explains a refused split', async () => {
    const { fake } = start(STATEMENT);
    fake.state.rpc.set_transaction_splits = () => refused('invalid_splits');
    fireEvent.press(await screen.findByTestId('detail-split'));
    fireEvent.changeText(screen.getByTestId('detail-split-editor-part-0-amount'), '84');
    fireEvent.press(screen.getByTestId('detail-split-editor-part-1-category-Dog'));
    fireEvent.press(screen.getByTestId('detail-split-editor-add'));
    fireEvent.press(screen.getByTestId('detail-split-editor-part-2-remove'));
    fireEvent.changeText(screen.getByTestId('detail-split-editor-part-0-amount'), '80');
    fireEvent.changeText(screen.getByTestId('detail-split-editor-part-1-amount'), '4');
    fireEvent.press(screen.getByTestId('detail-split-save'));
    expect(await screen.findByTestId('detail-error')).toHaveTextContent(
      'The parts must add up exactly to the amount, each with a category.',
    );
    expect(screen.getByTestId('detail-split-editor')).toBeOnTheScreen();
  });

  it('says when the transaction does not exist', async () => {
    startApp({ url: '/transaction/t-gone', rpc: { get_transaction: () => ok(null) } });
    expect(await screen.findByTestId('detail-not-found')).toHaveTextContent(
      /Transaction not found/,
    );
  });

  it('offers a retry when it cannot be loaded', async () => {
    let calls = 0;
    startApp({
      url: '/transaction/t-cash',
      rpc: {
        get_transaction: () => {
          calls += 1;
          return calls === 1 ? { data: null, error: { message: 'bad request' } } : ok(CASH);
        },
      },
    });
    fireEvent.press(await screen.findByTestId('detail-load-error-action'));
    expect(await screen.findByTestId('detail-amount')).toHaveTextContent('CHF 12.50');
  });
});
