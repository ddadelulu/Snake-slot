import {
  APP_NAME,
  DEFAULT_CATEGORY_KEYS,
  FIXED_COST_KINDS,
  TRANSACTION_SOURCES,
  formatCsvAmount,
  localDateIn,
  localDateTimeIn,
  toCsv,
  type CsvCell,
  type LocalDate,
} from '@budget/core';
import type { TFunction } from 'i18next';

import { jsonReader } from '@/data/json';
import type { MyDataExport } from '@/data/exportData';
import { categoryName } from '@/features/categories/categoryName';

/**
 * The data export (US-3.5, D-034) as pure functions: the transactions CSV and the JSON file built
 * from `export_my_data`, and their file names. Saving and sharing live in `deliverFile.ts`.
 */

export type ExportKind = 'transactions' | 'data';

export type ExportFile = {
  name: string;
  content: string;
  mimeType: string;
  /** Uniform Type Identifier for the iOS share sheet. */
  uti: string;
};

/** "batzen" from the app name (D-001), safe for a file name. */
function fileSlug(): string {
  return (
    APP_NAME.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'export'
  );
}

/** `batzen-transactions-2026-10-07.csv` / `batzen-data-2026-10-07.json`. */
export function exportFileName(kind: ExportKind, today: LocalDate): string {
  return `${fileSlug()}-${kind}-${today}.${kind === 'transactions' ? 'csv' : 'json'}`;
}

/** The time zone the person's days and times are counted in: the profile's, else `fallback`. */
export function exportTimeZone(data: MyDataExport, fallback: string): string {
  const profile = data.profile;
  if (typeof profile === 'object' && profile !== null && !Array.isArray(profile)) {
    const zone = (profile as Record<string, unknown>).timezone;
    if (typeof zone === 'string' && zone !== '') return zone;
  }
  return fallback;
}

// ---------------------------------------------------------------------------------------------
// Reading the export
// ---------------------------------------------------------------------------------------------

const read = jsonReader('export_my_data');

type ExportTransaction = {
  id: string;
  amountRappen: number;
  bookedAt: string;
  merchant: string | null;
  rawText: string | null;
  note: string | null;
  source: string;
  categoryId: string | null;
  fixedCostId: string | null;
  originalAmountMinor: number | null;
  originalCurrency: string | null;
  /** Deleted or merged into another transaction: not a line of the CSV. */
  hidden: boolean;
};

type ExportSplit = {
  id: string;
  transactionId: string;
  categoryId: string | null;
  amountRappen: number;
  note: string | null;
  createdAt: string;
};

type ExportCategory = {
  defaultKey: (typeof DEFAULT_CATEGORY_KEYS)[number] | null;
  name: string | null;
};

type ExportFixedCost = { kind: (typeof FIXED_COST_KINDS)[number]; label: string | null };

function list(data: MyDataExport, key: string): Record<string, unknown>[] {
  const value = data[key];
  if (value === undefined || value === null) return [];
  return read.array(value, key).map((entry, index) => read.object(entry, `${key}[${index}]`));
}

function transactionsOf(data: MyDataExport): ExportTransaction[] {
  return list(data, 'transactions').map((row, index) => {
    const at = (field: string) => `transactions[${index}].${field}`;
    return {
      id: read.text(row.id, at('id')),
      amountRappen: read.rappen(row.amount_rappen, at('amount_rappen')),
      bookedAt: read.text(row.booked_at, at('booked_at')),
      merchant: read.optionalText(row.merchant, at('merchant')),
      rawText: read.optionalText(row.raw_text, at('raw_text')),
      note: read.optionalText(row.note, at('note')),
      source: read.text(row.source, at('source')),
      categoryId: read.optionalText(row.category_id, at('category_id')),
      fixedCostId: read.optionalText(row.fixed_cost_id, at('fixed_cost_id')),
      originalAmountMinor: read.optionalInteger(row.original_amount_minor, at('original_amount_minor')),
      originalCurrency: read.optionalText(row.original_currency, at('original_currency')),
      hidden:
        read.optionalText(row.deleted_at, at('deleted_at')) !== null ||
        read.optionalText(row.merged_into_id, at('merged_into_id')) !== null,
    };
  });
}

function splitsOf(data: MyDataExport): Map<string, ExportSplit[]> {
  const byTransaction = new Map<string, ExportSplit[]>();
  list(data, 'transaction_splits').forEach((row, index) => {
    const at = (field: string) => `transaction_splits[${index}].${field}`;
    const split: ExportSplit = {
      id: read.text(row.id, at('id')),
      transactionId: read.text(row.transaction_id, at('transaction_id')),
      categoryId: read.optionalText(row.category_id, at('category_id')),
      amountRappen: read.rappen(row.amount_rappen, at('amount_rappen')),
      note: read.optionalText(row.note, at('note')),
      createdAt: read.text(row.created_at, at('created_at')),
    };
    byTransaction.set(split.transactionId, [...(byTransaction.get(split.transactionId) ?? []), split]);
  });
  for (const parts of byTransaction.values()) {
    parts.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }
  return byTransaction;
}

function categoriesOf(data: MyDataExport): Map<string, ExportCategory> {
  return new Map(
    list(data, 'categories').map((row, index) => {
      const at = (field: string) => `categories[${index}].${field}`;
      return [
        read.text(row.id, at('id')),
        {
          defaultKey:
            row.default_key === null || row.default_key === undefined
              ? null
              : read.oneOf(DEFAULT_CATEGORY_KEYS, row.default_key, at('default_key')),
          name: read.optionalText(row.name, at('name')),
        },
      ];
    }),
  );
}

function fixedCostsOf(data: MyDataExport): Map<string, ExportFixedCost> {
  return new Map(
    list(data, 'fixed_costs').map((row, index) => {
      const at = (field: string) => `fixed_costs[${index}].${field}`;
      return [
        read.text(row.id, at('id')),
        {
          kind: read.oneOf(FIXED_COST_KINDS, row.kind, at('kind')),
          label: read.optionalText(row.label, at('label')),
        },
      ];
    }),
  );
}

// ---------------------------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------------------------

/**
 * A foreign amount from its minor units with a dot and the currency's decimals (Intl), built from
 * integers: −2250 EUR → "-22.50", −1800 JPY → "-1800".
 */
export function formatMinorAmount(minor: number, currency: string): string {
  let digits = 2;
  try {
    digits =
      new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2;
  } catch {
    // An unknown code: two decimals, as most currencies have.
  }
  const sign = minor < 0 ? '-' : '';
  const abs = String(Math.abs(minor)).padStart(digits + 1, '0');
  if (digits === 0) return `${sign}${abs}`;
  return `${sign}${abs.slice(0, abs.length - digits)}.${abs.slice(abs.length - digits)}`;
}

/** The CSV column headers in the app language. */
export function csvHeaders(t: TFunction): string[] {
  return [
    t('dataExport.csv.date'),
    t('dataExport.csv.time'),
    t('dataExport.csv.amount'),
    t('dataExport.csv.category'),
    t('dataExport.csv.merchant'),
    t('dataExport.csv.note'),
    t('dataExport.csv.source'),
    t('dataExport.csv.originalAmount'),
    t('dataExport.csv.originalCurrency'),
    t('dataExport.csv.statementText'),
    t('dataExport.csv.transactionId'),
  ];
}

/**
 * The transactions CSV (D-034): one line per transaction that is neither deleted nor merged into
 * another, newest first; a split transaction gets one line per part with the part's amount,
 * category and note. Date and time are local in `timeZone`; amounts are signed CHF with a dot;
 * names (categories, sources) and headers are in the app language. Built with `toCsv`
 * (semicolons, UTF-8 BOM, CRLF, formula characters escaped) so it opens in Swiss Excel.
 */
export function transactionsCsv(
  data: MyDataExport,
  options: { t: TFunction; timeZone: string },
): string {
  const { t, timeZone } = options;
  const categories = categoriesOf(data);
  const fixedCosts = fixedCostsOf(data);
  const splits = splitsOf(data);

  const categoryCell = (categoryId: string | null): string | null => {
    const category = categoryId ? categories.get(categoryId) : undefined;
    return category ? categoryName(category, t) : null;
  };
  const sourceCell = (source: string): string =>
    (TRANSACTION_SOURCES as readonly string[]).includes(source)
      ? t(`dataExport.sources.${source as (typeof TRANSACTION_SOURCES)[number]}`)
      : source;

  const visible = transactionsOf(data)
    .filter((transaction) => !transaction.hidden)
    .sort(
      (a, b) =>
        Date.parse(b.bookedAt) - Date.parse(a.bookedAt) || b.id.localeCompare(a.id),
    );

  const rows: CsvCell[][] = visible.flatMap((transaction) => {
    const { date, time } = localDateTimeIn(transaction.bookedAt, timeZone);
    const original =
      transaction.originalAmountMinor !== null && transaction.originalCurrency !== null
        ? formatMinorAmount(transaction.originalAmountMinor, transaction.originalCurrency)
        : null;
    const line = (amount: number, category: string | null, note: string | null): CsvCell[] => [
      date,
      time,
      formatCsvAmount(amount),
      category,
      transaction.merchant,
      note,
      sourceCell(transaction.source),
      original,
      original === null ? null : transaction.originalCurrency,
      transaction.rawText,
      transaction.id,
    ];

    const parts = splits.get(transaction.id) ?? [];
    if (parts.length > 0) {
      return parts.map((part) =>
        line(part.amountRappen, categoryCell(part.categoryId), part.note ?? transaction.note),
      );
    }
    const fixedCost = transaction.fixedCostId ? fixedCosts.get(transaction.fixedCostId) : undefined;
    const category =
      categoryCell(transaction.categoryId) ??
      (fixedCost
        ? t('dataExport.csv.fixedCost', {
            name: fixedCost.label ?? t(`fixedCostKinds.${fixedCost.kind}`),
          })
        : null);
    return [line(transaction.amountRappen, category, transaction.note)];
  });

  return toCsv(csvHeaders(t), rows);
}

/** Everything stored about the person, pretty-printed. */
export function dataJson(data: MyDataExport): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

/** The file of one export kind, named with the person's today. */
export function buildExportFile(
  kind: ExportKind,
  data: MyDataExport,
  options: { t: TFunction; timeZone: string; now?: Date },
): ExportFile {
  const timeZone = exportTimeZone(data, options.timeZone);
  const name = exportFileName(kind, localDateIn(options.now ?? new Date(), timeZone));
  return kind === 'transactions'
    ? {
        name,
        content: transactionsCsv(data, { t: options.t, timeZone }),
        mimeType: 'text/csv',
        uti: 'public.comma-separated-values-text',
      }
    : { name, content: dataJson(data), mimeType: 'application/json', uti: 'public.json' };
}
