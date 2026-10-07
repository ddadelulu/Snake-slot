import { XMLParser, XMLValidator } from 'fast-xml-parser';

import type { Rappen } from '../money';
import { createCollector, type Collector } from './collect';
import { merchantFromText } from './merchantText';
import type { PartsResult, StatementBank } from './types';
import {
  currencyExponent,
  ibanIn,
  joinTexts,
  parseDecimalMinor,
  parseStatementDate,
  truncate,
  type StatementDate,
} from './values';

type XmlObject = { [key: string]: unknown };

/** Elements that can repeat; always read as arrays so one and many look the same. */
const ARRAY_TAGS = new Set([
  'Stmt',
  'Ntry',
  'NtryDtls',
  'TxDtls',
  'Ustrd',
  'AddtlTxInf',
  'AddtlNtryInf',
]);

/** Servicer BICs of the banks the import names (camt files carry no other bank marker). */
const BANK_BY_BIC: readonly (readonly [string, StatementBank])[] = [
  ['POFICHBE', 'postfinance'],
  ['UBSWCH', 'ubs'],
  ['ZKBKCH', 'zkb'],
  ['RAIFCH', 'raiffeisen'],
];

const MAX_RAW_TEXT = 4000;

/**
 * Reads an ISO 20022 camt.053 bank-to-customer statement (`BkToCstmrStmt`), the file Swiss banks
 * offer since the 2018 harmonisation, in any 001.xx version and with or without namespace
 * prefixes.
 *
 * Security: a file with a DOCTYPE or ENTITY declaration is refused before parsing (no entity
 * expansion, no external entities), and the file must be well-formed; both give `invalid_xml`.
 * Values are read as strings and amounts converted with integer arithmetic.
 *
 * Per statement (`Stmt`): the account IBAN and currency; statements in another currency are
 * skipped (`not_chf`), and a file without any CHF statement is refused (`not_chf`). Per entry
 * (`Ntry`): only booked entries (status BOOK, as text in 001.04 or `Sts/Cd` in 001.08; no status
 * counts as booked), in CHF, signed by CdtDbtInd (DBIT = money out). A batch entry whose
 * transaction details (`TxDtls`) each carry a CHF amount, adding up to the entry, becomes one row
 * per detail; otherwise the entry is one row. The date is the card's acceptance time
 * (`RltdDts/AccptncDtTm`, the moment of purchase), else the booking date, else the value date. The
 * merchant is the creditor of a debit or the debtor of a credit, else taken from the texts. The
 * original amount comes from `AmtDtls/InstdAmt` when it is not CHF.
 */
export function parseCamt053(xml: string): PartsResult {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    return invalidXml('DOCTYPE and ENTITY declarations are not allowed');
  }
  const validation = XMLValidator.validate(xml);
  if (validation !== true) return invalidXml(validation.err.msg);
  let document: unknown;
  try {
    document = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      removeNSPrefix: true,
      parseTagValue: false,
      parseAttributeValue: false,
      processEntities: false,
      ignoreDeclaration: true,
      ignorePiTags: true,
      isArray: (name) => ARRAY_TAGS.has(name),
    }).parse(xml);
  } catch {
    // The parser refuses names such as __proto__ and nesting deeper than 100 levels.
    return invalidXml('The file is not a readable XML document');
  }
  const root = obj(path(document, 'Document', 'BkToCstmrStmt'));
  if (root === undefined) return { ok: false, error: { code: 'unsupported_format' } };

  const statements = list(root.Stmt);
  const chfStatements = statements.filter((statement) => {
    const currency = text(path(statement, 'Acct', 'Ccy'));
    return currency === undefined || currency.toUpperCase() === 'CHF';
  });
  if (statements.length > 0 && chfStatements.length === 0) {
    return { ok: false, error: { code: 'not_chf' } };
  }
  const bank = chfStatements.map(bankOf).find((found) => found !== null) ?? null;
  const collector = createCollector('camt053', bank);

  let entryNumber = 0;
  for (const statement of statements) {
    const isChf = chfStatements.includes(statement);
    const iban = ibanIn(text(path(statement, 'Acct', 'Id', 'IBAN')) ?? '');
    for (const entry of list(statement.Ntry)) {
      entryNumber += 1;
      readEntry(entry, { line: entryNumber, isChf, iban, collector });
    }
  }

  const iban = chfStatements
    .map((statement) => ibanIn(text(path(statement, 'Acct', 'Id', 'IBAN')) ?? ''))
    .find((found) => found !== null);
  return {
    ok: true,
    parts: {
      format: 'camt053',
      bank,
      iban: iban ?? null,
      rows: collector.rows,
      skipped: collector.skipped,
    },
  };
}

type EntryContext = { line: number; isChf: boolean; iban: string | null; collector: Collector };

function readEntry(entry: XmlObject, context: EntryContext): void {
  const { line, collector } = context;
  const entryInfo = texts(entry.AddtlNtryInf);
  const display = [
    ...texts([path(entry, 'BookgDt', 'Dt'), path(entry, 'BookgDt', 'DtTm'), entry.CdtDbtInd]),
    ...texts([entry.Amt, attribute(entry.Amt, 'Ccy')]),
    ...entryInfo,
  ].join('; ');

  const status = text(entry.Sts) ?? text(path(entry, 'Sts', 'Cd'));
  // Amt@Ccy is mandatory; a file that leaves it out is taken to be in the account's currency.
  if (!context.isChf || (attribute(entry.Amt, 'Ccy') ?? 'CHF') !== 'CHF') {
    collector.skip(line, 'not_chf', display);
    return;
  }
  if (status !== undefined && status.toUpperCase() !== 'BOOK') {
    collector.skip(line, 'not_booked', display);
    return;
  }
  const sign = direction(entry.CdtDbtInd);
  const amount = parseDecimalMinor(text(entry.Amt) ?? '', 2);
  if (amount === null || sign === null) {
    collector.skip(line, 'invalid_amount', display);
    return;
  }
  if (amount === 0) {
    collector.skip(line, 'zero_amount', display);
    return;
  }
  const total = sign * amount;

  const details = list(entry.NtryDtls).flatMap((group) => list(group.TxDtls));
  const parts = splitBatch(details, sign, total);
  const entryReference = text(entry.AcctSvcrRef) ?? text(entry.NtryRef);
  if (parts !== null) {
    parts.forEach((part, index) => {
      const own = text(path(part.detail, 'Refs', 'AcctSvcrRef'));
      const reference =
        own ?? (entryReference === undefined ? null : `${entryReference}/${index + 1}`);
      addRow(entry, part.detail, part.rappen, reference, context, display);
    });
    return;
  }
  const detail = details.length === 1 ? details[0] : undefined;
  const reference =
    text(entry.AcctSvcrRef) ?? text(path(detail, 'Refs', 'AcctSvcrRef')) ?? text(entry.NtryRef);
  addRow(entry, detail, total, reference ?? null, context, display);
}

/** The parts of a batch entry, when every part has a CHF amount and together they make the entry. */
function splitBatch(
  details: readonly XmlObject[],
  entrySign: number,
  total: Rappen,
): { detail: XmlObject; rappen: Rappen }[] | null {
  if (details.length < 2) return null;
  const parts: { detail: XmlObject; rappen: Rappen }[] = [];
  let sum = 0;
  for (const detail of details) {
    const node = detail.Amt ?? path(detail, 'AmtDtls', 'TxAmt', 'Amt');
    const amount = parseDecimalMinor(text(node) ?? '', 2);
    if (attribute(node, 'Ccy') !== 'CHF' || !amount) return null;
    const rappen = (direction(detail.CdtDbtInd) ?? entrySign) * amount;
    parts.push({ detail, rappen });
    sum += rappen;
  }
  return sum === total ? parts : null;
}

function addRow(
  entry: XmlObject,
  detail: XmlObject | undefined,
  rappen: Rappen,
  reference: string | null,
  context: EntryContext,
  display: string,
): void {
  const when = firstDate([
    path(detail, 'RltdDts', 'AccptncDtTm'),
    path(entry, 'BookgDt', 'Dt'),
    path(entry, 'BookgDt', 'DtTm'),
    path(entry, 'ValDt', 'Dt'),
    path(entry, 'ValDt', 'DtTm'),
  ]);
  if (when === null) {
    context.collector.skip(context.line, 'invalid_date', display);
    return;
  }
  const entryInfo = texts(entry.AddtlNtryInf);
  const detailInfo = texts(detail?.AddtlTxInf);
  const remittance = texts(obj(detail?.RmtInf)?.Ustrd);
  const merchant =
    partyName(detail, rappen < 0) ??
    [...detailInfo, ...entryInfo, ...remittance].map(merchantFromText).find(Boolean) ??
    null;
  const original = originalAmount(
    path(detail, 'AmtDtls', 'InstdAmt', 'Amt') ?? path(entry, 'AmtDtls', 'InstdAmt', 'Amt'),
    rappen,
  );
  context.collector.add(
    {
      line: context.line,
      amountRappen: rappen,
      when,
      merchant,
      rawText: joinTexts([...entryInfo, ...detailInfo, ...remittance], MAX_RAW_TEXT),
      ...(original === undefined ? {} : { original }),
      reference,
      iban: context.iban,
    },
    display,
  );
}

/** The creditor of a payment out, the debtor of money in (001.04 `Cdtr/Nm`, 001.08 `Cdtr/Pty/Nm`). */
function partyName(detail: XmlObject | undefined, debit: boolean): string | undefined {
  const parties = path(detail, 'RltdPties');
  for (const role of debit ? ['Cdtr', 'UltmtCdtr'] : ['Dbtr', 'UltmtDbtr']) {
    const party = path(parties, role);
    const name = text(path(party, 'Nm')) ?? text(path(party, 'Pty', 'Nm'));
    if (name !== undefined) return truncate(name, 200);
  }
  return undefined;
}

/** The instructed amount in its own currency (minor units by ISO 4217), signed like the CHF one. */
function originalAmount(
  node: unknown,
  rappen: Rappen,
): { amountMinor: number; currency: string } | undefined {
  const currency = attribute(node, 'Ccy') ?? '';
  if (!/^[A-Z]{3}$/.test(currency) || currency === 'CHF') return undefined;
  const minor = parseDecimalMinor(text(node) ?? '', currencyExponent(currency));
  if (!minor) return undefined;
  return { amountMinor: Math.sign(rappen) * Math.abs(minor), currency };
}

function firstDate(nodes: readonly unknown[]): StatementDate | null {
  for (const node of texts(nodes)) {
    const date = parseStatementDate(node);
    if (date !== null) return date;
  }
  return null;
}

function direction(node: unknown): 1 | -1 | null {
  const indicator = text(node);
  if (indicator === 'DBIT') return -1;
  return indicator === 'CRDT' ? 1 : null;
}

function bankOf(statement: XmlObject): StatementBank | null {
  const institution = path(statement, 'Acct', 'Svcr', 'FinInstnId');
  const bic = (
    text(path(institution, 'BICFI')) ??
    text(path(institution, 'BIC')) ??
    ''
  ).toUpperCase();
  const match = BANK_BY_BIC.find(([prefix]) => bic.startsWith(prefix));
  return match === undefined ? null : match[1];
}

function invalidXml(message: string): PartsResult {
  return { ok: false, error: { code: 'invalid_xml', message } };
}

function obj(value: unknown): XmlObject | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as XmlObject)
    : undefined;
}

/** Walks child elements; a repeated element yields its first occurrence. */
function path(node: unknown, ...names: string[]): unknown {
  let current = node;
  for (const name of names) {
    const value = obj(current)?.[name];
    current = Array.isArray(value) ? value[0] : value;
  }
  return current;
}

function list(value: unknown): XmlObject[] {
  const items: unknown[] = Array.isArray(value) ? value : [];
  return items.map(obj).filter((item): item is XmlObject => item !== undefined);
}

/** The text of an element (with or without attributes), entities decoded, whitespace collapsed. */
function text(value: unknown): string | undefined {
  const raw = typeof value === 'string' ? value : obj(value)?.['#text'];
  if (typeof raw !== 'string') return undefined;
  const clean = decodeEntities(raw).replace(/\s+/g, ' ').trim();
  return clean === '' ? undefined : clean;
}

function texts(value: unknown): string[] {
  return (Array.isArray(value) ? value : [value])
    .map(text)
    .filter((item): item is string => item !== undefined);
}

function attribute(value: unknown, name: string): string | undefined {
  const raw = obj(value)?.[`@_${name}`];
  return typeof raw === 'string' ? raw.trim().toUpperCase() : undefined;
}

const ENTITY = /&(?:#x([0-9a-fA-F]{1,6})|#([0-9]{1,7})|(amp|lt|gt|quot|apos));/g;
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** XML's predefined and numeric character references, decoded once ("M&amp;M", "Z&#252;rich"). */
function decodeEntities(raw: string): string {
  return raw.replace(ENTITY, (match, hex?: string, decimal?: string, name?: string) => {
    if (name !== undefined) return NAMED[name] as string;
    const codePoint = hex === undefined ? Number(decimal) : parseInt(hex, 16);
    const valid =
      codePoint > 0 && codePoint <= 0x10ffff && (codePoint < 0xd800 || codePoint > 0xdfff);
    return valid ? String.fromCodePoint(codePoint) : match;
  });
}
