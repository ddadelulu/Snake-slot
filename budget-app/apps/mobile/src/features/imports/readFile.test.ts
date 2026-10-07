import { MAX_IMPORT_FILE_BYTES } from '@budget/core';
import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';

import { pickStatementFile, readAssetBytes } from './readFile';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => {
  const files = new Map<string, Uint8Array>();
  const deleted: string[] = [];
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
      deleted.push(this.uri);
      if (this.uri.includes('locked')) throw new Error('read-only');
    }
  }
  return { File: MockFile, __files: files, __deleted: deleted };
});

const mock = () =>
  jest.requireMock('expo-file-system') as { __files: Map<string, Uint8Array>; __deleted: string[] };

const BYTES = new TextEncoder().encode('Datum;Text;Betrag\n30.09.2026;Exempla;-1.00\n');

function picked(asset: Partial<DocumentPicker.DocumentPickerAsset>) {
  jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValueOnce({
    canceled: false,
    assets: [{ name: 'konto.csv', uri: 'file:///cache/konto.csv', lastModified: 0, ...asset }],
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mock().__files.clear();
  mock().__deleted.length = 0;
});

describe('pickStatementFile', () => {
  it('reads the picked file on a phone and deletes the copy', async () => {
    mock().__files.set('file:///cache/konto.csv', BYTES);
    picked({ size: BYTES.length });
    const onPicked = jest.fn();
    await expect(pickStatementFile(onPicked)).resolves.toEqual({
      kind: 'picked',
      file: { name: 'konto.csv', bytes: BYTES },
    });
    expect(onPicked).toHaveBeenCalledTimes(1);
    expect(mock().__deleted).toEqual(['file:///cache/konto.csv']);
  });

  it('reads the browser file on the web', async () => {
    picked({
      size: BYTES.length,
      file: { arrayBuffer: async () => BYTES.slice().buffer } as never,
    });
    const result = await pickStatementFile();
    expect(result).toMatchObject({ kind: 'picked', file: { name: 'konto.csv' } });
    expect(result.kind === 'picked' && [...result.file.bytes]).toEqual([...BYTES]);
    expect(mock().__deleted).toEqual([]);
  });

  it('does nothing when the picker is closed', async () => {
    jest
      .mocked(DocumentPicker.getDocumentAsync)
      .mockResolvedValueOnce({ canceled: true, assets: null });
    const onPicked = jest.fn();
    await expect(pickStatementFile(onPicked)).resolves.toEqual({ kind: 'canceled' });
    jest
      .mocked(DocumentPicker.getDocumentAsync)
      .mockResolvedValueOnce({ canceled: false, assets: [] });
    await expect(pickStatementFile(onPicked)).resolves.toEqual({ kind: 'canceled' });
    expect(onPicked).not.toHaveBeenCalled();
  });

  it('refuses a file over the limit without reading it', async () => {
    picked({ size: MAX_IMPORT_FILE_BYTES + 1 });
    await expect(pickStatementFile()).resolves.toEqual({
      kind: 'problem',
      name: 'konto.csv',
      problem: { code: 'too_large', maxBytes: MAX_IMPORT_FILE_BYTES },
    });
  });

  it('reports a file that cannot be read, and a picker that fails', async () => {
    picked({});
    await expect(pickStatementFile()).resolves.toEqual({
      kind: 'problem',
      name: 'konto.csv',
      problem: { code: 'unreadable' },
    });
    jest.mocked(DocumentPicker.getDocumentAsync).mockRejectedValueOnce(new Error('busy'));
    await expect(pickStatementFile()).resolves.toEqual({
      kind: 'problem',
      name: null,
      problem: { code: 'unreadable' },
    });
  });
});

describe('readAssetBytes', () => {
  it('keeps the bytes when the copy cannot be deleted', async () => {
    mock().__files.set('file:///cache/locked.csv', BYTES);
    await expect(readAssetBytes({ uri: 'file:///cache/locked.csv' })).resolves.toBe(BYTES);
  });

  it('leaves files alone on the web', async () => {
    const platform = jest.replaceProperty(Platform, 'OS', 'web');
    mock().__files.set('blob:konto', BYTES);
    await readAssetBytes({ uri: 'blob:konto' });
    expect(mock().__deleted).toEqual([]);
    platform.restore();
  });
});
