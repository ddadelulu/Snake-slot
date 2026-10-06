import { describe, expect, it } from 'vitest';
import { formatMoney, bookToMoney, CURRENCIES } from '../../src/game/money';

describe('formatMoney', () => {
	it('formats USD with 2 decimals and grouping', () => {
		expect(formatMoney(1_000_000, 'USD')).toBe('$1.00');
		expect(formatMoney(100_000, 'USD')).toBe('$0.10');
		expect(formatMoney(1_234_567_890_000, 'USD')).toBe('$1,234,567.89');
	});
	it('shows sub-cent amounts exactly, never $0.00 or rounded up (#273)', () => {
		expect(formatMoney(5_000, 'USD')).toBe('$0.005'); // 0.1x on a $0.05 bet
		expect(formatMoney(15_000, 'USD')).toBe('$0.015');
		expect(formatMoney(9_999, 'USD')).toBe('$0.009999');
		expect(formatMoney(1_999_999, 'USD')).toBe('$1.999999');
		expect(formatMoney(500_000, 'JPY')).toBe('¥0.5');
		expect(formatMoney(3_000, 'XSC')).toBe('0.003 SC');
		expect(formatMoney(0, 'USD')).toBe('$0.00');
	});
	it('count-up frames can floor to the currency decimals', () => {
		expect(formatMoney(1_999_999, 'USD', { exact: false })).toBe('$1.99');
		expect(formatMoney(5_000, 'USD', { exact: false })).toBe('$0.00');
	});
	it('formats the Engine test currencies (#219)', () => {
		const ten = 10_000_000;
		expect(formatMoney(ten, 'USD')).toBe('$10.00');
		expect(formatMoney(ten, 'EUR')).toBe('€10.00');
		expect(formatMoney(ten, 'CAD')).toBe('CA$10.00');
		expect(formatMoney(ten, 'MXN')).toBe('MX$10.00');
		expect(formatMoney(ten, 'JPY')).toBe('¥10');
		expect(formatMoney(ten, 'XSC')).toBe('10.00 SC');
		expect(formatMoney(ten, 'XGC')).toBe('10.00 GC');
		expect(formatMoney(ten, 'XEC')).toBe('10.00 SC');
	});
	it('uses 0 decimals for JPY/IDR/KRW/VND/CLP', () => {
		expect(formatMoney(100_000_000, 'JPY')).toBe('¥100');
		for (const c of ['JPY', 'IDR', 'KRW', 'VND', 'CLP']) expect(CURRENCIES[c].decimals).toBe(0);
	});
	it('shows social coins without a $ (suffix GC / SC)', () => {
		expect(formatMoney(1_000_000, 'XGC')).toBe('1.00 GC');
		expect(formatMoney(2_500_000, 'XSC')).toBe('2.50 SC');
		expect(formatMoney(2_500_000, 'XSC')).not.toContain('$');
	});
	it('falls back gracefully for unknown codes', () => {
		expect(formatMoney(1_000_000, 'ZZZ')).toBe('1.00 ZZZ');
		expect(formatMoney(1_000_000, '')).toBe('1.00 ');
	});
	it('covers the 34 fiat currencies plus XGC and XSC', () => {
		expect(Object.keys(CURRENCIES).length).toBeGreaterThanOrEqual(36);
	});
});

describe('bookToMoney', () => {
	it('converts book hundredths of the bet to raw money exactly', () => {
		expect(bookToMoney(1150, 1_000_000)).toBe(11_500_000); // 11.5x of $1
		expect(bookToMoney(2_500_000, 100_000)).toBe(2_500_000_000); // 25,000x of $0.10
		expect(bookToMoney(10, 100_000)).toBe(10_000); // 0.1x of $0.10
	});
});
