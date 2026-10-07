/**
 * Turns the bytes of a statement file into text without Node or DOM APIs (no Buffer, no
 * TextDecoder: Hermes on React Native has neither), so the same code runs on the phone and in
 * tests.
 */

export type TextEncodingName = 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252';

export type DecodedText = { text: string; encoding: TextEncodingName };

const REPLACEMENT = 0xfffd;
const CHUNK = 8192;

/** Windows-1252 bytes 0x80-0x9F (the WHATWG table: unassigned bytes map to the C1 controls). */
const WINDOWS_1252_HIGH: readonly number[] = [
  0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039,
  0x0152, 0x008d, 0x017d, 0x008f, 0x0090, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x009d, 0x017e, 0x0178,
];

/**
 * Decodes a statement file. Swiss banks export in three encodings: UTF-8 (often with a BOM, so
 * Excel opens it correctly), UTF-16 ("Unicode text" from Excel, always with a BOM) and
 * Windows-1252 (older e-banking exports such as PostFinance's, where "Zürich" is the single byte
 * 0xFC). The BOM decides when there is one, and is removed. Without a BOM the bytes are decoded as
 * strict UTF-8 (overlong forms, surrogates, truncated sequences and code points above U+10FFFF
 * are rejected); anything that is not valid UTF-8 is read as Windows-1252, which maps every byte
 * (including 0x80-0x9F, e.g. 0x80 = "€", 0x96 = "–").
 */
export function decodeText(bytes: Uint8Array): DecodedText {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: decodeUtf8(bytes, 3, false) as string, encoding: 'utf-8' };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: decodeUtf16(bytes, true), encoding: 'utf-16le' };
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: decodeUtf16(bytes, false), encoding: 'utf-16be' };
  }
  const utf8 = decodeUtf8(bytes, 0, true);
  if (utf8 !== null) return { text: utf8, encoding: 'utf-8' };
  return { text: decodeWindows1252(bytes), encoding: 'windows-1252' };
}

/**
 * UTF-8 as specified by WHATWG: with `fatal` the first malformed sequence returns null, otherwise
 * each maximal malformed subpart becomes U+FFFD.
 */
function decodeUtf8(bytes: Uint8Array, start: number, fatal: boolean): string | null {
  const units: number[] = [];
  let i = start;
  while (i < bytes.length) {
    const lead = bytes[i] as number;
    if (lead < 0x80) {
      units.push(lead);
      i += 1;
      continue;
    }
    let needed: number;
    let codePoint: number;
    let lower = 0x80;
    let upper = 0xbf;
    if (lead >= 0xc2 && lead <= 0xdf) {
      needed = 1;
      codePoint = lead & 0x1f;
    } else if (lead >= 0xe0 && lead <= 0xef) {
      needed = 2;
      codePoint = lead & 0x0f;
      if (lead === 0xe0) lower = 0xa0; // overlong
      if (lead === 0xed) upper = 0x9f; // UTF-16 surrogates
    } else if (lead >= 0xf0 && lead <= 0xf4) {
      needed = 3;
      codePoint = lead & 0x07;
      if (lead === 0xf0) lower = 0x90; // overlong
      if (lead === 0xf4) upper = 0x8f; // above U+10FFFF
    } else {
      if (fatal) return null;
      units.push(REPLACEMENT);
      i += 1;
      continue;
    }
    let seen = 1;
    while (seen <= needed) {
      const next = bytes[i + seen];
      if (next === undefined || next < lower || next > upper) break;
      codePoint = (codePoint << 6) | (next & 0x3f);
      lower = 0x80;
      upper = 0xbf;
      seen += 1;
    }
    if (seen <= needed) {
      if (fatal) return null;
      units.push(REPLACEMENT);
      i += seen; // the offending byte starts the next sequence
      continue;
    }
    pushCodePoint(units, codePoint);
    i += seen;
  }
  return unitsToString(units);
}

function decodeUtf16(bytes: Uint8Array, littleEndian: boolean): string {
  const units: number[] = [];
  const unitAt = (index: number): number | undefined => {
    const second = bytes[index + 1];
    if (second === undefined) return undefined;
    const first = bytes[index] as number;
    return littleEndian ? first | (second << 8) : (first << 8) | second;
  };
  let i = 2;
  while (i < bytes.length) {
    const unit = unitAt(i);
    if (unit === undefined) {
      units.push(REPLACEMENT); // odd trailing byte
      break;
    }
    i += 2;
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const low = unitAt(i);
      if (low !== undefined && low >= 0xdc00 && low <= 0xdfff) {
        units.push(unit, low);
        i += 2;
      } else {
        units.push(REPLACEMENT);
      }
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      units.push(REPLACEMENT);
    } else {
      units.push(unit);
    }
  }
  return unitsToString(units);
}

function decodeWindows1252(bytes: Uint8Array): string {
  const units: number[] = [];
  for (const byte of bytes) {
    units.push(byte >= 0x80 && byte < 0xa0 ? (WINDOWS_1252_HIGH[byte - 0x80] as number) : byte);
  }
  return unitsToString(units);
}

function pushCodePoint(units: number[], codePoint: number): void {
  if (codePoint < 0x10000) {
    units.push(codePoint);
  } else {
    const offset = codePoint - 0x10000;
    units.push(0xd800 + (offset >> 10), 0xdc00 + (offset & 0x3ff));
  }
}

function unitsToString(units: number[]): string {
  let text = '';
  for (let i = 0; i < units.length; i += CHUNK) {
    text += String.fromCharCode(...units.slice(i, i + CHUNK));
  }
  return text;
}
