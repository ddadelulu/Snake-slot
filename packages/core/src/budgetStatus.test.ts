import { describe, expect, it } from 'vitest';
import { budgetStatus, progressPermille } from './budgetStatus';

describe('budgetStatus', () => {
  it('is green below 80 %', () => {
    expect(budgetStatus(0, 10000)).toBe('ok');
    expect(budgetStatus(7999, 10000)).toBe('ok');
  });

  it('turns orange at exactly 80 %', () => {
    expect(budgetStatus(8000, 10000)).toBe('warning');
    expect(budgetStatus(9999, 10000)).toBe('warning');
  });

  it('turns red at exactly 100 % and above', () => {
    expect(budgetStatus(10000, 10000)).toBe('danger');
    expect(budgetStatus(25000, 10000)).toBe('danger');
  });

  it('uses exact integer thresholds for awkward budgets', () => {
    // 80 % of 333 Rappen is 266.4: 266 is still green, 267 is orange.
    expect(budgetStatus(266, 333)).toBe('ok');
    expect(budgetStatus(267, 333)).toBe('warning');
    expect(budgetStatus(332, 333)).toBe('warning');
    expect(budgetStatus(333, 333)).toBe('danger');
  });

  it('handles empty budgets and net refunds', () => {
    expect(budgetStatus(0, 0)).toBe('ok');
    expect(budgetStatus(1, 0)).toBe('danger');
    expect(budgetStatus(-500, 10000)).toBe('ok');
    expect(budgetStatus(-500, 0)).toBe('ok');
  });

  it('rejects floats', () => {
    expect(() => budgetStatus(1.5, 100)).toThrow(RangeError);
    expect(() => budgetStatus(1, 100.5)).toThrow(RangeError);
  });
});

describe('progressPermille', () => {
  it('maps spent/budget to 0..1000', () => {
    expect(progressPermille(0, 10000)).toBe(0);
    expect(progressPermille(2500, 10000)).toBe(250);
    expect(progressPermille(1, 3)).toBe(333);
    expect(progressPermille(2, 3)).toBe(666);
    expect(progressPermille(10000, 10000)).toBe(1000);
  });

  it('clamps overspending and refunds', () => {
    expect(progressPermille(50000, 10000)).toBe(1000);
    expect(progressPermille(-100, 10000)).toBe(0);
  });

  it('handles empty budgets', () => {
    expect(progressPermille(0, 0)).toBe(0);
    expect(progressPermille(1, 0)).toBe(1000);
  });
});
