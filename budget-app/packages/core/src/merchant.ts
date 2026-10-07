/**
 * Merchant names as sources print them ("COOP-4567 ZÜRICH", "TWINT *Coop Pronto", "Coop") are
 * compared through a key: lower-case ASCII words without accents, numbers or legal forms
 * ("coop zurich", "twint coop pronto", "coop"). A pattern matches a name when the pattern's
 * words appear in the name's key as a contiguous run.
 *
 * The database does the matching (`private.merchant_key`, used for rules, the known-merchant list
 * and deduplication). This is its exact mirror, used by the app to propose rule patterns;
 * supabase/tests/categorization.test.ts compares the two on a corpus of real-world spellings.
 */

/** Accented letters and ligatures, mapped explicitly so both implementations agree byte for byte. */
const LETTER_MAP: ReadonlyArray<readonly [string, string]> = [
  ['ÀÁÂÃÄÅàáâãäå', 'a'],
  ['ÇçĆćČč', 'c'],
  ['ÈÉÊËèéêë', 'e'],
  ['ÌÍÎÏìíîï', 'i'],
  ['Ññ', 'n'],
  ['ÒÓÔÕÖØòóôõöø', 'o'],
  ['ÙÚÛÜùúûü', 'u'],
  ['ÝýÿŸ', 'y'],
  ['ŠšŞş', 's'],
  ['ŽžŹźŻż', 'z'],
];
const LIGATURES: ReadonlyArray<readonly [string, string]> = [
  ['ß', 'ss'],
  ['Æ', 'ae'],
  ['æ', 'ae'],
  ['Œ', 'oe'],
  ['œ', 'oe'],
];

const SINGLE_LETTERS = new Map<string, string>();
for (const [letters, plain] of LETTER_MAP) {
  for (const letter of letters) SINGLE_LETTERS.set(letter, plain);
}

/** Legal forms and web noise: never part of what identifies a merchant. */
export const MERCHANT_STOPWORDS: readonly string[] = [
  'ag',
  'gmbh',
  'sa',
  'sarl',
  'sagl',
  'ltd',
  'llc',
  'inc',
  'kg',
  'co',
  'cie',
  'www',
  'com',
  'ch',
];
const STOPWORDS = new Set(MERCHANT_STOPWORDS);

/** The comparison key of a merchant name or statement text; '' when nothing identifying is left. */
export function merchantKey(text: string | null | undefined): string {
  if (text === null || text === undefined) return '';
  let plain = '';
  for (const char of text) plain += SINGLE_LETTERS.get(char) ?? char;
  for (const [ligature, letters] of LIGATURES) plain = plain.split(ligature).join(letters);
  plain = plain.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  return plain
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== '' && !/[0-9]/.test(word) && !STOPWORDS.has(word))
    .join(' ');
}

/** True when the pattern's key appears in the text's key as a run of whole words. */
export function keyContains(textKey: string, patternKey: string): boolean {
  if (patternKey === '' || textKey === '') return false;
  return ` ${textKey} `.includes(` ${patternKey} `);
}

/**
 * Words that say how someone paid, not where: a rule "always do this for twint" would catch
 * every Twint payment, so rule suggestions skip them.
 */
export const PAYMENT_WORDS: readonly string[] = [
  'twint',
  'sumup',
  'payrexx',
  'paypal',
  'stripe',
  'kauf',
  'einkauf',
  'dienstleistung',
  'zahlung',
  'karte',
  'karten',
  'card',
  'purchase',
  'debit',
  'pos',
  'maestro',
  'visa',
  'mastercard',
  'apple',
  'google',
  'pay',
  'achat',
  'paiement',
  'carte',
  'acquisto',
  'pagamento',
];
const PAYMENT = new Set(PAYMENT_WORDS);

/**
 * The pattern proposed for "Always do this for …?": the merchant's first identifying word, or its
 * first two words when the first is shorter than three letters ("mc donalds"). Null when the name
 * has nothing to build a rule from.
 */
export function suggestRulePattern(merchant: string | null | undefined): string | null {
  const words = merchantKey(merchant)
    .split(' ')
    .filter((word) => word !== '' && !PAYMENT.has(word));
  const [first, second] = words;
  if (first === undefined) return null;
  if (first.length >= 3 || second === undefined) return first;
  return `${first} ${second}`;
}
