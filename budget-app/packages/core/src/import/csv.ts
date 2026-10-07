/** Field delimiters seen in bank exports: Swiss banks use ";", Revolut ",", some tools tab or "|". */
export type CsvDelimiter = ';' | ',' | '\t' | '|';

/** One record; `line` is the 1-based line of the file where it starts (quoted fields can span lines). */
export type CsvRecord = { line: number; fields: string[] };

export type CsvTable = { delimiter: CsvDelimiter; records: CsvRecord[] };

const DELIMITERS: readonly CsvDelimiter[] = [';', ',', '\t', '|'];
const SEP_HINT = /^"?sep=(.)"?[ \t]*(\r\n|\r|\n|$)/i;
const DETECTION_CHARS = 65536;
const DETECTION_RECORDS = 50;

/**
 * Reads CSV in the RFC 4180 style that bank exports use: fields in double quotes may contain the
 * delimiter, line breaks and doubled quotes (`"Coop ""Pronto"""`); line breaks may be CRLF, LF or
 * CR; blank lines (including trailing ones) are dropped. Being lenient where exports are sloppy:
 * text after a closing quote is kept (`"12.50"CHF`), a quote inside an unquoted field is literal
 * (`5" Bildschirm`) and an opening quote that is never closed is taken literally. An Excel
 * `sep=;` first line sets the delimiter; otherwise it is detected (see `detectCsvDelimiter`).
 * Fields are returned untrimmed.
 */
export function parseCsv(text: string, delimiter?: CsvDelimiter): CsvTable {
  let body = text;
  let firstLine = 1;
  let chosen = delimiter;
  const hint = SEP_HINT.exec(text);
  if (hint !== null && isDelimiter(hint[1] as string)) {
    chosen ??= hint[1] as CsvDelimiter;
    body = text.slice(hint[0].length);
    firstLine = 2;
  }
  chosen ??= detectCsvDelimiter(body);
  return { delimiter: chosen, records: tokenize(body, chosen, firstLine, Infinity) };
}

/**
 * Picks the delimiter that splits the first lines into the most consistent table: for each
 * candidate, the most common field count (of lines with at least two fields) times how many lines
 * have it. Bank metadata lines at the top ("Konto:;CH93…") and commas inside Swiss texts
 * ("Coop, Zürich") do not mislead it. Ties go to ";" (the Swiss default), then ",", tab, "|".
 */
export function detectCsvDelimiter(text: string): CsvDelimiter {
  const sample = text.slice(0, DETECTION_CHARS);
  let best: CsvDelimiter = ';';
  let bestScore = 0;
  for (const candidate of DELIMITERS) {
    const frequency = new Map<number, number>();
    for (const record of tokenize(sample, candidate, 1, DETECTION_RECORDS)) {
      const count = record.fields.length;
      if (count >= 2) frequency.set(count, (frequency.get(count) ?? 0) + 1);
    }
    let score = 0;
    for (const [count, times] of frequency) score = Math.max(score, count * times);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

function isDelimiter(char: string): char is CsvDelimiter {
  return (DELIMITERS as readonly string[]).includes(char);
}

function tokenize(
  text: string,
  delimiter: CsvDelimiter,
  firstLine: number,
  maxRecords: number,
): CsvRecord[] {
  const plain = new RegExp(`[^${delimiter === '\t' ? '\\t' : `\\${delimiter}`}\\r\\n]*`, 'y');
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = '';
  let atFieldStart = true;
  let line = firstLine;
  let recordLine = firstLine;
  let i = 0;

  const endRecord = () => {
    fields.push(field);
    if (fields.length > 1 || field !== '') records.push({ line: recordLine, fields });
    fields = [];
    field = '';
    atFieldStart = true;
  };

  while (i < text.length && records.length < maxRecords) {
    const char = text[i];
    if (atFieldStart && char === '"') {
      const close = closingQuote(text, i + 1);
      atFieldStart = false;
      if (close === -1) {
        field += '"';
        i += 1;
      } else {
        const quoted = text.slice(i + 1, close);
        field += quoted.split('""').join('"');
        line += lineBreaks(quoted);
        i = close + 1;
      }
    } else if (char === delimiter) {
      fields.push(field);
      field = '';
      atFieldStart = true;
      i += 1;
    } else if (char === '\r' || char === '\n') {
      endRecord();
      i += char === '\r' && text[i + 1] === '\n' ? 2 : 1;
      line += 1;
      recordLine = line;
    } else {
      plain.lastIndex = i;
      const run = (plain.exec(text) as RegExpExecArray)[0];
      field += run;
      atFieldStart = false;
      i += run.length;
    }
  }
  if (records.length < maxRecords && !(atFieldStart && fields.length === 0 && field === '')) {
    endRecord();
  }
  return records;
}

/** Index of the quote that closes a quoted field (skipping doubled quotes), or -1. */
function closingQuote(text: string, from: number): number {
  let index = text.indexOf('"', from);
  while (index !== -1 && text[index + 1] === '"') index = text.indexOf('"', index + 2);
  return index;
}

function lineBreaks(text: string): number {
  return (text.match(/\r\n|\r|\n/g) ?? []).length;
}
