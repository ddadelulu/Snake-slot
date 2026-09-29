import { describe, expect, it } from 'vitest';
import { buildBetLevels, pickInitialBet } from '../../src/game/state/bets';

const U = 1_000_000;
describe('bet levels', () => {
	it('uses every level from authenticate, min and max included', () => {
		const cfg = { minBet: 0.1 * U, maxBet: 1000 * U, stepBet: 0.01 * U, defaultBetLevel: U, betLevels: [0.1, 0.2, 1, 2, 10, 100, 1000].map((x) => x * U) };
		const lv = buildBetLevels(cfg);
		expect(lv[0]).toBe(0.1 * U);
		expect(lv[lv.length - 1]).toBe(1000 * U);
		expect(lv).toEqual([...lv].sort((a, b) => a - b));
		expect(pickInitialBet(lv, cfg, null)).toBe(U);
	});
	it('builds the ladder from min/max/step when no list is given', () => {
		const cfg = { minBet: 10 * U, maxBet: 150_000 * U, stepBet: 10 * U, defaultBetLevel: 100 * U, betLevels: [] };
		const lv = buildBetLevels(cfg);
		expect(lv[0]).toBe(10 * U);
		expect(lv.includes(150_000 * U)).toBe(true);
		for (const v of lv) expect((v - cfg.minBet) % cfg.stepBet).toBe(0);
	});
	it('restores a persisted bet and prefers an unfinished round amount', () => {
		const cfg = { minBet: U, maxBet: 100 * U, stepBet: U, defaultBetLevel: U, betLevels: [U, 2 * U, 5 * U, 100 * U] };
		const lv = buildBetLevels(cfg);
		expect(pickInitialBet(lv, cfg, 5 * U)).toBe(5 * U);
		expect(pickInitialBet(lv, cfg, 5 * U, 2 * U)).toBe(2 * U);
		expect(pickInitialBet(lv, cfg, 7 * U)).toBe(U); // stale persisted value ignored
	});
});
