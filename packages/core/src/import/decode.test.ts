import { describe, expect, it } from 'vitest';

import { decodeText } from './decode';

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

describe('decodeText', () => {
  it('strips a UTF-8 BOM and decodes UTF-8', () => {
    expect(decodeText(bytes(0xef, 0xbb, 0xbf, 0x5a, 0xc3, 0xbc, 0x72, 0x69, 0x63, 0x68))).toEqual({
      text: 'Zürich',
      encoding: 'utf-8',
    });
  });

  it('replaces malformed sequences after a UTF-8 BOM instead of switching encoding', () => {
    // A stray byte, a lead byte followed by ASCII, and a sequence cut off at the end.
    expect(decodeText(bytes(0xef, 0xbb, 0xbf, 0x41, 0xff, 0x42, 0xc3, 0x43, 0xe2, 0x82))).toEqual({
      text: 'A\uFFFDB\uFFFDC\uFFFD',
      encoding: 'utf-8',
    });
  });

  it('reads valid UTF-8 without a BOM, including 3- and 4-byte characters', () => {
    const coin = [0xf0, 0x9f, 0x92, 0xb0]; // U+1F4B0
    const euro = [0xe2, 0x82, 0xac];
    expect(decodeText(bytes(...ascii('CHF '), ...euro, 0x20, ...coin))).toEqual({
      text: 'CHF € 💰',
      encoding: 'utf-8',
    });
  });

  it('reads an empty file as empty UTF-8 text', () => {
    expect(decodeText(bytes())).toEqual({ text: '', encoding: 'utf-8' });
  });

  it('falls back to Windows-1252 for single-byte exports (PostFinance, old e-banking)', () => {
    // "Zürich – 12.50 €" with ü = 0xFC, en dash = 0x96, euro = 0x80.
    const file = bytes(...ascii('Z'), 0xfc, ...ascii('rich '), 0x96, ...ascii(' 12.50 '), 0x80);
    expect(decodeText(file)).toEqual({ text: 'Zürich – 12.50 €', encoding: 'windows-1252' });
  });

  it('maps the whole Windows-1252 range, including unassigned bytes and Latin-1', () => {
    const { text } = decodeText(bytes(0x81, 0x8a, 0x92, 0x9f, 0xa0, 0xe9, 0xff));
    expect(text).toBe('\u0081Š’Ÿ\u00a0éÿ');
  });

  it.each([
    ['an overlong two-byte form', [0xc0, 0xaf]],
    ['an overlong three-byte form', [0xe0, 0x80, 0xaf]],
    ['an encoded surrogate', [0xed, 0xa0, 0x80]],
    ['an overlong four-byte form', [0xf0, 0x80, 0x80, 0xaf]],
    ['a code point above U+10FFFF', [0xf4, 0x90, 0x80, 0x80]],
    ['an invalid lead byte', [0xf5, 0x80, 0x80, 0x80]],
    ['a lone continuation byte', [0x80]],
    ['a truncated sequence', [0x41, 0xc3]],
  ])('rejects %s as UTF-8', (_, sequence) => {
    expect(decodeText(bytes(...sequence)).encoding).toBe('windows-1252');
  });

  it('decodes UTF-16 little endian with surrogate pairs and repairs broken ones', () => {
    const file = bytes(
      ...[0xff, 0xfe], // BOM
      ...[0x5a, 0x00, 0xfc, 0x00], // "Zü"
      ...[0x3d, 0xd8, 0xb0, 0xdc], // U+1F4B0 as a surrogate pair
      ...[0x00, 0xd8, 0x41, 0x00], // high surrogate followed by "A"
      ...[0x00, 0xdc], // lone low surrogate
      ...[0x00, 0xd8], // high surrogate at the end
      0x42, // odd trailing byte
    );
    expect(decodeText(file)).toEqual({
      text: 'Zü💰\uFFFDA\uFFFD\uFFFD\uFFFD',
      encoding: 'utf-16le',
    });
  });

  it('decodes UTF-16 big endian', () => {
    expect(decodeText(bytes(0xfe, 0xff, 0x00, 0x5a, 0x00, 0xfc))).toEqual({
      text: 'Zü',
      encoding: 'utf-16be',
    });
  });

  it('reads UTF-8 with a few stray bytes as UTF-8 (QA L11)', () => {
    // UTF-8 for text below U+0800, built by hand (no TextEncoder in this package's types).
    const line = (text: string) =>
      [...text].flatMap((char) => {
        const code = char.charCodeAt(0);
        return code < 0x80 ? [code] : [0xc0 | (code >> 6), 0x80 | (code & 0x3f)];
      });
    // "Café Müller" pasted in from a Windows-1252 file: é = 0xE9 (cut off by a space), ü = 0xFC.
    const pasted = [...ascii('Caf'), 0xe9, ...ascii(' M'), 0xfc, ...ascii('ller;-3.00\n')];
    const body = line('Datum;Text;Betrag\n03.10.2026;Bäckerei Zürich;-4.50\n'.repeat(10));
    const { text, encoding } = decodeText(bytes(...body, ...pasted));
    expect(encoding).toBe('utf-8');
    expect(text).toContain('Bäckerei Zürich');
    expect(text.endsWith('Caf\uFFFD M\uFFFDller;-3.00\n')).toBe(true);
  });

  it('reads a file as Windows-1252 when stray bytes exceed 1 % or nothing else is UTF-8', () => {
    const multiByte = [0xc3, 0xbc]; // "ü" in UTF-8
    // 2 stray bytes in 120: 1.7 %.
    const many = bytes(...multiByte, ...ascii('x'.repeat(116)), 0xfc, 0xe9);
    expect(decodeText(many).encoding).toBe('windows-1252');
    // 1 stray byte in 200, but no UTF-8 character at all: a plain Windows-1252 file.
    const plain = bytes(...ascii('x'.repeat(199)), 0xfc);
    expect(decodeText(plain)).toEqual({ text: `${'x'.repeat(199)}ü`, encoding: 'windows-1252' });
    // 1 stray byte (a cut-off sequence) in 200 with a UTF-8 character: UTF-8.
    const cut = bytes(...multiByte, ...ascii('x'.repeat(196)), 0xe2, 0x82);
    expect(decodeText(cut)).toEqual({ text: `ü${'x'.repeat(196)}\uFFFD`, encoding: 'utf-8' });
  });

  it('recognises UTF-16 without a BOM by its zero bytes', () => {
    const units = (text: string) => [...text].map((char) => char.charCodeAt(0));
    const le = bytes(...units('Datum;Zürich').flatMap((unit) => [unit & 0xff, unit >> 8]));
    expect(decodeText(le)).toEqual({ text: 'Datum;Zürich', encoding: 'utf-16le' });
    const be = bytes(...units('Datum;€ 5').flatMap((unit) => [unit >> 8, unit & 0xff]));
    expect(decodeText(be)).toEqual({ text: 'Datum;€ 5', encoding: 'utf-16be' });
  });

  it('does not take binary data with zero bytes on both sides for UTF-16', () => {
    expect(decodeText(bytes(0x00, 0x00, 0x00, 0x00, 0x41, 0x00)).encoding).toBe('utf-8');
    expect(decodeText(bytes(0x00, 0x00, 0x41, 0x00, 0x00, 0x42)).encoding).toBe('utf-8');
    expect(decodeText(bytes(0x41, 0x00)).encoding).toBe('utf-8');
  });

  it('decodes files larger than one chunk', () => {
    const big = new Uint8Array(20000).fill(0x61);
    expect(decodeText(big).text).toBe('a'.repeat(20000));
  });
});
