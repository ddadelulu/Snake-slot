import { MAX_IMPORT_FILE_BYTES, MAX_ROWS_PER_IMPORT } from '../constants';
import { compareLocalDates, type LocalDate } from '../engine/dates';
import { parseCamt053 } from './camt053';
import { decodeText } from './decode';
import { parseStatementCsv } from './statementCsv';
import type { PartsResult, StatementOptions, StatementParseResult, StatementParts } from './types';

export { decodeText, type DecodedText, type TextEncodingName } from './decode';
export {
  detectCsvDelimiter,
  parseCsv,
  type CsvDelimiter,
  type CsvRecord,
  type CsvTable,
} from './csv';
export { merchantFromText } from './merchantText';
export type {
  ColumnMapping,
  ParsedStatement,
  SkippedRow,
  SkipReason,
  StatementBank,
  StatementError,
  StatementFormat,
  StatementOptions,
  StatementParseResult,
  StatementRow,
} from './types';

/**
 * Reads a statement file the person picked (D-032: the file never leaves the phone; only the rows
 * they confirm are sent with `toIngestRow` and `add_transactions`). Refuses files over
 * `MAX_IMPORT_FILE_BYTES` (5 MB) before reading them, decodes the bytes (`decodeText`: UTF-8,
 * UTF-16 or Windows-1252) and hands the text to `parseStatementText`. PDF, Excel and other binary
 * files are `unsupported_format`.
 */
export function readStatement(
  bytes: Uint8Array,
  options: StatementOptions = {},
): StatementParseResult {
  if (bytes.length === 0) return { ok: false, error: { code: 'empty' } };
  if (bytes.length > MAX_IMPORT_FILE_BYTES) {
    return { ok: false, error: { code: 'too_large', maxBytes: MAX_IMPORT_FILE_BYTES } };
  }
  return parseStatementText(decodeText(bytes).text, options);
}

/**
 * Parses statement text: camt.053 XML when it starts with `<` and holds a `BkToCstmrStmt` (other
 * XML such as camt.052/054 is `unsupported_format`), otherwise a bank CSV export. Every returned
 * row is a validated `SourceTransaction` with source `statement_import`, CHF, `mcc` null and a
 * stable `sourceId`; lines that are not imported are listed in `skipped` with their reason. Fails
 * with `no_transactions` when nothing is importable (`not_chf` when every line was in another
 * currency) and with `too_many_rows` above `MAX_ROWS_PER_IMPORT` (2000, one `add_transactions`
 * call): the person then exports a shorter period. Text longer than `MAX_IMPORT_FILE_BYTES`
 * characters is `too_large`; a leading BOM is ignored.
 */
export function parseStatementText(
  text: string,
  options: StatementOptions = {},
): StatementParseResult {
  const content = text.replace(/^\uFEFF/, '');
  if (content.trim() === '') return { ok: false, error: { code: 'empty' } };
  if (content.length > MAX_IMPORT_FILE_BYTES) {
    return { ok: false, error: { code: 'too_large', maxBytes: MAX_IMPORT_FILE_BYTES } };
  }
  // PDF statements and Excel (zip) files: the person needs the CSV or camt export instead.
  if (content.startsWith('%PDF') || content.includes('\u0000')) {
    return { ok: false, error: { code: 'unsupported_format' } };
  }
  const start = content.trimStart();
  let result: PartsResult;
  if (start.startsWith('<')) {
    if (!start.includes('BkToCstmrStmt')) {
      return { ok: false, error: { code: 'unsupported_format' } };
    }
    result = parseCamt053(start);
  } else {
    result = parseStatementCsv(content, options);
  }
  return result.ok ? finishStatement(result.parts) : result;
}

function finishStatement(parts: StatementParts): StatementParseResult {
  const { rows, skipped } = parts;
  if (rows.length === 0) {
    if (skipped.length > 0 && skipped.every((row) => row.reason === 'not_chf')) {
      return { ok: false, error: { code: 'not_chf' } };
    }
    return { ok: false, error: { code: 'no_transactions', skipped } };
  }
  if (rows.length > MAX_ROWS_PER_IMPORT) {
    return {
      ok: false,
      error: { code: 'too_many_rows', count: rows.length, max: MAX_ROWS_PER_IMPORT },
    };
  }
  let from: LocalDate | null = null;
  let to: LocalDate | null = null;
  for (const { transaction } of rows) {
    const day = transaction.bookedOn ?? (transaction.bookedAt as string).slice(0, 10);
    if (from === null || compareLocalDates(day, from) < 0) from = day;
    if (to === null || compareLocalDates(day, to) > 0) to = day;
  }
  return {
    ok: true,
    statement: {
      format: parts.format,
      bank: parts.bank,
      account: { iban: parts.iban },
      rows,
      skipped,
      from,
      to,
    },
  };
}
