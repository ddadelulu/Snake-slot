import AsyncStorage from '@react-native-async-storage/async-storage';
import { MAX_IMPORT_FILE_BYTES, type IngestRow } from '@budget/core';
import { POSTFINANCE_OLD, REVOLUT, UBS_DE } from '@budget/core/src/import/__fixtures__/statements';
import * as DocumentPicker from 'expo-document-picker';
import { act, fireEvent, screen, waitFor, within } from 'expo-router/testing-library';

import { i18n } from '@/i18n';
import { readEnv } from '@/lib/env';
import {
  failed,
  ok,
  refused,
  rpcCalls,
  startImportsApp,
  transactionJson,
  utf8,
} from '@/test/importsFixture';
import type { RpcHandler } from '@/test/fakeSupabase';

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));
jest.mock('@/lib/env', () => ({ ...jest.requireActual('@/lib/env'), readEnv: jest.fn() }));
jest.mock('@/lib/supabase', () => ({
  getSupabase: jest.fn(),
  getSupabaseIfConfigured: jest.fn(),
  authRedirectUrl: jest.fn(() => 'batzen://auth/callback'),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => {
  const files = new Map<string, Uint8Array>();
  class MockFile {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    async bytes() {
      const bytes = files.get(this.uri);
      if (!bytes) throw new Error('no such file');
      return bytes;
    }
    delete() {
      files.delete(this.uri);
    }
  }
  return { File: MockFile, Paths: { cache: { uri: 'file:///cache/' } }, __files: files };
});

// All statement files here are synthetic (see packages/core/src/import/__fixtures__).

type AddArgs = { p: { rows: IngestRow[]; dry_run: boolean; import?: Record<string, unknown> } };

/** What the pipeline answers for each line of the file (by position in the parsed statement). */
type Plan = {
  outcome: 'added' | 'merged' | 'already_imported' | 'possible_duplicate';
  transactionId?: string;
  categoryId?: string;
  fixedCostId?: string;
  needsReview?: boolean;
  duplicateOf?: Record<string, unknown>;
};

/**
 * A stand-in for add_transactions: the dry run (every line of the file, in order) answers line
 * i with plans[i]; the import answers each row by its external id with the plan of its line,
 * stores nothing on a dry run, and adds a checked look-alike (allow_duplicate).
 */
function pipeline(plans: Plan[]): RpcHandler {
  let ids: (string | null)[] = [];
  return (args) => {
    const { p } = args as AddArgs;
    if (p.dry_run) ids = p.rows.map((row) => row.external_id);
    const counts = {
      added: 0,
      merged: 0,
      already_imported: 0,
      possible_duplicate: 0,
      needs_review: 0,
    };
    const results = p.rows.map((row, index) => {
      const plan = plans[ids.indexOf(row.external_id)] ?? { outcome: 'added' };
      const outcome =
        plan.outcome === 'possible_duplicate' && row.allow_duplicate ? 'added' : plan.outcome;
      counts[outcome] += 1;
      if (plan.needsReview) counts.needs_review += 1;
      return {
        index,
        outcome,
        transaction_id:
          plan.transactionId ?? (outcome === 'added' && !p.dry_run ? `t-new-${index}` : null),
        duplicate_of: outcome === 'possible_duplicate' ? (plan.duplicateOf ?? null) : null,
        category_id: plan.categoryId ?? null,
        categorized_by: plan.categoryId ? 'merchant_list' : 'none',
        category_confidence: plan.categoryId ? 90 : null,
        fixed_cost_id: plan.fixedCostId ?? null,
        needs_review: plan.needsReview ?? false,
      };
    });
    return ok({ data_source_id: p.dry_run ? null : 'ds-new', results, counts });
  };
}

/** The UBS file: a purchase typed in before, an unclear collective order, the salary imported
 * before and a café purchase that looks like one already imported. */
const UBS_PLANS: Plan[] = [
  { outcome: 'merged', transactionId: 't-manual', categoryId: 'c-groceries' },
  { outcome: 'added', needsReview: true },
  { outcome: 'already_imported', transactionId: 't-salary' },
  {
    outcome: 'possible_duplicate',
    duplicateOf: {
      id: 't-cafe',
      booked_at: '2026-09-24T07:05:00+00:00',
      merchant: 'Exempla Café Bern',
      amount_rappen: -850,
      source: 'statement_import',
    },
  },
];

const MANUAL_ENTRY = transactionJson({
  id: 't-manual',
  amount_rappen: -2340,
  booked_at: '2026-09-29T12:20:00+00:00',
  merchant: 'Mustermarkt',
  category_id: 'c-groceries',
  categorized_by: 'user',
  category_confidence: 100,
});

function pick(name: string, content: string | Uint8Array, size?: number) {
  const bytes = typeof content === 'string' ? utf8(content) : content;
  jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValueOnce({
    canceled: false,
    assets: [
      {
        name,
        uri: `blob:${name}`,
        size: size ?? bytes.length,
        lastModified: 0,
        file: { arrayBuffer: async () => bytes.slice().buffer } as never,
      },
    ],
  });
}

function start(rpc: Record<string, RpcHandler> = {}, url = '/import') {
  return startImportsApp({
    url,
    rpc: {
      add_transactions: pipeline(UBS_PLANS),
      get_transaction: () => ok(MANUAL_ENTRY),
      ...rpc,
    },
  });
}

/** Presses a button that opens the picker, then lets the picked file be read and parsed. */
async function choose(testID = 'import-choose') {
  const button = await screen.findByTestId(testID);
  await act(async () => {
    fireEvent.press(button);
    await jest.advanceTimersByTimeAsync(20);
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

describe('statement import', () => {
  it('explains the import with one privacy line and lets the person cancel the picker', async () => {
    start();
    expect(await screen.findByTestId('import-privacy')).toHaveTextContent(
      'The file is read on your phone; only the transactions you keep are saved.',
    );
    jest
      .mocked(DocumentPicker.getDocumentAsync)
      .mockResolvedValueOnce({ canceled: true, assets: null });
    await choose();
    await waitFor(() => expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledTimes(1));
    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        type: expect.arrayContaining(['text/csv', 'text/xml', 'text/plain', '*/*']),
        multiple: false,
      }),
    );
    expect(screen.getByTestId('import-choose')).toBeOnTheScreen();
  });

  it('previews every kind of line, imports the checked ones and shows the result', async () => {
    const fake = start();
    pick('ubs-september.csv', UBS_DE);
    await choose();

    expect(await screen.findByTestId('import-source')).toHaveTextContent('UBS');
    expect(screen.getByTestId('import-period')).toHaveTextContent(
      '24 September 2026 to 29 September 2026',
    );
    expect(screen.getByTestId('import-count')).toHaveTextContent('4 transactions');
    expect(screen.getByTestId('import-skipped')).toHaveTextContent(/^2 lines skipped/);
    expect(screen.getByTestId('import-skipped-reasons')).toHaveTextContent(
      'Part of a collective payment (the total is imported) (2)',
    );

    // The dry run covers every line and stores nothing.
    expect(await screen.findByTestId('import-row-0')).toBeOnTheScreen();
    const [dryRun] = rpcCalls(fake, 'add_transactions') as AddArgs[];
    expect(dryRun?.p).toMatchObject({
      dry_run: true,
      import: { file_name: 'ubs-september.csv', format: 'csv', bank: 'ubs' },
    });
    expect(dryRun?.p.rows).toHaveLength(4);
    expect(dryRun?.p.rows[0]).toMatchObject({
      amount_rappen: -2340,
      booked_on: '2026-09-29',
      booked_time: '14:23:05',
      source: 'statement_import',
      external_id: 'csv:CH9300000000000000000:TEST0000000001',
    });

    // 0: merges with the purchase typed in by hand (named), checked.
    expect(screen.getByTestId('import-row-0')).toBeChecked();
    await waitFor(() =>
      expect(screen.getByTestId('import-row-0-status')).toHaveTextContent(
        /^Merges with one you have: Mustermarkt, CHF 23\.40, 29 Sept?$/,
      ),
    );
    expect(screen.getByTestId('import-row-0-day')).toHaveTextContent(/29 Sept?.* · Groceries/);
    // 1: new, needs a category, checked.
    expect(screen.getByTestId('import-row-1')).toBeChecked();
    expect(screen.getByTestId('import-row-1-review')).toHaveTextContent('Needs a category');
    // 2: imported before, unchecked and disabled.
    expect(screen.getByTestId('import-row-2')).not.toBeChecked();
    expect(screen.getByTestId('import-row-2')).toBeDisabled();
    expect(screen.getByTestId('import-row-2-status')).toHaveTextContent('Imported before');
    // 3: looks like one already there, unchecked but can be checked.
    expect(screen.getByTestId('import-row-3')).not.toBeChecked();
    expect(screen.getByTestId('import-row-3-status')).toHaveTextContent(
      /Looks like one you have: Exempla Café Bern, CHF 8\.50, 24 Sept?/,
    );
    expect(screen.getByTestId('import-count-new')).toHaveTextContent('New: 1');
    expect(screen.getByTestId('import-count-merge')).toHaveTextContent(
      'Merge with ones you have: 1',
    );
    expect(screen.getByTestId('import-count-imported_before')).toHaveTextContent(
      'Imported before: 1',
    );
    expect(screen.getByTestId('import-count-look_alike')).toHaveTextContent(
      'Look like ones you have: 1',
    );
    expect(screen.getByTestId('import-hint')).toHaveTextContent(/credit-card bill/);
    expect(screen.getByTestId('import-confirm')).toHaveTextContent('Import 2 transactions');

    // Pressing a line imported before changes nothing; the look-alike is a separate purchase.
    fireEvent.press(screen.getByTestId('import-row-2'));
    fireEvent.press(screen.getByTestId('import-row-3'));
    expect(screen.getByTestId('import-row-3')).toBeChecked();
    expect(screen.getByTestId('import-selected')).toHaveTextContent('3 of 3 selected');
    fireEvent.press(screen.getByTestId('import-confirm'));

    expect(await screen.findByTestId('import-result')).toBeOnTheScreen();
    const [, stored] = rpcCalls(fake, 'add_transactions') as AddArgs[];
    expect(stored?.p.dry_run).toBe(false);
    expect(stored?.p.rows.map((row) => [row.amount_rappen, row.allow_duplicate])).toEqual([
      [-2340, undefined],
      [-15000, undefined],
      [-850, true],
    ]);
    expect(screen.getByTestId('import-result-added')).toHaveTextContent('Added2');
    expect(screen.getByTestId('import-result-merged')).toHaveTextContent(
      'Merged with ones you had1',
    );
    expect(screen.getByTestId('import-result-already')).toHaveTextContent('Already there0');
    expect(screen.getByTestId('import-result-review')).toHaveTextContent('Need a category1');

    fireEvent.press(screen.getByTestId('import-done'));
    expect(await screen.findByTestId('transactions-screen')).toBeOnTheScreen();
  });

  it('selects all and none, and imports nothing while nothing is checked', async () => {
    const fake = start();
    pick('ubs.csv', UBS_DE);
    await choose();
    await screen.findByTestId('import-row-3');
    fireEvent.press(screen.getByTestId('import-select-none'));
    expect(screen.getByTestId('import-row-0')).not.toBeChecked();
    expect(screen.getByTestId('import-confirm')).toBeDisabled();
    fireEvent.press(screen.getByTestId('import-select-all'));
    for (const index of [0, 1, 3]) expect(screen.getByTestId(`import-row-${index}`)).toBeChecked();
    expect(screen.getByTestId('import-row-2')).not.toBeChecked();
    fireEvent.press(screen.getByTestId('import-row-1'));
    expect(screen.getByTestId('import-confirm')).toHaveTextContent('Import 2 transactions');
    expect(rpcCalls(fake, 'add_transactions')).toHaveLength(1);
  });

  it('says so when everything in the file was imported before', async () => {
    const fake = start({
      add_transactions: pipeline(
        UBS_PLANS.map(() => ({ outcome: 'already_imported', transactionId: 't-old' })),
      ),
    });
    pick('ubs.csv', UBS_DE);
    await choose();
    expect(await screen.findByTestId('import-nothing-new')).toHaveTextContent(
      'Every transaction in this file was imported before. There is nothing to add.',
    );
    expect(screen.queryByTestId('import-confirm')).toBeNull();
    expect(screen.queryByTestId('import-select-all')).toBeNull();
    fireEvent.press(screen.getByTestId('import-nothing-done'));
    expect(await screen.findByTestId('data-sources-screen')).toBeOnTheScreen();
    expect(rpcCalls(fake, 'add_transactions')).toHaveLength(1);
  });

  it('names fixed costs and categories, and goes to the review after an import', async () => {
    start({
      add_transactions: pipeline([
        { outcome: 'added', categoryId: 'c-groceries' },
        { outcome: 'added' },
        { outcome: 'added', fixedCostId: 'f-health' },
        { outcome: 'added', needsReview: true },
      ]),
      list_transactions: () => ok({ items: [], next_cursor: null }),
    });
    pick('postfinance.csv', POSTFINANCE_OLD);
    await choose();
    expect(await screen.findByTestId('import-row-2-day')).toHaveTextContent(
      /^Mon, 28 Sept? · Health insurance \(fixed cost\)$/,
    );
    expect(screen.getByTestId('import-row-0-day')).toHaveTextContent(/ · Groceries$/);
    expect(screen.getByTestId('import-row-1-day')).toHaveTextContent(/^Tue, 29 Sept?$/);
    expect(screen.getByTestId('import-row-1-value')).toHaveTextContent('CHF +5,200.00');
    expect(screen.getByTestId('import-source')).toHaveTextContent('PostFinance');
    fireEvent.press(screen.getByTestId('import-confirm'));
    fireEvent.press(await screen.findByTestId('import-review'));
    expect(await screen.findByTestId('review-screen')).toBeOnTheScreen();
  });

  it('shows the lines of the file that are skipped, with their line numbers', async () => {
    start({ add_transactions: pipeline([]) });
    pick('revolut.csv', REVOLUT);
    await choose();
    expect(await screen.findByTestId('import-skipped')).toHaveTextContent(/^3 lines skipped/);
    expect(screen.getByTestId('import-skipped-reasons')).toHaveTextContent(
      'Not booked yet (2) · Not in CHF (1)',
    );
    expect(screen.queryByTestId('import-skipped-line-3')).toBeNull();
    fireEvent.press(screen.getByTestId('import-skipped-toggle'));
    expect(screen.getByTestId('import-skipped-not_booked')).toBeOnTheScreen();
    expect(screen.getByTestId('import-skipped-line-3')).toHaveTextContent(/^Line 3: CARD_PAYMENT/);
    expect(screen.getByTestId('import-skipped-line-7')).toHaveTextContent(/REVERTED/);
    expect(screen.getByTestId('import-skipped-line-5')).toHaveTextContent(/EUR/);
    fireEvent.press(screen.getByTestId('import-skipped-toggle'));
    expect(screen.queryByTestId('import-skipped-line-3')).toBeNull();
    expect(screen.getByTestId('import-source')).toHaveTextContent('Revolut');
  });

  it('keeps the parsed file when the check or the import fails, and tries again', async () => {
    const answer = pipeline(UBS_PLANS);
    let failCheck = true;
    let failSave = true;
    const fake = start({
      add_transactions: (args) => {
        const { p } = args as AddArgs;
        if (p.dry_run && failCheck) return failed();
        if (!p.dry_run && failSave) return refused('invalid_row');
        return answer(args);
      },
    });
    pick('ubs.csv', UBS_DE);
    await choose();
    expect(await screen.findByTestId('import-check-error')).toHaveTextContent(
      /could not be compared.*Something went wrong/,
    );
    expect(screen.getByTestId('import-confirm')).toBeDisabled();

    failCheck = false;
    fireEvent.press(screen.getByTestId('import-check-error-action'));
    await screen.findByTestId('import-row-0');
    fireEvent.press(screen.getByTestId('import-confirm'));
    expect(await screen.findByTestId('import-save-error')).toHaveTextContent(
      /Nothing was imported.*One of the transactions could not be saved/,
    );
    expect(screen.getByTestId('import-row-0')).toBeChecked();

    failSave = false;
    fireEvent.press(screen.getByTestId('import-confirm'));
    expect(await screen.findByTestId('import-result')).toBeOnTheScreen();
    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledTimes(1);
    expect(rpcCalls(fake, 'add_transactions')).toHaveLength(4);
  });

  it('asks which column is which for an unknown CSV and parses it with that mapping', async () => {
    const unknown = [
      'Mein Export',
      'Tag;Was;Wieviel;Wo',
      '30.09.2026;Znüni;-4.50;Exempla Kiosk',
      '29.09.2026;Zmittag;-18.00;Exempla Bistro',
    ].join('\n');
    const fake = start({ add_transactions: pipeline([]) });
    pick('export.csv', unknown);
    await choose();

    expect(await screen.findByText('Which column is which?')).toBeOnTheScreen();
    expect(screen.getByTestId('import-map-column-0')).toHaveTextContent(
      'Tag30.09.2026 · 29.09.2026',
    );
    expect(screen.getByTestId('import-map-column-3')).toHaveTextContent(
      'WoExempla Kiosk · Exempla Bistro',
    );
    fireEvent.press(screen.getByTestId('import-map-continue'));
    expect(screen.getByTestId('import-map-problem-date')).toHaveTextContent(
      'Choose the column with the date.',
    );
    expect(screen.getByTestId('import-map-problem-amount')).toBeOnTheScreen();
    expect(screen.getByTestId('import-map-problem-text')).toBeOnTheScreen();

    // A text column as the date reads nothing: the screen asks to check the columns.
    fireEvent.press(screen.getByTestId('import-map-date-1'));
    fireEvent.press(screen.getByTestId('import-map-amount-2'));
    fireEvent.press(screen.getByTestId('import-map-text-3'));
    fireEvent.press(screen.getByTestId('import-map-continue'));
    expect(await screen.findByTestId('import-map-rejected')).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('import-map-date-0'));
    expect(screen.queryByTestId('import-map-rejected')).toBeNull();
    fireEvent.press(screen.getByTestId('import-map-text-1'));
    fireEvent.press(screen.getByTestId('import-map-continue'));

    expect(await screen.findByTestId('import-source')).toHaveTextContent('CSV');
    expect(screen.getByTestId('import-count')).toHaveTextContent('2 transactions');
    await screen.findByTestId('import-row-1');
    const [dryRun] = rpcCalls(fake, 'add_transactions') as AddArgs[];
    expect(dryRun?.p.import).toEqual({ file_name: 'export.csv', format: 'csv', bank: null });
    expect(dryRun?.p.rows.map((row) => row.raw_text)).toEqual([
      'Znüni; Exempla Kiosk',
      'Zmittag; Exempla Bistro',
    ]);
  });

  it('offers another file instead of mapping the columns', async () => {
    start();
    pick('export.csv', 'Tag;Was;Wieviel\n30.09.2026;Znüni;-4.50\n');
    await choose();
    expect(await screen.findByTestId('import-map-continue')).toBeOnTheScreen();
    pick('ubs.csv', UBS_DE);
    await choose('import-map-choose-another');
    expect(await screen.findByTestId('import-source')).toHaveTextContent('UBS');
  });

  it('maps separate debit and credit columns', async () => {
    const split =
      'Datum;Text;Raus;Rein\n30.09.2026;Exempla Kiosk;4.50;\n29.09.2026;Fictiva Lohn;;5200.00\n';
    start({ add_transactions: pipeline([]) });
    pick('konto.csv', split);
    await choose();
    await screen.findByText('Which column is which?');
    // "Datum" and "Text" were recognised; only the amount is missing.
    expect(screen.getByTestId('import-map-date-0')).toBeChecked();
    expect(screen.getByTestId('import-map-text-1')).toBeChecked();
    fireEvent.press(screen.getByTestId('import-map-amount-kind-split'));
    fireEvent.press(screen.getByTestId('import-map-debit-2'));
    fireEvent.press(screen.getByTestId('import-map-credit-3'));
    fireEvent.press(screen.getByTestId('import-map-continue'));
    expect(await screen.findByTestId('import-row-1-value')).toHaveTextContent('CHF +5,200.00');
    expect(screen.getByTestId('import-row-0-value')).toHaveTextContent('CHF 4.50');
  });

  it.each([
    ['empty', '', 'This file is empty.'],
    [
      'unsupported_format',
      '%PDF-1.7\n1 0 obj',
      'This is not a statement the app can read. Choose the camt.053 (XML) or CSV export of your e-banking; PDF and Excel files do not work.',
    ],
    [
      'invalid_xml',
      '<?xml version="1.0"?><Document><BkToCstmrStmt><Stmt>',
      'This XML file is damaged or incomplete. Download it again from your e-banking.',
    ],
    [
      'not_chf',
      REVOLUT.split('\n')
        .filter((line, index) => index === 0 || line.includes(',EUR,'))
        .join('\n'),
      'This account is not in Swiss francs. The app tracks CHF accounts only.',
    ],
    [
      'no_transactions',
      REVOLUT.split('\n')
        .filter((line, index) => index === 0 || line.includes('PENDING'))
        .join('\n'),
      'This file contains no transactions to import.',
    ],
    [
      'too_many_rows',
      [
        'Datum;Buchungstext;Betrag',
        ...Array.from({ length: 2001 }, (_, i) => `30.09.2026;Exempla ${i};-1.00`),
      ].join('\n'),
      'This file has 2001 transactions; one import takes at most 2000. Export a shorter period and import it in parts.',
    ],
  ])('explains %s and offers another file', async (code, text, message) => {
    start();
    pick('file.csv', text);
    await choose();
    expect(await screen.findByTestId(`import-problem-${code}`)).toHaveTextContent(
      `This file cannot be imported${message}`,
    );
    if (code === 'no_transactions') {
      expect(screen.getByTestId('import-problem-skipped')).toHaveTextContent(
        /^1 line skippedNot booked yet \(1\)/,
      );
    }
    pick('ubs.csv', UBS_DE);
    await choose('import-choose-another');
    expect(await screen.findByTestId('import-source')).toHaveTextContent('UBS');
  });

  it('refuses a file over 5 MB before reading it', async () => {
    start();
    const arrayBuffer = jest.fn();
    jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          name: 'huge.csv',
          uri: 'blob:huge',
          size: MAX_IMPORT_FILE_BYTES + 1,
          lastModified: 0,
          file: { arrayBuffer } as never,
        },
      ],
    });
    await choose();
    expect(await screen.findByTestId('import-problem-too_large')).toHaveTextContent(
      /This file is larger than 5 MB\. Export a shorter period/,
    );
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('explains a file that cannot be opened, and a picker that fails', async () => {
    start();
    jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          name: 'locked.csv',
          uri: 'blob:locked',
          size: 10,
          lastModified: 0,
          file: { arrayBuffer: () => Promise.reject(new Error('denied')) } as never,
        },
      ],
    });
    await choose();
    expect(await screen.findByTestId('import-problem-unreadable')).toHaveTextContent(
      /The file could not be opened\./,
    );
    expect(screen.getByText('locked.csv')).toBeOnTheScreen();
    jest.mocked(DocumentPicker.getDocumentAsync).mockRejectedValueOnce(new Error('busy'));
    await choose('import-choose-another');
    await waitFor(() => expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledTimes(2));
    expect(await screen.findByTestId('import-problem-unreadable')).toBeOnTheScreen();
  });

  it('reads the picked copy on a phone and deletes it afterwards', async () => {
    const files = (jest.requireMock('expo-file-system') as { __files: Map<string, Uint8Array> })
      .__files;
    files.set('file:///cache/DocumentPicker/ubs.csv', utf8(UBS_DE));
    start();
    jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          name: 'ubs.csv',
          uri: 'file:///cache/DocumentPicker/ubs.csv',
          size: 900,
          lastModified: 0,
        },
      ],
    });
    await choose();
    expect(await screen.findByTestId('import-source')).toHaveTextContent('UBS');
    expect(files.has('file:///cache/DocumentPicker/ubs.csv')).toBe(false);
  });

  it('after onboarding, "Not now" goes to Home', async () => {
    start({}, '/import?from=onboarding');
    fireEvent.press(await screen.findByTestId('import-header-back'));
    expect(await screen.findByTestId('home-screen')).toBeOnTheScreen();
  });

  it('after onboarding, "Done" goes to Home', async () => {
    start({}, '/import?from=onboarding');
    expect(await screen.findByTestId('import-header-back')).toHaveTextContent('Not now');
    pick('ubs.csv', UBS_DE);
    await choose();
    fireEvent.press(await screen.findByTestId('import-confirm'));
    fireEvent.press(await screen.findByTestId('import-done'));
    expect(await screen.findByTestId('home-screen')).toBeOnTheScreen();
  });

  it('leaves to the data sources when opened directly', async () => {
    start();
    fireEvent.press(await screen.findByTestId('import-header-back'));
    expect(await screen.findByTestId('data-sources-screen')).toBeOnTheScreen();
  });

  it('shows the reading state while a picked file is parsed', async () => {
    start();
    let release: () => void = () => undefined;
    const bytes = utf8(UBS_DE);
    jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          name: 'slow.csv',
          uri: 'blob:slow',
          size: bytes.length,
          lastModified: 0,
          file: {
            arrayBuffer: () =>
              new Promise<ArrayBuffer>((resolve) => {
                release = () => resolve(bytes.slice().buffer);
              }),
          } as never,
        },
      ],
    });
    await choose();
    expect(await screen.findByTestId('import-reading')).toHaveTextContent('Reading the file…');
    await act(async () => {
      release();
      await jest.advanceTimersByTimeAsync(20);
    });
    expect(await screen.findByTestId('import-source')).toBeOnTheScreen();
    expect(within(screen.getByTestId('import-summary')).getByText('slow.csv')).toBeOnTheScreen();
  });
});
