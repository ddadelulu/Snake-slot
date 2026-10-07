import type { LocalDate } from '../engine/dates';
import { merchantKey } from '../merchant';
import type { Rappen } from '../money';
import type { StatementBank, StatementFormat } from './types';

const MAX_ID = 200;
const MAX_KEY = 100;
/** Room for an occurrence suffix such as ":12". */
const SUFFIX_ROOM = 6;

export type SourceIds = {
  /** Id from the bank's own reference (id column, camt AcctSvcrRef / NtryRef). */
  forReference(iban: string | null, reference: string): string;
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
 *   repeat within the file (some banks give every part of a batch the entry's reference), its
 *   second and later rows get `:2`, `:3`, … so no row is lost.
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
  return {
    forReference(iban, reference) {
      const prefix = `${format}:${iban ?? bank ?? format}:`;
      const base = prefix + reference.slice(0, MAX_ID - prefix.length - SUFFIX_ROOM);
      const occurrence = count(base);
      return occurrence === 1 ? base : `${base}:${occurrence}`;
    },
    forContent(iban, date, amount, text) {
      const scope = iban === null ? '' : `${iban}:`;
      const base = `${format}:${scope}${date}:${amount}:${merchantKey(text).slice(0, MAX_KEY)}`;
      return `${base}:${count(base)}`;
    },
  };
}
