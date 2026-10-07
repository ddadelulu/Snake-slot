/**
 * Turns the bytes of a statement file into text without Node or DOM APIs (no Buffer, no
 * TextDecoder: Hermes on React Native has neither), so the same code runs on the phone and in
 * tests.
 */

export type TextEncodingName = 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252';

export type DecodedText = { text: string; encoding: TextEncodingName };

const REPLACEMENT = 0xfffd;
const CHUNK = 8192;
/** Stray bytes a UTF-8 file may have and still be read as UTF-8: 1 % of its bytes. */
const MAX_STRAY_PERCENT = 1;
/** Code units looked at to recognise UTF-16 without a BOM. */
const UTF16_SNIFF_UNITS = 512;

/** Windows-1252 bytes 0x80-0x9F (the WHATWG table: unassigned bytes map to the C1 controls). */
const WINDOWS_1252_HIGH: readonly number[] = [
  0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039,
  0x0152, 0x008d, 0x017d, 0x008f, 0x0090, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x009d, 0x017e, 0x0178,
];

/**
 * Decodes a statement file. Swiss banks export in three encodings: UTF-8 (often with a BOM, so
 * Excel opens it correctly), UTF-16 ("Unicode text" from Excel) and Windows-1252 (older e-banking
 * exports such as PostFinance's, where "Zürich" is the single byte 0xFC). The BOM decides when
 * there is one, and is removed. Without a BOM:
 *
 * - UTF-16 is recognised by its zero bytes: ASCII text in UTF-16 has a zero in every other byte
 *   (the second of each pair in little endian, the first in big endian).
 * - Otherwise the bytes are decoded as UTF-8 (overlong forms, surrogates, truncated sequences and
 *   code points above U+10FFFF are malformed). A file that is valid UTF-8, or valid UTF-8 apart
 *   from a few stray bytes (at most 1 % of its bytes, with at least one valid multi-byte character
 *   such as "ü" elsewhere: a line pasted in from a Windows-1252 file), is UTF-8, each stray byte
 *   becoming U+FFFD.
 * - Anything else is read as Windows-1252, which maps every byte (including 0x80-0x9F, e.g.
 *   0x80 = "€", 0x96 = "–").
 */
export function decodeText(bytes: Uint8Array): DecodedText {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: (decodeUtf8(bytes, 3, Infinity) as Utf8Result).text, encoding: 'utf-8' };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: decodeUtf16(bytes, true, 2), encoding: 'utf-16le' };
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: decodeUtf16(bytes, false, 2), encoding: 'utf-16be' };
  }
  const utf16 = utf16ByZeros(bytes);
  if (utf16 !== null) {
    const littleEndian = utf16 === 'utf-16le';
    return { text: decodeUtf16(bytes, littleEndian, 0), encoding: utf16 };
  }
  const maxStray = Math.floor((bytes.length * MAX_STRAY_PERCENT) / 100);
  const utf8 = decodeUtf8(bytes, 0, maxStray);
  if (utf8 !== null && (utf8.strayBytes === 0 || utf8.multiByte > 0)) {
    return { text: utf8.text, encoding: 'utf-8' };
  }
  return { text: decodeWindows1252(bytes), encoding: 'windows-1252' };
}

/**
 * UTF-16 without a BOM, told by where the zero bytes are among the first code units: in at least
 * half of the units on one side and in at most 1 in 20 on the other. Null for anything else
 * (UTF-8 and Windows-1252 text has no zero bytes; binary files have them on both sides).
 */
function utf16ByZeros(bytes: Uint8Array): 'utf-16le' | 'utf-16be' | null {
  const units = Math.min(Math.floor(bytes.length / 2), UTF16_SNIFF_UNITS);
  if (units < 2) return null;
  let firstZeros = 0;
  let secondZeros = 0;
  for (let unit = 0; unit < units; unit += 1) {
    if (bytes[unit * 2] === 0) firstZeros += 1;
    if (bytes[unit * 2 + 1] === 0) secondZeros += 1;
  }
  const many = (zeros: number) => zeros * 2 >= units;
  const few = (zeros: number) => zeros * 20 <= units;
  if (many(secondZeros) && few(firstZeros)) return 'utf-16le';
  return many(firstZeros) && few(secondZeros) ? 'utf-16be' : null;
}

type Utf8Result = { text: string; strayBytes: number; multiByte: number };

/**
 * UTF-8 as specified by WHATWG: each maximal malformed subpart becomes U+FFFD. Counts the bytes of
 * malformed subparts (`strayBytes`) and the valid multi-byte characters; returns null as soon as
 * there are more than `maxStray` stray bytes.
 */
function decodeUtf8(bytes: Uint8Array, start: number, maxStray: number): Utf8Result | null {
  const units: number[] = [];
  let strayBytes = 0;
  let multiByte = 0;
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
      strayBytes += 1;
      if (strayBytes > maxStray) return null;
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
      strayBytes += seen;
      if (strayBytes > maxStray) return null;
      units.push(REPLACEMENT);
      i += seen; // the offending byte starts the next sequence
      continue;
    }
    pushCodePoint(units, codePoint);
    multiByte += 1;
    i += seen;
  }
  return { text: unitsToString(units), strayBytes, multiByte };
}

/** UTF-16 from byte `start` (after a BOM: 2); broken surrogates and an odd last byte become U+FFFD. */
function decodeUtf16(bytes: Uint8Array, littleEndian: boolean, start: number): string {
  const units: number[] = [];
  const unitAt = (index: number): number | undefined => {
    const second = bytes[index + 1];
    if (second === undefined) return undefined;
    const first = bytes[index] as number;
    return littleEndian ? first | (second << 8) : (first << 8) | second;
  };
  let i = start;
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
