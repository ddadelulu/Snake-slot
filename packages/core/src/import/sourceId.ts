import type { LocalDate } from '../engine/dates';
import { merchantKey } from '../merchant';
import type { Rappen } from '../money';
import type { StatementBank, StatementFormat } from './types';

const MAX_ID = 200;
const MAX_KEY = 100;
/** Room for an occurrence suffix such as ":12". */
const SUFFIX_ROOM = 6;

export type SourceIds = {
  /**
   * Id from the bank's own reference (id column, camt AcctSvcrRef / NtryRef); `content` (the
   * row's date and amount) tells a camt entry listed twice from another booking with that
   * reference.
   */
  forReference(iban: string | null, reference: string, content: string): string;
  /** Id from the row's content when the file has no reference. */
  forContent(iban: string | null, date: LocalDate, amount: Rappen, text: string | null): string;
};

/**
 * Builds the external ids (`sourceId`, ≤ 200 characters) of one file so that importing the same
 * file again, or a later export that overlaps it, yields the same ids and the database answers
 * `already_imported` instead of storing twins.
 *
 * - With a bank reference: `<format>:<scope>:<reference>`, where scope is the account IBAN, else
 *   the bank, else the format (`csv:CH9300000000000000000:9930273TI0000001`). Should a reference
 *   repeat within a CSV file (a booking and its parts can share a number), its second and later
 *   rows get `:2`, `:3`, … so no row is lost. In camt.053 a reference that repeats with the same
 *   date and amount is the same entry listed twice (two `Stmt` blocks for overlapping periods): it
 *   gets the same id again, and the database reports it as already imported; with another date or
 *   amount it is numbered like in a CSV.
 * - Without one: `<format>:<date>:<amountRappen>:<merchantKey(text), ≤ 100>:<occurrence>`, where
 *   occurrence counts identical (date, amount, key) rows in file order: two coffees of CHF 4.50
 *   at the same kiosk on the same day are `…:1` and `…:2` in every export that contains both.
 *   When the file names the account's IBAN it follows the format
 *   (`camt053:CH9300000000000000000:2026-09-30:-500:kontofuhrungsgebuhr:1`), so the same monthly
 *   fee booked on two accounts of the same person stays two transactions.
 */
export function createSourceIds(format: StatementFormat, bank: StatementBank | null): SourceIds {
  const seen = new Map<string, number>();
  const count = (base: string): number => {
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);
    return occurrence;
  };
  /** camt.053 ids by reference and content, for entries listed twice. */
  const given = new Map<string, string>();
  return {
    forReference(iban, reference, content) {
      const prefix = `${format}:${iban ?? bank ?? format}:`;
      const base = prefix + reference.slice(0, MAX_ID - prefix.length - SUFFIX_ROOM);
      const key = `${base}\u0000${content}`;
      const repeated = format === 'camt053' ? given.get(key) : undefined;
      if (repeated !== undefined) return repeated;
      const occurrence = count(base);
      const id = occurrence === 1 ? base : `${base}:${occurrence}`;
      given.set(key, id);
      return id;
    },
    forContent(iban, date, amount, text) {
      const scope = iban === null ? '' : `${iban}:`;
      const base = `${format}:${scope}${date}:${amount}:${merchantKey(text).slice(0, MAX_KEY)}`;
      return `${base}:${count(base)}`;
    },
  };
}
