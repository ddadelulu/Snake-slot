import { formatLocalDate, type LocalDate } from '../engine/dates';
import { RAPPEN_PER_FRANC, assertRappen, floorDiv, type Rappen } from '../money';

export type CsvCell = string | number | null;

const BOM = '\uFEFF';
const DELIMITER = ';';
const LINE_END = '\r\n';
/** A plain decimal number ("-23.40", "1234"): Excel reads it as a number, never as a formula. */
const PLAIN_NUMBER = /^-?\d+(?:\.\d+)?$/;
const FORMULA_START = /^[=+\-@\t\r]/;
/**
 * A formula character right after a comma, tab or line break inside a text: Excel with a comma
 * list separator (English regional settings) would start a new cell there.
 */
const FORMULA_AFTER_SEPARATOR = /([,\t\r\n])([=+\-@])/g;
const NEEDS_QUOTES = /[;"\r\n]|^\s|\s$/;

/**
 * Builds the transactions CSV of the data export (D-034) so that it opens correctly in Swiss
 * Excel by double-click: UTF-8 with a BOM (umlauts survive), `;` as delimiter (Excel's list
 * separator in de-CH), CRLF line ends. Fields with `;`, quotes, line breaks or leading/trailing
 * spaces are quoted, quotes doubled. Against CSV formula injection (a merchant named
 * `=HYPERLINK(…)`), text cells starting with `=`, `+`, `-`, `@`, tab or CR get a leading
 * apostrophe, which Excel shows as text, and so does such a character after a comma, tab or line
 * break inside a text (where Excel with a comma list separator would start a new cell); numbers,
 * and strings that are plain decimal numbers such as `formatCsvAmount` returns, are written as
 * they are. `null` is an empty cell.
 */
export function toCsv(headers: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  return (
    BOM + [headers, ...rows].map((row) => row.map(csvField).join(DELIMITER) + LINE_END).join('')
  );
}

function csvField(cell: CsvCell): string {
  if (cell === null) return '';
  if (typeof cell === 'number') {
    if (!Number.isFinite(cell)) throw new RangeError('CSV numbers must be finite');
    return String(cell);
  }
  if (PLAIN_NUMBER.test(cell)) return cell;
  const inner = cell.replace(FORMULA_AFTER_SEPARATOR, "$1'$2");
  const text = FORMULA_START.test(inner) ? `'${inner}` : inner;
  return NEEDS_QUOTES.test(text) ? `"${text.split('"').join('""')}"` : text;
}

/**
 * Formats Rappen for a CSV amount column with integer arithmetic: `-2340` → "-23.40",
 * `123400` → "1234.00". No thousands separator and a dot as decimal mark, which Swiss Excel and
 * every other tool read as a number.
 */
export function formatCsvAmount(rappen: Rappen): string {
  const value = assertRappen(rappen);
  const abs = Math.abs(value);
  const francs = floorDiv(abs, RAPPEN_PER_FRANC);
  const cents = abs - francs * RAPPEN_PER_FRANC;
  return `${value < 0 ? '-' : ''}${francs}.${String(cents).padStart(2, '0')}`;
}

/**
 * The local calendar day and wall-clock time (HH:MM, 24 h) of an instant in a time zone, e.g. a
 * transaction's `booked_at` in Europe/Zurich for the export's date and time columns (summer
 * time included). Accepts a Date or an ISO 8601 string; throws for an invalid instant.
 */
export function localDateTimeIn(
  instant: string | Date,
  timeZone: string,
): { date: LocalDate; time: string } {
  const moment = typeof instant === 'string' ? new Date(instant) : instant;
  if (Number.isNaN(moment.getTime())) throw new RangeError('instant is not a valid date');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(moment);
  const part = (type: 'year' | 'month' | 'day' | 'hour' | 'minute') =>
    parts.find((candidate) => candidate.type === type)?.value as string;
  return {
    date: formatLocalDate({
      year: Number(part('year')),
      month: Number(part('month')),
      day: Number(part('day')),
    }),
    time: `${part('hour')}:${part('minute')}`,
  };
}
