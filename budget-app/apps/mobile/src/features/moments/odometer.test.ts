import {
  easeOut,
  francChanged,
  odometerSlots,
  spinValue,
  wheel,
  wheelCount,
  type OdometerSlot,
} from './odometer';

/** The slots as the eye reads them, with each wheel at its resting digit. */
const read = (slots: OdometerSlot[]) =>
  slots.map((slot) => (slot.kind === 'digit' ? String(slot.digit) : slot.text)).join('');

describe('odometer', () => {
  it('eases out from the old to the new balance', () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(0.5)).toBeCloseTo(0.875);
    expect(easeOut(-1)).toBe(0);
    expect(easeOut(2)).toBe(1);
    expect(spinValue(270950, 262550, 0)).toBe(270950);
    expect(spinValue(270950, 262550, 1)).toBe(262550);
    expect(spinValue(270950, 262550, 0.5)).toBeCloseTo(270950 - 8400 * 0.875);
  });

  it('shows the amount with grouping and the decimal point', () => {
    expect(read(odometerSlots(262550, wheelCount(270950, 262550), 'de'))).toBe('2’625.50');
    expect(read(odometerSlots(262550, wheelCount(270950, 262550), 'en'))).toBe('2,625.50');
    expect(read(odometerSlots(123456789, 9, 'en'))).toBe('1,234,567.89');
    expect(read(odometerSlots(5, 3, 'en'))).toBe('0.05');
  });

  it('keeps enough wheels for both ends and at least 0.00', () => {
    expect(wheelCount(0, 5)).toBe(3);
    expect(wheelCount(100000, 99950)).toBe(6);
    expect(wheelCount(-120000, 500)).toBe(6);
  });

  it('turns the Rappen wheel continuously and higher wheels only on the carry', () => {
    expect(wheel(1234.25, 0)).toEqual({ digit: 4, offset: 0.25 });
    // 12.34: the tens-of-Rappen wheel waits until the ones wheel passes 9 → 0.
    expect(wheel(1234.25, 1)).toEqual({ digit: 3, offset: 0 });
    expect(wheel(1239.5, 1).digit).toBe(3);
    expect(wheel(1239.5, 1).offset).toBeCloseTo(0.5);
    expect(wheel(1999.5, 3).digit).toBe(1);
    expect(wheel(1999.5, 3).offset).toBeCloseTo(0.5);
    expect(wheel(-1234, 2)).toEqual({ digit: 2, offset: 0 });
  });

  it('hides leading wheels until they roll in', () => {
    // CHF 9.99 is about to become CHF 10.00: the tens wheel appears.
    const rolling = odometerSlots(999.5, 4, 'en');
    expect(rolling[0]).toMatchObject({ kind: 'digit', place: 3, digit: 0 });
    expect(odometerSlots(950, 4, 'en').some((slot) => slot.place === 3)).toBe(false);
    expect(odometerSlots(100000, 6, 'en').filter((slot) => slot.kind === 'digit')).toHaveLength(6);
  });

  it('ticks once per whole franc passed', () => {
    expect(francChanged(270950, 270901)).toBe(false);
    expect(francChanged(270950, 270899)).toBe(true);
    expect(francChanged(50, -50)).toBe(false);
  });
});
