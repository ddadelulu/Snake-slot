import { formatChf, type Language, type Rappen } from '@budget/core';

/**
 * The balance on the payment moment rolls like a mechanical odometer: the Rappen wheel turns
 * continuously and each higher wheel only moves while every wheel to its right passes from 9 to
 * 0 (or back). Pure functions here, the drawing is in Odometer.tsx.
 */

export type OdometerSlot =
  | {
      kind: 'digit';
      /** Place value: 0 is the Rappen ones, 2 the franc ones. */
      place: number;
      /** The digit showing, and how far (0…1) the wheel has turned towards the next one. */
      digit: number;
      next: number;
      offset: number;
    }
  | { kind: 'separator'; place: number; text: string };

/** Ease-out cubic: fast at first, settling softly on the new balance. */
export function easeOut(progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress));
  return 1 - (1 - clamped) ** 3;
}

/** The value shown at `progress` (0…1) of a spin from `from` to `to`; not rounded. */
export function spinValue(from: Rappen, to: Rappen, progress: number): number {
  return from + (to - from) * easeOut(progress);
}

/** Wheels needed so neither end of the spin loses a digit (at least "0.00"). */
export function wheelCount(from: Rappen, to: Rappen): number {
  const digits = (value: number) => String(Math.round(Math.abs(value))).length;
  return Math.max(3, digits(from), digits(to));
}

/** The digit wheel at `place` for a (possibly fractional) Rappen amount. */
export function wheel(amount: number, place: number): { digit: number; offset: number } {
  const value = Math.abs(amount);
  const unit = 10 ** place;
  const digit = Math.floor(value / unit) % 10;
  // The wheel moves only during the last unit of everything to its right (the carry).
  const below = value % unit;
  const offset = place === 0 ? below : Math.max(0, below - (unit - 1));
  return { digit, offset: Math.min(offset, 1) };
}

function groupSeparator(language: Language): string {
  // "1’000.00" (de) or "1,000.00" (en): the character after the first digit.
  return formatChf(100000, { language, currency: false }).charAt(1);
}

/**
 * The slots, left to right, for `amount` on `wheels` wheels: digits, the thousands separators and
 * the decimal point. Leading wheels above the francs stay hidden until they show a digit or are
 * rolling in.
 */
export function odometerSlots(amount: number, wheels: number, language: Language): OdometerSlot[] {
  const value = Math.abs(amount);
  const separator = groupSeparator(language);
  const slots: OdometerSlot[] = [];
  for (let place = wheels - 1; place >= 0; place -= 1) {
    const visible = place <= 2 || value >= 10 ** place - 1;
    if (!visible) continue;
    const { digit, offset } = wheel(value, place);
    slots.push({ kind: 'digit', place, digit, next: (digit + 1) % 10, offset });
    const francPlace = place - 2;
    if (francPlace > 0 && francPlace % 3 === 0) {
      slots.push({ kind: 'separator', place, text: separator });
    }
    if (place === 2) slots.push({ kind: 'separator', place, text: '.' });
  }
  return slots;
}

/** True when the whole-franc part changed between two frames: one haptic tick. */
export function francChanged(previous: number, current: number): boolean {
  return Math.floor(Math.abs(previous) / 100) !== Math.floor(Math.abs(current) / 100);
}
