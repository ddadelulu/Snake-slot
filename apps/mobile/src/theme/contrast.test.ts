import { contrastRatio, parseHexColor, relativeLuminance } from './contrast';
import { themes, type ColorRoles, type ColorScheme } from './tokens';

/** Builds a #RRGGBB string from a number, so this file needs no colour literals of its own. */
const hex = (value: number) => `#${value.toString(16).padStart(6, '0')}`;
const BLACK = hex(0x000000);
const WHITE = hex(0xffffff);

describe('WCAG contrast maths', () => {
  it('matches the reference values of the WCAG definition', () => {
    expect(relativeLuminance(BLACK)).toBe(0);
    expect(relativeLuminance(WHITE)).toBe(1);
    expect(contrastRatio(BLACK, WHITE)).toBe(21);
    expect(contrastRatio(WHITE, BLACK)).toBe(21);
    expect(contrastRatio(WHITE, WHITE)).toBe(1);
    // Mid grey 0x777777 on white is the textbook "just fails AA" pair (4.48:1).
    expect(contrastRatio(hex(0x777777), WHITE)).toBeCloseTo(4.48, 2);
  });

  it('expands three-digit colours and rejects anything that is not opaque hex', () => {
    expect(parseHexColor(`#${'f0a'}`)).toEqual(parseHexColor(hex(0xff00aa)));
    expect(() => parseHexColor('accent')).toThrow('Expected an opaque');
    expect(() => parseHexColor(`${hex(0x112233)}80`)).toThrow('Expected an opaque');
  });
});

type Pair = [foreground: keyof ColorRoles, background: keyof ColorRoles];

const BODY_TEXT: Pair[] = [
  ['textPrimary', 'background'],
  ['textPrimary', 'surface'],
  ['textPrimary', 'surfaceMuted'],
  ['textSecondary', 'background'],
  ['textSecondary', 'surface'],
  ['textSecondary', 'surfaceMuted'],
  ['textOnAccent', 'accent'],
  ['textOnAccent', 'accentPressed'],
  // The accent doubles as link and secondary-button text.
  ['accent', 'background'],
  ['accent', 'surface'],
  ['accent', 'surfaceMuted'],
  // Banner text sits on the tinted surfaces.
  ['textPrimary', 'accentSurface'],
  ['textPrimary', 'statusOkSurface'],
  ['textPrimary', 'statusWarningSurface'],
  ['textPrimary', 'statusDangerSurface'],
  ['textSecondary', 'accentSurface'],
  ['textSecondary', 'statusWarningSurface'],
  ['textSecondary', 'statusDangerSurface'],
];

const STATUS: Pair[] = [
  ['statusOk', 'background'],
  ['statusOk', 'surface'],
  ['statusWarning', 'background'],
  ['statusWarning', 'surface'],
  ['statusDanger', 'background'],
  ['statusDanger', 'surface'],
];

const NON_TEXT: Pair[] = [
  // Bar fills against their track, and banner edges against their tint.
  ['statusOk', 'progressTrack'],
  ['statusWarning', 'progressTrack'],
  ['statusDanger', 'progressTrack'],
  ['statusOk', 'statusOkSurface'],
  ['statusWarning', 'statusWarningSurface'],
  ['statusDanger', 'statusDangerSurface'],
  ['accent', 'accentSurface'],
  // Outlines that identify a control (WCAG 1.4.11).
  ['borderStrong', 'background'],
  ['borderStrong', 'surface'],
  ['focus', 'background'],
  ['focus', 'surface'],
];

const SCHEMES: ColorScheme[] = ['light', 'dark'];

describe.each(SCHEMES)('%s theme contrast', (scheme) => {
  const colors = themes[scheme].colors;
  const ratio = ([foreground, background]: Pair) =>
    contrastRatio(colors[foreground], colors[background]);

  it.each(BODY_TEXT)('%s on %s reaches 4.5:1 (body text)', (foreground, background) => {
    expect(ratio([foreground, background])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(STATUS)(
    '%s on %s reaches 3:1 (bars, icons, large and bold text)',
    (foreground, background) => {
      expect(ratio([foreground, background])).toBeGreaterThanOrEqual(3);
    },
  );

  it.each(STATUS)(
    '%s on %s also reaches 4.5:1, because amounts and labels use it at body size',
    (foreground, background) => {
      expect(ratio([foreground, background])).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(NON_TEXT)('%s on %s reaches 3:1 (non-text contrast)', (foreground, background) => {
    expect(ratio([foreground, background])).toBeGreaterThanOrEqual(3);
  });
});
