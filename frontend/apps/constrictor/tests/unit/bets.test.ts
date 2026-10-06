import { describe, expect, it } from 'vitest';
import { buildBetLevels, pickInitialBet } from '../../src/game/state/bets';

const U = 1_000_000;
describe('bet levels', () => {
	it('uses exactly the levels from authenticate', () => {
		const cfg = { minBet: 0.1 * U, maxBet: 1000 * U, stepBet: 0.01 * U, defaultBetLevel: U, betLevels: [0.1, 0.2, 1, 2, 10, 100, 1000].map((x) => x * U) };
		const lv = buildBetLevels(cfg);
		expect(lv).toEqual(cfg.betLevels);
		expect(pickInitialBet(lv, cfg)).toBe(U);
	});
	it('never adds minBet / maxBet when betLevels does not list them', () => {
		const cfg = { minBet: 0.1 * U, maxBet: 50 * U, stepBet: 0.1 * U, defaultBetLevel: U, betLevels: [0.2, 1, 5].map((x) => x * U) };
		expect(buildBetLevels(cfg)).toEqual([0.2, 1, 5].map((x) => x * U));
	});
	it('trims levels outside minBet..maxBet', () => {
		const cfg = { minBet: U, maxBet: 2 * U, stepBet: 0.25 * U, defaultBetLevel: 1.5 * U, betLevels: [0.5, 1, 1.25, 1.5, 1.75, 2, 3].map((x) => x * U) };
		expect(buildBetLevels(cfg)).toEqual([1, 1.25, 1.5, 1.75, 2].map((x) => x * U));
	});
	it('opens on defaultBetLevel (reviewer check: 1.00-2.00 in 4 steps, default in the middle)', () => {
		const cfg = { minBet: U, maxBet: 2 * U, stepBet: 0.25 * U, defaultBetLevel: 1.5 * U, betLevels: [1, 1.25, 1.5, 1.75, 2].map((x) => x * U) };
		expect(pickInitialBet(buildBetLevels(cfg), cfg)).toBe(1.5 * U);
	});
	it('builds the ladder from min/max/step when no list is given', () => {
		const cfg = { minBet: 10 * U, maxBet: 150_000 * U, stepBet: 10 * U, defaultBetLevel: 100 * U, betLevels: [] };
		const lv = buildBetLevels(cfg);
		expect(lv[0]).toBe(10 * U);
		expect(lv.includes(150_000 * U)).toBe(true);
		for (const v of lv) expect((v - cfg.minBet) % cfg.stepBet).toBe(0);
	});
	it('an unfinished round amount wins over the default', () => {
		const cfg = { minBet: U, maxBet: 100 * U, stepBet: U, defaultBetLevel: U, betLevels: [U, 2 * U, 5 * U, 100 * U] };
		const lv = buildBetLevels(cfg);
		expect(pickInitialBet(lv, cfg, 5 * U)).toBe(5 * U);
		expect(pickInitialBet(lv, cfg, null)).toBe(U);
		expect(pickInitialBet(lv, cfg, 7 * U)).toBe(U); // not a level: fall back to the default
	});
});
