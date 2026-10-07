import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { SharingUnavailableError, deliverFile } from './deliverFile';
import type { ExportFile } from './exportFiles';

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));
/**
 * The app cache as a map of file URIs to contents: `__files` is what is there now, `__written`
 * everything ever written (kept after a delete) and `__deleted` the deletions in order.
 */
jest.mock('expo-file-system', () => {
  const CACHE = 'file:///cache/';
  const files = new Map<string, string>();
  const written = new Map<string, string>();
  const deleted: string[] = [];
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
    create(options: { overwrite?: boolean }) {
      if (!options.overwrite && files.has(this.uri)) throw new Error('exists');
      files.set(this.uri, '');
    }
    write(content: string) {
      files.set(this.uri, content);
      written.set(this.uri, content);
    }
    delete() {
      if (!files.delete(this.uri)) throw new Error('no such file');
      deleted.push(this.uri);
    }
  }
  /** A folder in the cache, listed next to the files (never deleted by the export). */
  class MockDirectory {
    uri: string;
    constructor(path: string) {
      this.uri = path;
    }
    get name() {
      return this.uri.slice(CACHE.length, -1);
    }
    delete() {
      throw new Error('the export must not delete folders');
    }
  }
  const cache = {
    uri: CACHE,
    list: () => [
      ...[...files.keys()]
        .filter((uri) => uri.startsWith(CACHE) && !uri.slice(CACHE.length).includes('/'))
        .map((uri) => new MockFile(uri)),
      new MockDirectory(`${CACHE}batzen-data-2026-01-01.json/`),
    ],
  };
  return {
    File: MockFile,
    Paths: { cache },
    __files: files,
    __written: written,
    __deleted: deleted,
  };
});

const FILE: ExportFile = {
  name: 'batzen-transactions-2026-10-07.csv',
  content: '﻿Datum;Betrag\r\n2026-10-07;-4.50\r\n',
  mimeType: 'text/csv',
  uti: 'public.comma-separated-values-text',
};

const fileSystem = () =>
  jest.requireMock('expo-file-system') as {
    __files: Map<string, string>;
    __written: Map<string, string>;
    __deleted: string[];
  };

const URI = 'file:///cache/batzen-transactions-2026-10-07.csv';

beforeEach(() => {
  jest.clearAllMocks();
  fileSystem().__files.clear();
  fileSystem().__written.clear();
  fileSystem().__deleted.length = 0;
});

describe('deliverFile on a phone', () => {
  it('writes the file to the cache, opens the share sheet and deletes the file after it', async () => {
    let whileSharing: string | undefined;
    jest.mocked(Sharing.shareAsync).mockImplementationOnce(async (uri) => {
      whileSharing = fileSystem().__files.get(uri);
    });
    await expect(deliverFile(FILE)).resolves.toBe('shared');
    expect(Sharing.shareAsync).toHaveBeenCalledWith(URI, {
      mimeType: 'text/csv',
      UTI: 'public.comma-separated-values-text',
      dialogTitle: 'batzen-transactions-2026-10-07.csv',
    });
    expect(whileSharing).toBe(FILE.content);
    expect(fileSystem().__files.has(URI)).toBe(false);
    expect(fileSystem().__deleted).toEqual([URI]);
  });

  it('deletes export files left from earlier exports first, and nothing else', async () => {
    const files = fileSystem().__files;
    for (const name of [
      'batzen-data-2026-10-01.json',
      'batzen-transactions-2026-09-30.csv',
      'batzen-notes.txt',
      'konto.csv',
    ]) {
      files.set(`file:///cache/${name}`, 'old');
    }
    files.set('file:///cache/DocumentPicker/batzen-data-2026-10-02.json', 'picked');
    let leftWhileSharing: string[] = [];
    jest.mocked(Sharing.shareAsync).mockImplementationOnce(async () => {
      leftWhileSharing = [...files.keys()].sort();
    });

    await deliverFile(FILE);
    expect(leftWhileSharing).toEqual([
      'file:///cache/DocumentPicker/batzen-data-2026-10-02.json',
      'file:///cache/batzen-notes.txt',
      URI,
      'file:///cache/konto.csv',
    ]);
    expect([...files.keys()].sort()).toEqual([
      'file:///cache/DocumentPicker/batzen-data-2026-10-02.json',
      'file:///cache/batzen-notes.txt',
      'file:///cache/konto.csv',
    ]);
  });

  it('replaces an earlier export of the same day', async () => {
    fileSystem().__files.set(URI, 'old');
    await deliverFile({ ...FILE, content: 'new' });
    expect(fileSystem().__written.get(URI)).toBe('new');
    expect(fileSystem().__files.has(URI)).toBe(false);
  });

  it('deletes the file also when sharing fails', async () => {
    jest.mocked(Sharing.shareAsync).mockRejectedValueOnce(new Error('share sheet failed'));
    await expect(deliverFile(FILE)).rejects.toThrow('share sheet failed');
    expect(fileSystem().__files.has(URI)).toBe(false);
  });

  it('refuses when the phone cannot share files', async () => {
    jest.mocked(Sharing.isAvailableAsync).mockResolvedValueOnce(false);
    await expect(deliverFile(FILE)).rejects.toBeInstanceOf(SharingUnavailableError);
    expect(fileSystem().__written.size).toBe(0);
  });
});

describe('deliverFile on the web', () => {
  const anchor = { href: '', download: '', style: { display: '' }, click: jest.fn() };
  const body = { appendChild: jest.fn(), removeChild: jest.fn() };
  const blobs: Blob[] = [];

  beforeEach(() => {
    jest.useFakeTimers();
    jest.replaceProperty(Platform, 'OS', 'web');
    Object.assign(globalThis, {
      document: { createElement: jest.fn(() => anchor), body },
    });
    URL.createObjectURL = jest.fn((blob: Blob) => {
      blobs.push(blob);
      return 'blob:export-1';
    });
    URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete (globalThis as { document?: unknown }).document;
  });

  it('downloads the file through a temporary link', async () => {
    await expect(deliverFile(FILE)).resolves.toBe('downloaded');
    expect(anchor).toMatchObject({ href: 'blob:export-1', download: FILE.name });
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(body.appendChild).toHaveBeenCalledWith(anchor);
    expect(body.removeChild).toHaveBeenCalledWith(anchor);
    const blob = blobs[0] as Blob;
    expect(blob.type).toBe('text/csv;charset=utf-8');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:export-1');
  });
});
