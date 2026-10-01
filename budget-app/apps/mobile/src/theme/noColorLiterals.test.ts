import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Spec section 13: every colour lives in the token file. This test fails when a hex, rgb, rgba,
 * hsl, hsla or named colour literal shows up anywhere else in src/theme or src/components, tests
 * included, so a new screen element cannot quietly hard-code a colour.
 */

const SRC = join(__dirname, '..');
const SCANNED_DIRECTORIES = ['theme', 'components'].map((directory) => join(SRC, directory));
const TOKEN_FILE = join(SRC, 'theme', 'tokens.ts');

const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/;
const FUNCTIONAL = /\b(?:rgba?|hsla?|hwb)\s*\(/;
const NAMED =
  /(['"`])(?:white|black|red|green|blue|orange|yellow|gray|grey|purple|pink|brown|silver|navy|teal)\1/i;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('colour literals', () => {
  const files = SCANNED_DIRECTORIES.flatMap(sourceFiles).filter((file) => file !== TOKEN_FILE);

  it('finds the files it is meant to scan', () => {
    const names = files.map((file) => relative(SRC, file));
    expect(names).toContain(join('theme', 'ThemeProvider.tsx'));
    expect(names.some((name) => name.startsWith('components'))).toBe(true);
  });

  it('appear nowhere outside src/theme/tokens.ts', () => {
    const offenders: string[] = [];
    for (const file of files) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          if (HEX.test(line) || FUNCTIONAL.test(line) || NAMED.test(line)) {
            offenders.push(`${relative(SRC, file)}:${index + 1}: ${line.trim()}`);
          }
        });
    }
    expect(offenders).toEqual([]);
  });

  it('would catch each kind of literal', () => {
    const samples = [
      ['#', 'fff'],
      ['#', '1f55c9'],
      ['rgb', 'a(0, 0, 0, 0.5)'],
      ['hsl', '(0, 0%, 0%)'],
      ["'whi", "te'"],
    ].map((parts) => parts.join(''));
    for (const sample of samples) {
      expect(HEX.test(sample) || FUNCTIONAL.test(sample) || NAMED.test(sample)).toBe(true);
    }
  });
});
