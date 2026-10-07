import { merchantKey } from '../../merchant';

/**
 * The id `createSourceIds` gives a row without a bank reference (`<scope>:<date>:<amount>:<key>:<n>`),
 * with the key computed by `merchantKey`, so these tests follow changes to the key (the key itself
 * is tested in merchant.test.ts). `scope` is the format, plus the IBAN when the file names one.
 */
export function contentId(
  scope: string,
  date: string,
  amountRappen: number,
  text: string | null,
  occurrence = 1,
): string {
  return `${scope}:${date}:${amountRappen}:${merchantKey(text).slice(0, 100)}:${occurrence}`;
}
