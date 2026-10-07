/**
 * Merchant names as sources print them ("COOP-4567 ZÜRICH", "TWINT *Coop Pronto", "McDonald's",
 * "BAECKEREI HUG") are compared through a key: lower-case ASCII words without accents,
 * apostrophes, numbers or legal forms, with "ae", "oe" and "ue" folded to "a", "o" and "u"
 * ("coop zurich", "twint coop pronto", "mcdonalds", "backerei hug"). A pattern matches a name when
 * the pattern's words appear in the name's key as a contiguous run.
 *
 * The database does the matching (`internal.merchant_key`, used for rules, the known-merchant
 * list, deduplication and search). This is its exact mirror, used where the app needs the same
 * key without the database (statement import ids); supabase/tests/categorization.test.ts compares
 * the two on a corpus of real-world spellings and on seeded pseudo-random text.
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
/** Apostrophes are dropped, so "McDonald's" and "MCDONALDS" share a key. */
const APOSTROPHES = new Set(["'", '’', '´', '`']);

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

/**
 * The comparison key of a merchant name or statement text; '' when nothing identifying is left:
 *   1. apostrophes (' ’ ´ `) dropped, accented letters mapped by LETTER_MAP, then the ligatures;
 *   2. ASCII upper case to lower case (nothing else changes case);
 *   3. every "e" directly after "a", "o" or "u" dropped (Bäckerei/BAECKEREI, Müller/MUELLER);
 *   4. split into words at every run of characters other than a-z and 0-9;
 *   5. words containing a digit and the stopwords dropped, the rest joined by one space.
 */
export function merchantKey(text: string | null | undefined): string {
  if (text === null || text === undefined) return '';
  let plain = '';
  for (const char of text) {
    if (!APOSTROPHES.has(char)) plain += SINGLE_LETTERS.get(char) ?? char;
  }
  for (const [ligature, letters] of LIGATURES) plain = plain.split(ligature).join(letters);
  plain = plain.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  plain = plain.replace(/([aou])e/g, '$1');
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
