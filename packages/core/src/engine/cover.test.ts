import { describe, expect, it } from 'vitest';

import { MAX_ABS_RAPPEN, chf } from '../money';
import { coverOverspend, type CoverSide } from './cover';

// Groceries has CHF 576.50 left; going out is CHF 30 over.
const groceries: CoverSide = { budgetRappen: chf(1000), spentRappen: chf(423, 50) };
const goingOut: CoverSide = { budgetRappen: chf(320), spentRappen: chf(350) };

describe('coverOverspend', () => {
  it('moves exactly the overspend when the other category has enough', () => {
    expect(coverOverspend({ from: groceries, to: goingOut })).toEqual({
      ok: true,
      movedRappen: chf(30),
      fromBudgetRappen: chf(970),
      toBudgetRappen: chf(350),
    });
  });

  it('moves what is available when that is less than the overspend', () => {
    const nearlyEmpty = { budgetRappen: chf(500), spentRappen: chf(490) };
    expect(coverOverspend({ from: nearlyEmpty, to: goingOut })).toEqual({
      ok: true,
      movedRappen: chf(10),
      fromBudgetRappen: chf(490),
      toBudgetRappen: chf(330),
    });
  });

  it('needs an overspent category when no amount is given', () => {
    for (const spentRappen of [chf(320), chf(100), 0, chf(-20)]) {
      expect(
        coverOverspend({ from: groceries, to: { budgetRappen: chf(320), spentRappen } }),
      ).toEqual({ ok: false, reason: 'not_overspent' });
    }
  });

  it('cannot take from a category with nothing left', () => {
    for (const from of [
      { budgetRappen: chf(200), spentRappen: chf(200) },
      { budgetRappen: chf(200), spentRappen: chf(250) },
      { budgetRappen: 0, spentRappen: 0 },
    ]) {
      expect(coverOverspend({ from, to: goingOut })).toEqual({
        ok: false,
        reason: 'nothing_available',
      });
      expect(coverOverspend({ from, to: goingOut, amountRappen: chf(10) })).toEqual({
        ok: false,
        reason: 'nothing_available',
      });
    }
  });

  it('does not let refunds make more than the budget available', () => {
    // CHF 100 budget with a net refund of CHF 20: at most CHF 100 can move, never 120.
    const refunded = { budgetRappen: chf(100), spentRappen: chf(-20) };
    const deepRed = { budgetRappen: 0, spentRappen: chf(500) };
    expect(coverOverspend({ from: refunded, to: deepRed })).toEqual({
      ok: true,
      movedRappen: chf(100),
      fromBudgetRappen: 0,
      toBudgetRappen: chf(100),
    });
    expect(coverOverspend({ from: refunded, to: deepRed, amountRappen: chf(100) + 1 })).toEqual({
      ok: false,
      reason: 'invalid_amount',
    });
  });

  it('moves a chosen amount up to what is available', () => {
    expect(coverOverspend({ from: groceries, to: goingOut, amountRappen: chf(50) })).toEqual({
      ok: true,
      movedRappen: chf(50),
      fromBudgetRappen: chf(950),
      toBudgetRappen: chf(370),
    });
    expect(
      coverOverspend({ from: groceries, to: goingOut, amountRappen: chf(576, 50) }),
    ).toMatchObject({ ok: true, fromBudgetRappen: chf(423, 50) });
    // With an amount, the receiving category does not have to be overspent.
    expect(
      coverOverspend({
        from: groceries,
        to: { budgetRappen: chf(250), spentRappen: 0 },
        amountRappen: chf(20),
      }),
    ).toMatchObject({ ok: true, toBudgetRappen: chf(270) });
  });

  it('rejects amounts that are not a positive whole number of Rappen up to the available', () => {
    for (const amountRappen of [0, -500, 12.5, Number.NaN, chf(576, 50) + 1, MAX_ABS_RAPPEN + 1]) {
      expect(coverOverspend({ from: groceries, to: goingOut, amountRappen })).toEqual({
        ok: false,
        reason: 'invalid_amount',
      });
    }
  });

  it('never takes the giving budget below what was spent from it (property)', () => {
    const sides = [0, 1, chf(100), chf(320), chf(1000)].flatMap((budgetRappen) =>
      [chf(-20), 0, 1, chf(99, 95), chf(350), chf(1000)].map((spentRappen) => ({
        budgetRappen,
        spentRappen,
      })),
    );
    for (const from of sides) {
      for (const to of sides) {
        for (const amountRappen of [undefined, 1, chf(30), chf(500)]) {
          const result = coverOverspend({ from, to, amountRappen });
          if (!result.ok) continue;
          expect(result.movedRappen).toBeGreaterThan(0);
          expect(result.fromBudgetRappen).toBeGreaterThanOrEqual(Math.max(0, from.spentRappen));
          expect(result.fromBudgetRappen + result.toBudgetRappen).toBe(
            from.budgetRappen + to.budgetRappen,
          );
          if (amountRappen === undefined) {
            expect(result.toBudgetRappen).toBeLessThanOrEqual(Math.max(to.spentRappen, 0));
          }
        }
      }
    }
  });

  it('rejects negative budgets and amounts that are not Rappen', () => {
    expect(() =>
      coverOverspend({ from: { budgetRappen: -1, spentRappen: 0 }, to: goingOut }),
    ).toThrow(/from budget must not be negative/);
    expect(() =>
      coverOverspend({ from: groceries, to: { budgetRappen: -1, spentRappen: 0 } }),
    ).toThrow(/to budget must not be negative/);
    expect(() =>
      coverOverspend({ from: { budgetRappen: 100, spentRappen: 0.5 }, to: goingOut }),
    ).toThrow(/from spent/);
    expect(() =>
      coverOverspend({ from: groceries, to: { budgetRappen: 100, spentRappen: 0.5 } }),
    ).toThrow(/to spent/);
  });

  it('throws when the receiving budget would leave the Rappen range', () => {
    expect(() =>
      coverOverspend({
        from: groceries,
        to: { budgetRappen: MAX_ABS_RAPPEN, spentRappen: 0 },
        amountRappen: 1,
      }),
    ).toThrow(/to budget after the cover/);
  });
});
