import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sharing from 'expo-sharing';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Platform } from 'react-native';

import { i18n } from '@/i18n';
import { readEnv } from '@/lib/env';
import { fakeSession } from '@/test/appHarness';
import { EXPORT_CSV_LINES_EN, EXPORT_JSON } from '@/test/exportFixture';
import type { RpcHandler } from '@/test/fakeSupabase';
import { failed, ok, rpcCalls, startImportsApp } from '@/test/importsFixture';

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));
jest.mock('@/lib/env', () => ({ ...jest.requireActual('@/lib/env'), readEnv: jest.fn() }));
jest.mock('@/lib/supabase', () => ({
  getSupabase: jest.fn(),
  getSupabaseIfConfigured: jest.fn(),
  authRedirectUrl: jest.fn(() => 'batzen://auth/callback'),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));
/**
 * The app cache: `__files` is what is there now, `__written` everything ever written (kept after
 * the export deletes the file again).
 */
jest.mock('expo-file-system', () => {
  const files = new Map<string, string>();
  const written = new Map<string, string>();
  let failWrites = false;
  class MockFile {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('');
    }
    get name() {
      return this.uri.slice(this.uri.lastIndexOf('/') + 1);
    }
    get exists() {
      return files.has(this.uri);
    }
    create() {
      if (failWrites) throw new Error('disk full');
      files.set(this.uri, '');
    }
    write(content: string) {
      files.set(this.uri, content);
      written.set(this.uri, content);
    }
    delete() {
      files.delete(this.uri);
    }
  }
  return {
    File: MockFile,
    Paths: {
      cache: {
        uri: 'file:///cache/',
        list: () => [...files.keys()].map((uri) => new MockFile(uri)),
      },
    },
    __files: files,
    __written: written,
    __failWrites: (fail: boolean) => {
      failWrites = fail;
    },
  };
});

const fileSystem = () =>
  jest.requireMock('expo-file-system') as {
    __files: Map<string, string>;
    __written: Map<string, string>;
    __failWrites: (fail: boolean) => void;
  };

function start(exportMyData: RpcHandler = () => ok(EXPORT_JSON)) {
  const fake = startImportsApp({ url: '/export', rpc: { export_my_data: exportMyData } });
  // Tuesday 7 October 2026, 10:00 in Zurich.
  jest.setSystemTime(new Date('2026-10-07T08:00:00Z'));
  return fake;
}

beforeEach(async () => {
  jest.clearAllMocks();
  fileSystem().__files.clear();
  fileSystem().__written.clear();
  fileSystem().__failWrites(false);
  jest.mocked(readEnv).mockReturnValue({
    ok: true,
    supabaseUrl: 'http://127.0.0.1:54321',
    supabaseKey: 'publishable-key',
    appEnv: 'development',
  });
  await AsyncStorage.clear();
  await i18n.changeLanguage('en');
});

describe('export my data', () => {
  it('shares the transactions as a CSV file that opens in Excel', async () => {
    const fake = start();
    expect(await screen.findByTestId('export-privacy')).toHaveTextContent(
      /personal financial data\. Share it carefully/,
    );
    fireEvent.press(screen.getByTestId('export-csv'));
    expect(await screen.findByTestId('export-done')).toHaveTextContent(
      'batzen-transactions-2026-10-07.csv is ready.',
    );
    expect(rpcCalls(fake, 'export_my_data')).toHaveLength(1);
    const uri = 'file:///cache/batzen-transactions-2026-10-07.csv';
    const csv = fileSystem().__written.get(uri) as string;
    expect(csv.split('\r\n')).toEqual([
      '﻿Date;Time;Amount (CHF);Category;Merchant;Note;Source;Original amount;Original currency;Statement text;Transaction ID',
      ...EXPORT_CSV_LINES_EN,
      '',
    ]);
    expect(Sharing.shareAsync).toHaveBeenCalledWith(uri, {
      mimeType: 'text/csv',
      UTI: 'public.comma-separated-values-text',
      dialogTitle: 'batzen-transactions-2026-10-07.csv',
    });
    // Once the share sheet is closed the file is gone from the cache.
    expect(fileSystem().__files.size).toBe(0);
  });

  it('shares everything as a JSON file that names the signed-in account', async () => {
    const fake = start();
    // An export left from an earlier day goes before the new one is written.
    fileSystem().__files.set('file:///cache/batzen-data-2026-10-01.json', '{}');
    fireEvent.press(await screen.findByTestId('export-json'));
    expect(await screen.findByTestId('export-done')).toHaveTextContent(
      'batzen-data-2026-10-07.json is ready.',
    );
    expect(rpcCalls(fake, 'export_my_data')).toHaveLength(1);
    const json = fileSystem().__written.get('file:///cache/batzen-data-2026-10-07.json');
    expect(JSON.parse(json as string)).toEqual({
      ...EXPORT_JSON,
      account: { user_id: fakeSession().user.id, email: 'anna@example.ch' },
    });
    expect(fileSystem().__files.size).toBe(0);
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      'file:///cache/batzen-data-2026-10-07.json',
      expect.objectContaining({ mimeType: 'application/json', UTI: 'public.json' }),
    );
  });

  it('shows the progress while the data loads', async () => {
    let answer: (value: ReturnType<RpcHandler>) => void = () => undefined;
    const fake = start(() => ({ data: null, error: null }));
    // Only the export waits; other calls (the payment-moment check on start) answer at once.
    const answerNow = fake.client.rpc.getMockImplementation();
    fake.client.rpc.mockImplementation((name: string, args?: unknown) =>
      name === 'export_my_data'
        ? (new Promise((resolve) => {
            answer = (value) => resolve({ ...value, status: 200 });
          }) as never)
        : answerNow!(name, args),
    );
    fireEvent.press(await screen.findByTestId('export-csv'));
    expect(await screen.findByTestId('export-working')).toHaveTextContent('Preparing your file…');
    expect(screen.getByTestId('export-json')).toBeDisabled();
    answer(ok(EXPORT_JSON));
    expect(await screen.findByTestId('export-done')).toBeOnTheScreen();
    expect(screen.queryByTestId('export-working')).toBeNull();
    expect(screen.getByTestId('export-json')).toBeEnabled();
  });

  it('explains a failed load, a failed file and a phone that cannot share', async () => {
    let answer: ReturnType<RpcHandler> = failed();
    start(() => answer);
    fireEvent.press(await screen.findByTestId('export-csv'));
    expect(await screen.findByTestId('export-error')).toHaveTextContent(
      'Your data could not be loaded. Check your connection and try again.',
    );

    answer = ok(EXPORT_JSON);
    fileSystem().__failWrites(true);
    fireEvent.press(screen.getByTestId('export-csv'));
    await waitFor(() =>
      expect(screen.getByTestId('export-error')).toHaveTextContent(
        'The file could not be created. Try again.',
      ),
    );

    fileSystem().__failWrites(false);
    jest.mocked(Sharing.isAvailableAsync).mockResolvedValueOnce(false);
    fireEvent.press(screen.getByTestId('export-json'));
    await waitFor(() =>
      expect(screen.getByTestId('export-error')).toHaveTextContent(
        'This device cannot share files.',
      ),
    );
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('downloads the file in the web build', async () => {
    const anchor = { href: '', download: '', style: { display: '' }, click: jest.fn() };
    const blobs: Blob[] = [];
    Object.assign(globalThis, {
      document: {
        createElement: jest.fn(() => anchor),
        body: { appendChild: jest.fn(), removeChild: jest.fn() },
      },
    });
    URL.createObjectURL = jest.fn((blob: Blob) => {
      blobs.push(blob);
      return 'blob:export';
    });
    URL.revokeObjectURL = jest.fn();
    let platform: { restore: () => void } | undefined;
    try {
      start();
      const button = await screen.findByTestId('export-csv');
      platform = jest.replaceProperty(Platform, 'OS', 'web');
      fireEvent.press(button);
      expect(await screen.findByTestId('export-done')).toHaveTextContent(
        'batzen-transactions-2026-10-07.csv was downloaded.',
      );
      expect(anchor.download).toBe('batzen-transactions-2026-10-07.csv');
      expect(anchor.click).toHaveBeenCalledTimes(1);
      expect((await (blobs[0] as Blob).text()).split('\r\n')[1]).toBe(EXPORT_CSV_LINES_EN[0]);
      expect(Sharing.shareAsync).not.toHaveBeenCalled();
    } finally {
      platform?.restore();
      delete (globalThis as { document?: unknown }).document;
    }
  });
});
