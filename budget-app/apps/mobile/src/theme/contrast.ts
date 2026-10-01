/**
 * WCAG 2.x contrast maths (https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio), used by the
 * contrast test to prove the colour tokens are readable in both schemes.
 */

type Rgb = { r: number; g: number; b: number };

/** Parses an opaque `#RGB` or `#RRGGBB` colour. Anything else throws: contrast needs opacity. */
export function parseHexColor(color: string): Rgb {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!match?.[1]) {
    throw new Error(`Expected an opaque #RGB or #RRGGBB colour, got "${color}"`);
  }
  const digits =
    match[1].length === 3
      ? match[1]
          .split('')
          .map((digit) => digit + digit)
          .join('')
      : match[1];
  return {
    r: parseInt(digits.slice(0, 2), 16),
    g: parseInt(digits.slice(2, 4), 16),
    b: parseInt(digits.slice(4, 6), 16),
  };
}

function channel(value: number): number {
  const srgb = value / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(color: string): number {
  const { r, g, b } = parseHexColor(color);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio between two colours, from 1 (identical) to 21 (black on white). */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}
