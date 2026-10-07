import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, waitFor, within } from 'expo-router/testing-library';

import { i18n, LANGUAGE_STORAGE_KEY } from '@/i18n';
import { readEnv } from '@/lib/env';
import { failed, importRow, ok, refused, rpcCalls, startImportsApp } from '@/test/importsFixture';
import type { FakeRow, RpcHandler } from '@/test/fakeSupabase';

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));
jest.mock('@/lib/env', () => ({ ...jest.requireActual('@/lib/env'), readEnv: jest.fn() }));
jest.mock('@/lib/supabase', () => ({
  getSupabase: jest.fn(),
  getSupabaseIfConfigured: jest.fn(),
  authRedirectUrl: jest.fn(() => 'batzen://auth/callback'),
}));

const POSTFINANCE = importRow({ id: 'ds-1' });
const CAMT = importRow({
  id: 'ds-2',
  display_name: 'camt053-august.xml',
  status: 'revoked',
  created_at: '2026-09-02T07:00:00+00:00',
  settings: {
    file_name: 'camt053-august.xml',
    format: 'camt053',
    bank: null,
    added: 30,
    merged: 0,
  },
});

/**
 * remove_import as the database does it (D-041): the source is marked revoked; the answer says
 * how many transactions were removed and how many earlier ones were restored.
 */
function removeImport(
  tables: { data_sources: FakeRow[] },
  result = { removed: 12, restored: 0 },
): RpcHandler {
  return (args) => {
    const id = (args as { p_data_source_id: string }).p_data_source_id;
    const row = tables.data_sources.find((candidate) => candidate.id === id);
    if (!row) return refused('import_not_found');
    row.status = 'revoked';
    return ok(result);
  };
}

function start(
  rows: FakeRow[] = [POSTFINANCE, CAMT],
  rpc: Record<string, RpcHandler> = {},
  removal?: { removed: number; restored: number },
) {
  const tables = { data_sources: rows.map((row) => ({ ...row })) };
  const fake = startImportsApp({
    url: '/data-sources',
    tables,
    rpc: { remove_import: removeImport(tables, removal), ...rpc },
  });
  return { ...fake, tables };
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

describe('data sources', () => {
  it('lists every statement import with its counts, newest first', async () => {
    start();
    const first = await screen.findByTestId('data-sources-import-ds-1');
    expect(first).toHaveTextContent(/konto-september\.csv/);
    expect(first).toHaveTextContent(/PostFinance · Imported 3 October 2026/);
    expect(screen.getByTestId('data-sources-import-ds-1-state')).toHaveTextContent(
      '12 added, 1 merged',
    );
    const removed = screen.getByTestId('data-sources-import-ds-2');
    expect(removed).toHaveTextContent(/camt\.053 · Imported 2 September 2026/);
    expect(screen.getByTestId('data-sources-import-ds-2-state')).toHaveTextContent('Removed');
    expect(screen.queryByTestId('data-sources-remove-ds-2')).toBeNull();
    expect(screen.getByTestId('data-sources-by-hand')).toHaveTextContent(
      'Paying cash? Add a purchase by hand with + on Home.',
    );
  });

  it('removes an import after confirmation and says how many transactions went', async () => {
    const fake = start();
    fireEvent.press(await screen.findByTestId('data-sources-remove-ds-1'));
    const sheet = await screen.findByTestId('data-sources-remove-sheet-panel');
    expect(sheet).toHaveTextContent(
      /The transactions that came from konto-september\.csv are deleted for good\. Transactions you typed in yourself stay; what the file added to them is undone\./,
    );
    fireEvent.press(within(sheet).getByTestId('data-sources-remove-confirm'));

    expect(await screen.findByTestId('data-sources-removed')).toHaveTextContent(
      /^12 transactions from konto-september\.csv were removed\./,
    );
    // Nothing earlier was changed by this file, so nothing was put back.
    expect(screen.queryByTestId('data-sources-removed-detail')).toBeNull();
    expect(rpcCalls(fake, 'remove_import')).toEqual([{ p_data_source_id: 'ds-1' }]);
    await waitFor(() =>
      expect(screen.getByTestId('data-sources-import-ds-1-state')).toHaveTextContent('Removed'),
    );
    expect(screen.queryByTestId('data-sources-remove-ds-1')).toBeNull();
    fireEvent.press(screen.getByTestId('data-sources-removed-dismiss'));
    expect(screen.queryByTestId('data-sources-removed')).toBeNull();
  });

  it('also says how many earlier transactions were put back as they were', async () => {
    start([POSTFINANCE], {}, { removed: 1, restored: 3 });
    fireEvent.press(await screen.findByTestId('data-sources-remove-ds-1'));
    fireEvent.press(await screen.findByTestId('data-sources-remove-confirm'));
    expect(await screen.findByTestId('data-sources-removed')).toHaveTextContent(
      /^1 transaction from konto-september\.csv was removed\.3 earlier transactions were put back as they were\./,
    );
    expect(screen.getByTestId('data-sources-removed-detail')).toHaveTextContent(
      '3 earlier transactions were put back as they were.',
    );
    expect(screen.getByRole('alert')).toHaveAccessibleName(
      '1 transaction from konto-september.csv was removed. 3 earlier transactions were put back as they were.',
    );
  });

  it('keeps the import when the person changes their mind', async () => {
    const fake = start();
    fireEvent.press(await screen.findByTestId('data-sources-remove-ds-1'));
    fireEvent.press(await screen.findByTestId('data-sources-remove-cancel'));
    // Let the sheet slide out.
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000);
    });
    expect(screen.queryByTestId('data-sources-remove-sheet-panel')).toBeNull();
    expect(rpcCalls(fake, 'remove_import')).toEqual([]);
    expect(screen.getByTestId('data-sources-remove-ds-1')).toBeOnTheScreen();
  });

  it('explains a failed removal and an import that no longer exists', async () => {
    let answer: ReturnType<RpcHandler> = failed();
    start([POSTFINANCE], { remove_import: () => answer });
    fireEvent.press(await screen.findByTestId('data-sources-remove-ds-1'));
    fireEvent.press(await screen.findByTestId('data-sources-remove-confirm'));
    expect(await screen.findByTestId('data-sources-remove-error')).toHaveTextContent(
      'The import could not be removed. Check your connection and try again.',
    );
    answer = refused('import_not_found');
    fireEvent.press(screen.getByTestId('data-sources-remove-confirm'));
    await waitFor(() =>
      expect(screen.getByTestId('data-sources-remove-error')).toHaveTextContent(
        'This import no longer exists.',
      ),
    );
  });

  it('has an empty state and opens the import', async () => {
    start([]);
    expect(await screen.findByTestId('data-sources-empty')).toHaveTextContent(
      /No statements imported yet/,
    );
    fireEvent.press(screen.getByTestId('data-sources-new-import'));
    expect(await screen.findByTestId('import-choose')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('import-header-back'));
    expect(await screen.findByTestId('data-sources-screen')).toBeOnTheScreen();
  });

  it('offers to try again when the imports cannot be loaded', async () => {
    const fake = start();
    fake.state.tableErrors.data_sources = { message: 'boom' };
    expect(
      await screen.findByTestId('data-sources-error', {}, { timeout: 5000 }),
    ).toHaveTextContent(/Your imports could not be loaded\./);
    delete fake.state.tableErrors.data_sources;
    fireEvent.press(screen.getByTestId('data-sources-error-action'));
    expect(await screen.findByTestId('data-sources-import-ds-1')).toBeOnTheScreen();
  });

  it('shows the German texts', async () => {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, 'de');
    start([POSTFINANCE], {});
    expect(await screen.findByTestId('data-sources-import-ds-1')).toHaveTextContent(
      /PostFinance · Importiert am 3\. Oktober 2026/,
    );
    expect(screen.getByTestId('data-sources-import-ds-1-state')).toHaveTextContent(
      '12 hinzugefügt, 1 zusammengeführt',
    );
  });

  it('says what was removed and restored in German', async () => {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, 'de');
    start([POSTFINANCE], {}, { removed: 12, restored: 1 });
    fireEvent.press(await screen.findByTestId('data-sources-remove-ds-1'));
    expect(await screen.findByTestId('data-sources-remove-sheet-panel')).toHaveTextContent(
      /Die Buchungen aus konto-september\.csv werden endgültig gelöscht\./,
    );
    fireEvent.press(screen.getByTestId('data-sources-remove-confirm'));
    expect(await screen.findByTestId('data-sources-removed')).toHaveTextContent(
      /^12 Buchungen aus konto-september\.csv wurden entfernt\./,
    );
    expect(screen.getByTestId('data-sources-removed-detail')).toHaveTextContent(
      '1 frühere Buchung wurde wiederhergestellt, wie sie war.',
    );
  });
});

describe('settings → your data', () => {
  it('opens data sources, rules and the export, and back', async () => {
    startImportsApp({ url: '/settings' });
    fireEvent.press(await screen.findByTestId('settings-data-sources'));
    expect(await screen.findByTestId('data-sources-screen')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('data-sources-header-back'));
    expect(await screen.findByTestId('settings-screen')).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('settings-rules'));
    expect(await screen.findByTestId('rules-screen')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('rules-header-back'));
    expect(await screen.findByTestId('settings-screen')).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('settings-export'));
    expect(await screen.findByTestId('export-screen')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('export-header-back'));
    expect(await screen.findByTestId('settings-screen')).toBeOnTheScreen();
    // The account section is unchanged.
    expect(screen.getByTestId('settings-sign-out')).toBeOnTheScreen();
    expect(screen.getByTestId('settings-delete-account')).toBeOnTheScreen();
  });
});
