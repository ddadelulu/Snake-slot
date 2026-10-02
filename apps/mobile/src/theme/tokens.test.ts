import { darkTheme, lightTheme, themes, type ColorRoles } from './tokens';

const OPAQUE_HEX = /^#[0-9A-F]{6}$/;
const TRANSLUCENT = /^rgba\(\d{1,3}, \d{1,3}, \d{1,3}, (0(\.\d+)?|1)\)$/;

describe('design tokens', () => {
  it('maps each scheme to its theme', () => {
    expect(themes.light).toBe(lightTheme);
    expect(themes.dark).toBe(darkTheme);
    expect(lightTheme.scheme).toBe('light');
    expect(darkTheme.scheme).toBe('dark');
  });

  it('defines the same colour roles in light and dark', () => {
    expect(Object.keys(darkTheme.colors).sort()).toEqual(Object.keys(lightTheme.colors).sort());
  });

  it.each(['light', 'dark'] as const)(
    'uses opaque upper-case hex everywhere in %s except the scrim',
    (scheme) => {
      const colors: ColorRoles = themes[scheme].colors;
      for (const [role, value] of Object.entries(colors)) {
        expect([role, value]).toEqual([
          role,
          expect.stringMatching(role === 'scrim' ? TRANSLUCENT : OPAQUE_HEX),
        ]);
      }
    },
  );

  it('keeps the green, orange and red roles distinct from the accent', () => {
    for (const theme of [lightTheme, darkTheme]) {
      const { accent, statusOk, statusWarning, statusDanger } = theme.colors;
      expect(new Set([accent, statusOk, statusWarning, statusDanger]).size).toBe(4);
    }
  });

  it('shares everything except colours between the schemes', () => {
    const { colors: _light, scheme: _l, ...lightRest } = lightTheme;
    const { colors: _dark, scheme: _d, ...darkRest } = darkTheme;
    expect(darkRest).toEqual(lightRest);
  });

  it('uses the system font and tabular figures', () => {
    expect(lightTheme.typography.fontFamily).toBeUndefined();
    expect(lightTheme.typography.tabularNumbers).toEqual(['tabular-nums']);
  });

  it('makes the display size the largest and keeps line heights above font sizes', () => {
    const variants = Object.values(lightTheme.typography.variants);
    const largest = Math.max(...variants.map((variant) => variant.fontSize));
    expect(lightTheme.typography.variants.display.fontSize).toBe(largest);
    for (const variant of variants) {
      expect(variant.lineHeight).toBeGreaterThan(variant.fontSize);
    }
  });

  it('keeps every control at least 44 pt tall', () => {
    const {
      minTouchTarget,
      buttonHeight,
      inputHeight,
      rowHeight,
      dayCellHeight,
      chipHeight,
      stepperButton,
      sliderHeight,
    } = lightTheme.sizes;
    expect(minTouchTarget).toBe(44);
    for (const size of [
      buttonHeight,
      inputHeight,
      rowHeight,
      dayCellHeight,
      chipHeight,
      stepperButton,
      sliderHeight,
    ]) {
      expect(size).toBeGreaterThanOrEqual(minTouchTarget);
    }
  });

  it('orders the spacing scale from small to large', () => {
    const steps = Object.values(lightTheme.spacing);
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);
  });
});
