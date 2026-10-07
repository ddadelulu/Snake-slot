import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { SharingUnavailableError, deliverFile } from './deliverFile';
import type { ExportFile } from './exportFiles';

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-file-system', () => {
  const written = new Map<string, string>();
  class MockFile {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('');
    }
    create(options: { overwrite?: boolean }) {
      if (!options.overwrite && written.has(this.uri)) throw new Error('exists');
    }
    write(content: string) {
      written.set(this.uri, content);
    }
  }
  return { File: MockFile, Paths: { cache: { uri: 'file:///cache/' } }, __written: written };
});

const FILE: ExportFile = {
  name: 'batzen-transactions-2026-10-07.csv',
  content: '﻿Datum;Betrag\r\n2026-10-07;-4.50\r\n',
  mimeType: 'text/csv',
  uti: 'public.comma-separated-values-text',
};

const written = () =>
  (jest.requireMock('expo-file-system') as { __written: Map<string, string> }).__written;

beforeEach(() => {
  jest.clearAllMocks();
  written().clear();
});

describe('deliverFile on a phone', () => {
  it('writes the file to the cache and opens the share sheet', async () => {
    await expect(deliverFile(FILE)).resolves.toBe('shared');
    const uri = 'file:///cache/batzen-transactions-2026-10-07.csv';
    expect(written().get(uri)).toBe(FILE.content);
    expect(Sharing.shareAsync).toHaveBeenCalledWith(uri, {
      mimeType: 'text/csv',
      UTI: 'public.comma-separated-values-text',
      dialogTitle: 'batzen-transactions-2026-10-07.csv',
    });
  });

  it('replaces an earlier export of the same day', async () => {
    await deliverFile(FILE);
    await deliverFile({ ...FILE, content: 'new' });
    expect(written().get('file:///cache/batzen-transactions-2026-10-07.csv')).toBe('new');
  });

  it('refuses when the phone cannot share files', async () => {
    jest.mocked(Sharing.isAvailableAsync).mockResolvedValueOnce(false);
    await expect(deliverFile(FILE)).rejects.toBeInstanceOf(SharingUnavailableError);
    expect(written().size).toBe(0);
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
