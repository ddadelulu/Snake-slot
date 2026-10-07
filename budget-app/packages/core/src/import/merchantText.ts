import { truncate } from './values';

const LETTERS = 'A-Za-zÀ-ÖØ-öø-ÿ';
/** Word boundaries that also work for umlauts and accents (`\b` only knows ASCII letters). */
const BEFORE = `(^|[^${LETTERS}0-9])`;
const AFTER = `(?=$|[^${LETTERS}0-9])`;

/** Matches any of the alternatives as whole words; longest first so phrases win over words. */
function words(alternatives: readonly string[]): RegExp {
  const sorted = [...alternatives].sort((a, b) => b.length - a.length);
  return new RegExp(`${BEFORE}(?:${sorted.join('|')})${AFTER}`, 'gi');
}

/** Payment providers that prefix the merchant with a star: "TWINT *Café Muster", "SUMUP *…". */
const PROVIDER_PREFIX = new RegExp(
  `${BEFORE}(?:twint|sumup|sum up|paypal|payrexx|zettle|ztl|sq|stripe)\\s*\\*\\s*`,
  'gi',
);

/** IBANs of the counterparty ("CH93 0000 0000 0000 0000 0"). */
const IBAN = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?\b/g;

/** Swiss QR references (27 digits in groups) and creditor references (RF18 5390 0754 7034). */
const QR_REFERENCE = /\b\d{2}(?: \d{5}){5}\b/g;
const CREDITOR_REFERENCE = /\bRF\d{2}(?: ?[A-Z0-9]{4}){1,6}(?: ?[A-Z0-9]{1,3})?\b/gi;

/** Dates with the preposition in front: "vom 30.09.2026", "du 30.09.26", "2026-09-30". */
const DATES = new RegExp(
  `${BEFORE}(?:(?:vom|am|du|le|del|il|on|dated?|per)\\s+)?` +
    `(?:\\d{1,2}[./]\\d{1,2}[./](?:\\d{4}|\\d{2})|\\d{4}-\\d{2}-\\d{2})${AFTER}`,
  'gi',
);

/** Times: "14:23", "um 14:23:05 Uhr", "à 14h23". */
const TIMES = new RegExp(
  `${BEFORE}(?:(?:um|à|alle|at)\\s+)?\\d{1,2}[:h]\\d{2}(?::\\d{2})?(?:\\s*uhr)?${AFTER}`,
  'gi',
);

const CURRENCIES =
  'CHF|EUR|USD|GBP|JPY|SEK|NOK|DKK|PLN|CZK|HUF|CAD|AUD|NZD|TRY|THB|CNY|HKD|SGD|AED|ZAR|SFr\\.?|Fr\\.';

/** Amounts with a currency: "CHF 23.40", "23.40 CHF", "EUR -25,00", "Fr. 12.–". */
const AMOUNTS = new RegExp(
  `${BEFORE}(?:(?:${CURRENCIES})\\s?[-+−]?\\d[\\d'’.,]*(?:[.,][-–])?|[-+−]?\\d[\\d'’.,]*\\s?(?:${CURRENCIES}))${AFTER}`,
  'gi',
);

/** Exchange rates: "Kurs 1.0632", "Wechselkurs: 0.94", "taux de change 0.95". */
const EXCHANGE_RATES = new RegExp(
  `${BEFORE}(?:wechselkurs|kurs|taux(?:\\s+de\\s+change)?|cambio|exchange\\s+rate|rate)\\s*:?\\s*\\d+(?:[.,]\\d+)?${AFTER}`,
  'gi',
);

/** Reference labels with their value: "Referenz: 123456", "Transaktions-Nr. 9930273TI0000001". */
const REFERENCES = new RegExp(
  `${BEFORE}(?:referenz(?:nummer|nr)?|zahlungsreferenz|ref|reference|r[ée]f[ée]rence|riferimento|` +
    `transaktions-?nr|transaktionsnummer|transaction\\s+(?:no|number|id)|auftrags-?nr|auftragsnummer|` +
    `beleg-?nr|belegnummer|end-?to-?end(?:-?id)?)\\.?\\s*:?\\s*(?=[A-Z0-9/-]*\\d)[A-Z0-9/-]+${AFTER}`,
  'gi',
);

/** Card number labels: "Karten Nr.", "Kartennummer:", "Card no.", "No de carte", "Numero carta". */
const CARD_LABELS = new RegExp(
  `${BEFORE}(?:karten?\\s*-?\\s*(?:nr|nummer)|card\\s*(?:no|nr|number)|n[o°º]\\s*(?:de\\s+)?carte|` +
    `num[ée]ro\\s+de\\s+carte|carte\\s+n[o°º]|numero\\s+(?:di\\s+)?carta|carta\\s+n[r°º]?)\\.?\\s*:?`,
  'gi',
);

const BANKS =
  'zkb|ubs|postfinance|raiffeisen|migros\\s*bank|bank\\s*cler|valiant|bcv|bcge|bkb|lukb|sgkb|blkb|tkb|akb|bekb';

/** Payment boilerplate in German, French, Italian and English. */
const BOILERPLATE = words([
  // Card products, optionally with the issuing bank: "ZKB Visa Debit Karte", "Debit Mastercard".
  `(?:(?:${BANKS})\\s+)?(?:visa|mastercard|maestro|v\\s*pay)(?:\\s+(?:debit|credit|prepaid))?(?:\\s*-?\\s*(?:karte|card|carte|carta))?`,
  'debit\\s+mastercard',
  'debit\\s*direct',
  'postfinance\\s*card',
  'postcard',
  'kauf\\s*/\\s*dienstleistung',
  'achat\\s*/\\s*service',
  'acquisto\\s*/\\s*servizio',
  'purchase\\s*/\\s*service',
  'zugunsten(?:\\s+von)?',
  'en\\s+faveur\\s+de',
  'a\\s+favore\\s+di',
  'in\\s+favou?r\\s+of',
  // German
  'einkauf',
  'kauf',
  'online-?kauf',
  'dienstleistung',
  'bezug',
  'zahlung',
  'zahlungen',
  'kartenzahlung',
  'debit-?karte',
  'kreditkarte',
  'prepaidkarte',
  'karte',
  'lastschrift',
  'lastschriftverfahren',
  'gutschrift',
  'belastung',
  'e-?banking(?:-?auftrag)?',
  'e-?finance',
  'dauerauftrag',
  'sammelauftrag',
  'zahlungsauftrag',
  'auftrag',
  '[üu]e?berweisung',
  'e-?commerce',
  'kontaktlos',
  'twint',
  'qr-?rechnung',
  'qr-?zahlung',
  'e-?rechnung',
  'ebill',
  'lsv\\+?',
  'b?esr',
  'giro',
  'konto',
  'auftraggeber',
  'beg[üu]e?nstigter',
  'empf[äa]e?nger',
  'absender',
  'mitteilung',
  'zahlungszweck',
  'storno',
  'stornierung',
  'r[üu]e?ckbuchung',
  'r[üu]e?ckerstattung',
  // French
  'achat',
  'paiement',
  'carte\\s+de\\s+(?:d[ée]bit|cr[ée]dit)',
  'carte',
  'd[ée]bit',
  'cr[ée]dit',
  'ordre\\s+permanent',
  'ordre\\s+e-?banking',
  'ordre',
  'virement',
  'sans\\s+contact',
  'b[ée]n[ée]ficiaire',
  "donneur\\s+d['’]ordre",
  'extourne',
  'remboursement',
  // Italian
  'acquisto',
  'pagamento',
  'carta\\s+di\\s+(?:debito|credito)',
  'carta',
  'addebito',
  'accredito',
  'ordine\\s+permanente',
  'ordine',
  'bonifico',
  'senza\\s+contatto',
  'beneficiario',
  'ordinante',
  'rimborso',
  // English
  'purchase',
  'card\\s+payment',
  'payment',
  '(?:debit|credit)\\s+card',
  'card',
  'standing\\s+order',
  'transfer',
  'contactless',
  'reversal',
  'refund',
  'eft\\s*/?\\s*pos',
  'pos',
  // Leftover labels
  'nr\\.?',
  'n[°º]',
]);

/** Prepositions that are left dangling at either end once the boilerplate is gone. */
const CONNECTORS = new Set([
  'vom',
  'von',
  'am',
  'an',
  'aus',
  'bei',
  'im',
  'in',
  'für',
  'fuer',
  'du',
  'de',
  'des',
  'à',
  'a',
  'au',
  'chez',
  'par',
  'pour',
  'del',
  'da',
  'di',
  'presso',
  'per',
  'from',
  'to',
  'at',
  'on',
  'for',
  'via',
  'mit',
  'with',
]);

const MASK = /^\d*[xX*•]{2,}[\dxX*•]*$/;
const AMOUNT_TOKEN = /^[-+−]?\d[\d'’]*[.,]\d{2}$/;
const TOKEN_EDGES = /^[([{"']+|[)\]}"',;:.]+$/g;
const LETTER = new RegExp(`[${LETTERS}]`, 'g');

/**
 * Turns a bank statement text into a merchant name: "KAUF/DIENSTLEISTUNG VOM 30.09.2026 KARTEN
 * NR. XXXX1234 COOP-4567 ZUERICH" → "COOP-4567 ZUERICH", "Einkauf ZKB Visa Debit Karte Nr.
 * xxxx1234, Coop-4567 Zürich" → "Coop-4567 Zürich", "TWINT *Café Muster" → "Café Muster".
 *
 * Removes the payment boilerplate Swiss banks print in German, French, Italian and English (Kauf,
 * Einkauf, Zahlung, Debitkarte, Maestro, Visa Debit, Lastschrift, Gutschrift, Achat, Paiement,
 * Acquisto, TWINT, e-banking, Dauerauftrag, …), masked card numbers, IBANs, QR and creditor
 * references, reference numbers, dates, times, amounts with a currency and exchange rates, then
 * prepositions left at either end ("vom", "von", "du", …). The merchant and place stay as printed
 * (branch numbers such as "Coop-4567" and postcodes such as "8001" are kept; nothing is
 * re-cased). Returns at most 200 characters, or null when nothing meaningful is left (e.g.
 * "Zahlung Debitkarte").
 */
export function merchantFromText(text: string | null | undefined): string | null {
  if (text === null || text === undefined) return null;
  let out = ` ${text.replace(/\s+/g, ' ')} `;
  out = out.replace(PROVIDER_PREFIX, '$1 ');
  out = out.replace(IBAN, ' ');
  out = out.replace(QR_REFERENCE, ' ').replace(CREDITOR_REFERENCE, ' ');
  out = out.replace(REFERENCES, '$1 ');
  out = out.replace(DATES, '$1 ').replace(TIMES, '$1 ');
  out = out.replace(AMOUNTS, '$1 ').replace(EXCHANGE_RATES, '$1 ');
  out = out.replace(CARD_LABELS, '$1 ');
  out = dropNumberTokens(out);
  out = out.replace(BOILERPLATE, '$1 ');
  out = tidy(dropConnectors(tidy(out)));
  const letters = out.match(LETTER) ?? [];
  return letters.length < 2 ? null : truncate(out, 200);
}

/**
 * Drops masked card numbers ("XXXX1234", "4123 45XX XXXX 1234", "xxxx 1234"), long numbers
 * (references, account and phone numbers: five digits or more) and bare amounts ("23.40").
 */
function dropNumberTokens(text: string): string {
  const tokens = text.split(' ');
  // Padded with an empty core at both ends, so every token has a neighbour on each side.
  const cores = ['', ...tokens.map((token) => token.replace(TOKEN_EDGES, '')), ''];
  const isMask = (core: string) => MASK.test(core) && (/\d/.test(core) || /[xX*•]{4}/.test(core));
  return tokens
    .filter((_, index) => {
      const [before, core, after] = cores.slice(index, index + 3) as [string, string, string];
      if (isMask(core) || core.replace(/\D/g, '').length >= 5 || AMOUNT_TOKEN.test(core)) {
        return false;
      }
      if (!/^\d{2,6}$/.test(core)) return true;
      // "xxxx 1234": digits after a mask that ends in x; "4123 45XX": digits before one.
      return !(isMask(before) && /[xX*•]$/.test(before)) && !(isMask(after) && /^\d/.test(after));
    })
    .join(' ');
}

/** Drops dangling prepositions; at the end only longer ones ("Exempla A" keeps its "A"). */
function dropConnectors(text: string): string {
  const parts = text.split(' ');
  const isConnector = (word: string | undefined, minLength: number) =>
    word !== undefined && word.length >= minLength && CONNECTORS.has(word.toLowerCase());
  while (isConnector(parts[0], 1)) parts.shift();
  while (isConnector(parts[parts.length - 1], 2)) parts.pop();
  return parts.join(' ');
}

/** Collapses spaces and the separators left behind by removals ("Coop , , Zürich /"). */
function tidy(text: string): string {
  return text
    .replace(/\(\s*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,;:])/g, '$1')
    .replace(/([,;:/|*+])(?:\s*[,;:/|*+-])+/g, '$1')
    .replace(/^[\s,;:./|*+–-]+|[\s,;:/|*+–-]+$/g, '');
}
