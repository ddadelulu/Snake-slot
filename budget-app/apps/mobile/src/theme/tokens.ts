import { StyleSheet, type TextStyle } from 'react-native';

/**
 * THE design-token file (spec section 13).
 *
 * Every colour, font setting, spacing step, corner radius, border width, size and animation
 * duration the app uses lives here, so the whole look can be swapped without touching a screen
 * or a component. Components read tokens through `useTheme()` (see ThemeProvider.tsx) and must
 * never contain a colour literal of their own: `noColorLiterals.test.ts` fails the build if one
 * appears anywhere in src/components or src/theme outside this file.
 *
 * Look: clean and wireframe-like. Light background with dark text (dark mode inverts it), one
 * accent colour for interactive elements, and green / orange / red reserved for budget status.
 * `contrast.test.ts` proves the WCAG 2.x contrast ratios of the colour roles in both schemes.
 */

export type ColorScheme = 'light' | 'dark';

/** Semantic colour roles. Name what a colour is for, never what it looks like. */
export type ColorRoles = {
  /** Screen background. */
  background: string;
  /** Cards, sheets, inputs: anything that sits on the background. */
  surface: string;
  /** Pressed rows, disabled buttons, subtle wells. */
  surfaceMuted: string;
  /** Decorative separators and card outlines. */
  border: string;
  /** Outlines that identify a control (text fields, radio circles); at least 3:1. */
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  /** Text of disabled controls (exempt from contrast minimums, still kept legible). */
  textDisabled: string;
  /** Text and indicators placed on `accent`. */
  textOnAccent: string;
  /** The one accent colour: primary buttons, links, selection, focus. */
  accent: string;
  accentPressed: string;
  /** Tinted background for informational banners. */
  accentSurface: string;
  /** Budget status (spec section 5): under 80 %. Also money coming in. */
  statusOk: string;
  /** Budget status: 80 % or more of the budget. */
  statusWarning: string;
  /** Budget status: 100 % or more, negative balances, destructive actions. */
  statusDanger: string;
  statusOkSurface: string;
  statusWarningSurface: string;
  statusDangerSurface: string;
  /** Unfilled part of a progress bar. */
  progressTrack: string;
  /** Track of a switch that is off; at least 3:1 against the row so the control is visible. */
  switchTrackOff: string;
  /** Track of a switch that is on. */
  switchTrackOn: string;
  /** Switch thumb; at least 3:1 against both tracks, because its position shows the state. */
  switchThumb: string;
  /** Dims the screen behind a bottom sheet or dialog. */
  scrim: string;
  /** Focus ring for keyboard and switch access. */
  focus: string;
};

const lightColors: ColorRoles = {
  background: '#F5F6F8',
  surface: '#FFFFFF',
  surfaceMuted: '#ECEEF2',
  border: '#D3D8E0',
  borderStrong: '#7C8594',
  textPrimary: '#15181D',
  textSecondary: '#555E6C',
  textDisabled: '#8B93A1',
  textOnAccent: '#FFFFFF',
  accent: '#1F55C9',
  accentPressed: '#1A46A6',
  accentSurface: '#E7EEFC',
  statusOk: '#1B7A42',
  statusWarning: '#A65A00',
  statusDanger: '#C42B2B',
  statusOkSurface: '#E4F3EA',
  statusWarningSurface: '#FBEEDD',
  statusDangerSurface: '#FBE8E8',
  progressTrack: '#E1E5EB',
  switchTrackOff: '#7C8594',
  switchTrackOn: '#1F55C9',
  switchThumb: '#FFFFFF',
  scrim: 'rgba(12, 14, 18, 0.45)',
  focus: '#1F55C9',
};

const darkColors: ColorRoles = {
  background: '#111316',
  surface: '#1A1D22',
  surfaceMuted: '#252930',
  border: '#363C45',
  borderStrong: '#717986',
  textPrimary: '#F1F3F6',
  textSecondary: '#A6AEBA',
  textDisabled: '#6B7380',
  textOnAccent: '#0B1530',
  accent: '#7EA6FF',
  accentPressed: '#96B7FF',
  accentSurface: '#1A2540',
  statusOk: '#4CC487',
  statusWarning: '#F0A23B',
  statusDanger: '#FF7070',
  statusOkSurface: '#14291E',
  statusWarningSurface: '#2E2313',
  statusDangerSurface: '#341B1C',
  progressTrack: '#2D323A',
  switchTrackOff: '#717986',
  switchTrackOn: '#4170DB',
  switchThumb: '#F1F3F6',
  scrim: 'rgba(0, 0, 0, 0.6)',
  focus: '#7EA6FF',
};

export type TextVariant =
  'display' | 'title' | 'heading' | 'body' | 'bodyStrong' | 'label' | 'caption';

type FontWeight = NonNullable<TextStyle['fontWeight']>;

export type TextVariantStyle = {
  fontSize: number;
  lineHeight: number;
  fontWeight: FontWeight;
  letterSpacing?: number;
  /**
   * Upper bound for the system text size setting. `undefined` means no cap: body text follows
   * the user's setting all the way. Only the huge balance and screen titles are capped so they
   * still fit on one line at the largest accessibility sizes.
   */
  maxFontSizeMultiplier?: number;
};

const fontWeights = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const satisfies Record<string, FontWeight>;

const textVariants: Record<TextVariant, TextVariantStyle> = {
  /** The big "bank balance" number. */
  display: {
    fontSize: 44,
    lineHeight: 52,
    fontWeight: fontWeights.bold,
    letterSpacing: -0.5,
    maxFontSizeMultiplier: 1.4,
  },
  title: { fontSize: 28, lineHeight: 34, fontWeight: fontWeights.bold, maxFontSizeMultiplier: 1.6 },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: fontWeights.semibold },
  body: { fontSize: 16, lineHeight: 22, fontWeight: fontWeights.regular },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: fontWeights.semibold },
  label: { fontSize: 14, lineHeight: 20, fontWeight: fontWeights.medium },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: fontWeights.regular },
};

const typography = {
  /** `undefined` selects the platform system font (San Francisco on iOS, Roboto on Android). */
  fontFamily: undefined as string | undefined,
  weights: fontWeights,
  /** Equal-width digits so amounts line up in columns and do not jitter while they change. */
  tabularNumbers: ['tabular-nums'] as NonNullable<TextStyle['fontVariant']>,
  variants: textVariants,
};

/** Spacing scale in points. Generous by design: prefer `lg` and up between blocks. */
const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

const radii = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
};

const borderWidths = {
  hairline: StyleSheet.hairlineWidth,
  thin: 1,
  /** Focused or invalid fields, selected radio circles. */
  thick: 2,
};

const sizes = {
  /** Minimum touch target (Apple HIG 44 pt; Android asks for 48 dp, rows use 52+). */
  minTouchTarget: 44,
  buttonHeight: 52,
  inputHeight: 48,
  rowHeight: 56,
  progressBarHeight: 8,
  /** The thin "step 3 of 9" bar of the onboarding questionnaire. */
  stepProgressHeight: 4,
  radioOuter: 22,
  radioInner: 10,
  /** Day cells of the payday grid (7 per row, so the width is a seventh of the row). */
  dayCellHeight: 48,
  /** Selection chips (payment methods, categories) and their remove buttons. */
  chipHeight: 44,
  /** The round minus and plus buttons of a stepper. */
  stepperButton: 44,
  /** Keeps the stepper buttons still while the value changes width, e.g. from "9" to "10". */
  stepperValueMinWidth: 64,
  /** Touch height of a slider; the drawn track is thinner and centred in it. */
  sliderHeight: 44,
  /** Readable line length on tablets and the web build. */
  maxContentWidth: 640,
  /** The round "+" button floating over Home (Material's 56 dp). */
  fab: 56,
  /** The glyph inside the floating button. */
  fabIcon: 28,
  /** Icons inside fields and chips, e.g. the magnifier of the search field. */
  inlineIcon: 20,
  /** The unread-count badge on the bell (Home). */
  badge: 20,
  /** Bar of the category on the payment moment (drains to its new level). */
  momentBarHeight: 16,
  /** Tallest bar of a category's six-month history. */
  historyBarMaxHeight: 120,
  /** Width of one bar of the history. */
  historyBarWidth: 28,
  /** The plain wallet drawn on the payment moment (no branding). */
  wallet: { width: 168, height: 104, flapHeight: 30 },
  /** A bill and a coin sliding out of the wallet. */
  bill: { width: 76, height: 38 },
  coin: 26,
  /** How far bills and coins travel out of the wallet. */
  walletTravel: 96,
};

const opacity = {
  /** Feedback for text-only buttons that have no background to darken. */
  pressed: 0.6,
};

const layout = {
  /** Horizontal and vertical padding of a screen. */
  screenPadding: 20,
  /** Gap between sections on a screen. */
  sectionGap: 24,
  /** Inner padding of cards, banners and sheets. */
  cardPadding: 16,
};

/**
 * Animation timing in milliseconds, for the sheet now and the "pain level" feedback later.
 *
 * Reduce Motion must be respected: every animation checks `useReduceMotion()` (or
 * `AccessibilityInfo.isReduceMotionEnabled()` plus the 'reduceMotionChanged' event) and, when
 * it is on, jumps straight to the end state or uses a short cross-fade instead of movement.
 */
const motion = {
  duration: {
    instant: 0,
    fast: 150,
    normal: 250,
    slow: 400,
  },
  sheetEnter: 280,
  sheetExit: 220,
  /**
   * The payment moment (spec section 8). The pain level picks the spin length; Brutal also needs
   * the button held for `holdToConfirm`. Reduce Motion skips every movement.
   */
  moment: {
    spin: { mild: 900, normal: 1600, brutal: 2000 },
    /** Bills and coins leaving the wallet, staggered by `walletStagger` each. */
    walletOut: 700,
    walletStagger: 120,
    /** The red flash when the purchase goes over budget. */
    flash: 450,
    holdToConfirm: 2000,
    /** Shortest gap between two haptic ticks during the spin. */
    tickInterval: 70,
  },
};

export type Typography = typeof typography;
export type Spacing = typeof spacing;
export type Radii = typeof radii;
export type BorderWidths = typeof borderWidths;
export type Sizes = typeof sizes;
export type Layout = typeof layout;
export type Opacity = typeof opacity;
export type Motion = typeof motion;

export type Theme = {
  scheme: ColorScheme;
  colors: ColorRoles;
  typography: Typography;
  spacing: Spacing;
  radii: Radii;
  borderWidths: BorderWidths;
  sizes: Sizes;
  layout: Layout;
  opacity: Opacity;
  motion: Motion;
};

const shared = { typography, spacing, radii, borderWidths, sizes, layout, opacity, motion };

export const lightTheme: Theme = { scheme: 'light', colors: lightColors, ...shared };
export const darkTheme: Theme = { scheme: 'dark', colors: darkColors, ...shared };

export const themes: Readonly<Record<ColorScheme, Theme>> = { light: lightTheme, dark: darkTheme };
