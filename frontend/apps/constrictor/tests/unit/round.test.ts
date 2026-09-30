// Round settlement: a paying round is always ended on the RGS, even if the presentation fails midway.
import { describe, expect, it, vi, beforeEach } from 'vitest';

const endRound = vi.fn(async () => ({ balance: { amount: 10_050_000, currency: 'USD' } }));
const play = vi.fn(async () => ({
	balance: { amount: 9_000_000, currency: 'USD' },
	round: { payoutMultiplier: 1.5, active: true, state: [{ index: 0, type: 'finalWin', amount: 150 }] },
}));
vi.mock('../../src/game/rgs', async (orig) => {
	const real = (await orig()) as Record<string, unknown>;
	return { ...real, rgs: { play, endRound } };
});
vi.mock('../../src/game/sound', () => ({ sound: { play: () => {}, loop: () => {}, stop: () => {} } }));

const { setupRound, playRound } = await import('../../src/game/round');
const { game } = await import('../../src/game/state/game.svelte');

const params = { sessionID: 's', rgsUrl: 'http://rgs', lang: 'en', currency: 'USD', device: null, social: false, demo: false, replay: false, game: '', version: '', mode: '', event: '', amount: null, dev: false };

describe('round settlement', () => {
	beforeEach(() => {
		endRound.mockClear();
		game.phase = 'idle';
		game.modal = null;
		game.balance = 10_000_000;
		game.bet = 1_000_000;
		game.anteOn = false;
	});
	it('ends a paying round even when the animation throws, and shows the book win', async () => {
		setupRound(params as never, { play: async () => { throw new Error('render failed'); } });
		const payout = await playRound('base');
		expect(endRound).toHaveBeenCalledTimes(1);
		expect(payout).toBe(1_500_000);
		expect(game.totalWin).toBe(150);
		expect(game.balance).toBe(10_050_000);
		expect(game.phase).toBe('idle');
	});
	it('does not call end-round for a zero-payout round', async () => {
		play.mockResolvedValueOnce({ balance: { amount: 9_000_000, currency: 'USD' }, round: { payoutMultiplier: 0, active: false, state: [{ index: 0, type: 'finalWin', amount: 0 }] } } as never);
		setupRound(params as never, { play: async () => {} });
		await playRound('base');
		expect(endRound).not.toHaveBeenCalled();
	});
	it('refuses to play without enough balance (no RGS call)', async () => {
		play.mockClear();
		game.balance = 500_000;
		setupRound(params as never, { play: async () => {} });
		expect(await playRound('base')).toBeNull();
		expect(play).not.toHaveBeenCalled();
		expect(game.error?.code).toBe('ERR_IPB');
	});
});
