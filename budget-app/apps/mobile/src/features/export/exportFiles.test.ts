import type { MyDataExport } from '@/data/exportData';
import { ResponseFormatError } from '@/data/json';
import { i18n } from '@/i18n';
import { EXPORT_CSV_LINES_EN, EXPORT_JSON } from '@/test/exportFixture';

import {
  buildExportFile,
  csvHeaders,
  dataJson,
  exportFileName,
  exportTimeZone,
  formatMinorAmount,
  isExportFileName,
  transactionsCsv,
} from './exportFiles';

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));

const data = EXPORT_JSON as unknown as MyDataExport;
const lines = (csv: string) => csv.slice(1).split('\r\n');

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

describe('transactionsCsv', () => {
  it('writes one line per kept transaction and per split part, newest first', () => {
    const csv = transactionsCsv(data, { t: i18n.t, timeZone: 'Europe/Zurich' });
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(lines(csv)).toEqual([
      'Date;Time;Amount (CHF);Category;Merchant;Note;Source;Original amount;Original currency;Statement text;Transaction ID',
      ...EXPORT_CSV_LINES_EN,
      '',
    ]);
  });

  it('leaves out deleted and merged transactions', () => {
    const csv = transactionsCsv(data, { t: i18n.t, timeZone: 'Europe/Zurich' });
    expect(csv).not.toContain('t-deleted');
    expect(csv).not.toContain('t-merged');
  });

  it('uses the app language for headers and names', async () => {
    await i18n.changeLanguage('de');
    const csv = transactionsCsv(data, { t: i18n.t, timeZone: 'Europe/Zurich' });
    expect(lines(csv)[0]).toBe(
      'Datum;Zeit;Betrag (CHF);Kategorie;Händler;Notiz;Quelle;Originalbetrag;Originalwährung;Buchungstext;Buchungs-ID',
    );
    expect(lines(csv)[2]).toBe(
      '2026-10-04;17:00;-30.00;Lebensmittel;Exempla Warenhaus;Wocheneinkauf;Von Hand;;;;t-split',
    );
    expect(lines(csv)[5]).toContain('Krankenkasse (Fixkosten)');
  });

  it('counts days and times in the given time zone', () => {
    const csv = transactionsCsv(data, { t: i18n.t, timeZone: 'UTC' });
    expect(lines(csv)[1]).toMatch(/^2026-10-05;22:30;-21\.37;/);
  });

  it('writes only the header for someone without transactions', () => {
    const empty = { ...data, transactions: [], transaction_splits: [] } as MyDataExport;
    expect(lines(transactionsCsv(empty, { t: i18n.t, timeZone: 'Europe/Zurich' }))).toEqual([
      csvHeaders(i18n.t).join(';'),
      '',
    ]);
    const missing = { format_version: 1, exported_at: '2026-10-07T08:00:00Z' } as MyDataExport;
    expect(transactionsCsv(missing, { t: i18n.t, timeZone: 'Europe/Zurich' })).toContain(
      'Transaction ID\r\n',
    );
  });

  it('names unknown sources by their code and refuses an unexpected export', () => {
    const odd = {
      ...data,
      transactions: [{ ...EXPORT_JSON.transactions[0], source: 'future_source' }],
      transaction_splits: [],
    } as unknown as MyDataExport;
    expect(transactionsCsv(odd, { t: i18n.t, timeZone: 'Europe/Zurich' })).toContain(
      ';future_source;',
    );
    const broken = { ...data, transactions: [{ id: 't-x' }] } as unknown as MyDataExport;
    expect(() => transactionsCsv(broken, { t: i18n.t, timeZone: 'Europe/Zurich' })).toThrow(
      ResponseFormatError,
    );
  });
});

describe('formatMinorAmount', () => {
  it('uses the decimals of the currency', () => {
    expect(formatMinorAmount(-2250, 'EUR')).toBe('-22.50');
    expect(formatMinorAmount(5, 'USD')).toBe('0.05');
    expect(formatMinorAmount(-1800, 'JPY')).toBe('-1800');
    expect(formatMinorAmount(12345, 'KWD')).toBe('12.345');
    expect(formatMinorAmount(150, 'XYZ1')).toBe('1.50');
  });
});

describe('files', () => {
  it('names files after the app and the day', () => {
    expect(exportFileName('transactions', '2026-10-07')).toBe('batzen-transactions-2026-10-07.csv');
    expect(exportFileName('data', '2026-10-07')).toBe('batzen-data-2026-10-07.json');
  });

  it('recognises its own export files, of any day, and nothing else', () => {
    expect(isExportFileName('batzen-transactions-2026-10-07.csv')).toBe(true);
    expect(isExportFileName('batzen-data-2025-01-31.json')).toBe(true);
    for (const name of [
      'batzen-transactions-2026-10-07.json',
      'batzen-data-2026-10-07.csv',
      'batzen-notes.txt',
      'batzen-transactions-latest.csv',
      'konto-batzen-data-2026-10-07.json',
      'batzen-data-2026-10-07.json.tmp',
      'batzen-data-2026-10-07xjson',
      'ubs.csv',
    ]) {
      expect({ name, export: isExportFileName(name) }).toEqual({ name, export: false });
    }
  });

  it('takes the time zone from the profile', () => {
    expect(exportTimeZone(data, 'UTC')).toBe('Europe/Zurich');
    expect(exportTimeZone({ ...data, profile: null }, 'UTC')).toBe('UTC');
    expect(exportTimeZone({ ...data, profile: { timezone: '' } }, 'UTC')).toBe('UTC');
  });

  it('builds the CSV file with the person’s today', () => {
    const file = buildExportFile('transactions', data, {
      t: i18n.t,
      timeZone: 'UTC',
      now: new Date('2026-10-06T22:30:00Z'),
    });
    expect(file).toMatchObject({
      name: 'batzen-transactions-2026-10-07.csv',
      mimeType: 'text/csv',
      uti: 'public.comma-separated-values-text',
    });
    expect(file.content).toBe(transactionsCsv(data, { t: i18n.t, timeZone: 'Europe/Zurich' }));
  });

  it('builds the JSON file with everything, pretty-printed', () => {
    const file = buildExportFile('data', data, {
      t: i18n.t,
      timeZone: 'UTC',
      now: new Date('2026-10-07T08:00:00Z'),
    });
    expect(file).toMatchObject({
      name: 'batzen-data-2026-10-07.json',
      mimeType: 'application/json',
      uti: 'public.json',
    });
    expect(JSON.parse(file.content)).toEqual(EXPORT_JSON);
    expect(file.content).toBe(dataJson(data));
    expect(file.content).toContain('\n  "format_version": 1,\n');
  });

  it('names the signed-in account in the JSON file, right after the format fields', () => {
    const account = { userId: 'u-anna', email: 'anna@example.ch' };
    const file = buildExportFile('data', data, {
      t: i18n.t,
      timeZone: 'UTC',
      now: new Date('2026-10-07T08:00:00Z'),
      account,
    });
    const content = JSON.parse(file.content) as Record<string, unknown>;
    expect(content).toEqual({
      ...EXPORT_JSON,
      account: { user_id: 'u-anna', email: 'anna@example.ch' },
    });
    expect(Object.keys(content).slice(0, 4)).toEqual([
      'format_version',
      'exported_at',
      'account',
      'profile',
    ]);
    expect(file.content).toBe(dataJson(data, account));
    // The session's account wins over anything the server might send under that name.
    expect(
      JSON.parse(dataJson({ ...data, account: { user_id: 'other' } }, account)).account,
    ).toEqual({ user_id: 'u-anna', email: 'anna@example.ch' });
    expect(JSON.parse(dataJson(data, { userId: 'u-anna', email: null })).account).toEqual({
      user_id: 'u-anna',
      email: null,
    });
  });

  it('leaves the CSV without account details', () => {
    const file = buildExportFile('transactions', data, {
      t: i18n.t,
      timeZone: 'UTC',
      account: { userId: 'u-anna', email: 'anna@example.ch' },
    });
    expect(file.content).not.toContain('anna@example.ch');
  });
});
