// Round controller: RGS flow (authenticate -> play -> animate book -> end-round), autoplay, resume and
// replay. The outcome always comes from the RGS book; the frontend only animates it.

import { game, modeCost, type ModeId } from './state/game.svelte';
import { rgs, RgsFailure, eventsFromState, type AuthResponse } from './rgs';
import { buildBetLevels, loadPersistedBet, persistBet, pickInitialBet } from './state/bets';
import type { LaunchParams } from './url';
import type { BookEvent, BookEventOfType } from './model/bookTypes';
import { bookToMoney } from './money';
import { clock } from './stage/clock';
import { sound } from './sound';

type Player = { play: (events: BookEvent[]) => Promise<unknown> };

let params: LaunchParams;
let player: Player;
let onRoundEnd: (() => void) | null = null;

export function setupRound(p: LaunchParams, pl: Player) {
	params = p;
	player = pl;
}
export function onRoundFinished(cb: () => void) {
	onRoundEnd = cb;
}

function fail(e: unknown, fatal = false) {
	const code = e instanceof RgsFailure ? e.code : 'ERR_GEN';
	game.error = { code, fatal: fatal || code === 'ERR_IS' };
	game.modal = 'error';
	game.autoplay = null;
}

export async function authenticate(): Promise<AuthResponse | null> {
	if (!params.sessionID || !params.rgsUrl) {
		game.error = { code: 'noSession', fatal: true };
		game.modal = 'error';
		return null;
	}
	try {
		const auth = await rgs.authenticate(params.rgsUrl, params.sessionID, params.lang);
		game.balance = auth.balance.amount;
		game.currency = auth.balance.currency || params.currency || 'USD';
		game.jurisdiction = auth.config.jurisdiction ?? {};
		if (game.jurisdiction.disabledTurbo) game.turbo = false;
		game.betLevels = buildBetLevels(auth.config);
		const resumeAmount = auth.round && auth.round.active !== false && typeof auth.round.amount === 'number' ? auth.round.amount : null;
		game.bet = pickInitialBet(game.betLevels, auth.config, loadPersistedBet(game.currency), resumeAmount);
		return auth;
	} catch (e) {
		fail(e, true);
		return null;
	}
}

/** An unfinished round from authenticate: show it, then end it (REQUIREMENTS §4). */
export async function resumeRound(round: NonNullable<AuthResponse['round']>) {
	const events = eventsFromState(round.state);
	if (!events.length) return;
	game.modal = 'resume';
	await clock.wait(1200);
	game.modal = null;
	game.phase = 'playing';
	game.roundMode = (round.mode as ModeId) ?? 'base';
	game.roundBet = typeof round.amount === 'number' ? round.amount : game.bet;
	game.totalWin = 0;
	await animate(events, events.find((e) => e.type === 'finalWin') as BookEventOfType<'finalWin'> | undefined);
	try {
		// An active round is only left open by the RGS when it pays, so it always needs end-round.
		const r = await rgs.endRound(params.rgsUrl, params.sessionID);
		game.balance = r.balance.amount;
	} catch (e) {
		fail(e);
	}
	game.phase = 'idle';
}

export function setBet(amount: number) {
	if (game.busy) return;
	game.bet = amount;
	persistBet(game.currency, amount);
}

export function stepBet(dir: -1 | 1) {
	const i = game.betLevels.indexOf(game.bet);
	const j = Math.max(0, Math.min(game.betLevels.length - 1, (i < 0 ? 0 : i) + dir));
	setBet(game.betLevels[j]);
}

/**
 * Animate a book. A presentation failure must never strand a round: the result is already decided by the RGS,
 * so on error the animation is flushed and the book's final win is shown, and the caller still settles the round.
 */
async function animate(events: BookEvent[], fin?: BookEventOfType<'finalWin'>) {
	try {
		await player.play(events);
	} catch {
		clock.skipping = true;
		clock.flush();
		if (fin) game.totalWin = fin.amount;
	}
}

/** Play one round in `mode`. Returns the raw payout or null on error. */
export async function playRound(mode: ModeId = game.activeMode): Promise<number | null> {
	if (game.busy || params.replay) return null;
	const cost = Math.round(game.bet * modeCost(mode));
	if (game.balance < cost) {
		game.error = { code: 'ERR_IPB', fatal: false };
		game.modal = 'error';
		game.autoplay = null;
		return null;
	}
	game.phase = 'playing';
	game.skipRequested = false;
	clock.skipping = false;
	game.roundMode = mode;
	game.roundBet = game.bet;
	game.totalWin = 0;
	game.spinWin = 0;
	game.lastFeatureTriggered = false;
	sound.play('ui_click');
	let payoutRaw = 0;
	let res: Awaited<ReturnType<typeof rgs.play>>;
	try {
		res = await rgs.play(params.rgsUrl, params.sessionID, game.bet, mode, game.currency);
	} catch (e) {
		fail(e);
		game.phase = 'idle';
		clock.skipping = false;
		return null;
	}
	game.balance = res.balance.amount;
	const events = eventsFromState(res.round.state);
	const payoutX = Number(res.round.payoutMultiplier ?? 0);
	// The book's finalWin (hundredths of the bet) is the authoritative payout; the RGS float is a fallback.
	const fin = events.find((e) => e.type === 'finalWin') as BookEventOfType<'finalWin'> | undefined;
	payoutRaw = fin ? bookToMoney(fin.amount, game.bet) : Math.round(game.bet * payoutX);
	await animate(events, fin);
	game.phase = 'ending';
	// A paying round stays open on the RGS until end-round (REQUIREMENTS §4); never leave one open.
	if (payoutRaw > 0 || payoutX > 0 || res.round.active === true) {
		try {
			const end = await rgs.endRound(params.rgsUrl, params.sessionID);
			game.balance = end.balance.amount;
		} catch (e) {
			fail(e);
			game.phase = 'idle';
			clock.skipping = false;
			return null;
		}
	}
	game.lastPayoutRaw = payoutRaw;
	clock.skipping = false;
	game.phase = 'idle';
	onRoundEnd?.();
	return payoutRaw;
}

export function requestSkip() {
	if (game.phase === 'playing' && !game.jurisdiction.disabledSlamstop) {
		game.skipRequested = true;
		clock.skipping = true;
		clock.flush();
	}
}

export type AutoplaySettings = {
	spins: number;
	stopOnFeature: boolean;
	stopOnWinX: number | null;
	stopBalanceUp: number | null;
	stopBalanceDown: number | null;
};

export async function startAutoplay(s: AutoplaySettings) {
	if (game.jurisdiction.disabledAutoplay) return;
	game.autoplay = { remaining: s.spins, ...s, startBalance: game.balance };
	while (game.autoplay && game.autoplay.remaining > 0) {
		game.autoplay.remaining--;
		const before = game.balance;
		const payout = await playRound(game.activeMode);
		if (payout === null || !game.autoplay) break;
		const a = game.autoplay;
		const won = payout;
		if (a.stopOnFeature && game.lastFeatureTriggered) break;
		if (a.stopOnWinX !== null && won >= a.stopOnWinX * game.bet) break;
		const delta = game.balance - a.startBalance;
		if (a.stopBalanceUp !== null && delta >= a.stopBalanceUp) break;
		if (a.stopBalanceDown !== null && -delta >= a.stopBalanceDown) break;
		void before;
		await clock.wait(game.turbo ? 120 : 350);
	}
	game.autoplay = null;
}

export function stopAutoplay() {
	game.autoplay = null;
}

// ------------------------------------------------------------------------------------------ replay

export async function loadReplay() {
	game.phase = 'loading';
	try {
		const r = await rgs.replay(params.rgsUrl, params.game, params.version, params.mode, params.event);
		const betRaw = params.amount ?? 1_000_000; // default 1 USD / 1 SC for display (REQUIREMENTS §6)
		game.replay = {
			mode: params.mode,
			costMultiplier: Number(r.costMultiplier ?? 1),
			payoutMultiplier: Number(r.payoutMultiplier ?? 0),
			betRaw,
		};
		replayEvents = eventsFromState(r.state);
		game.bet = betRaw;
		game.roundBet = betRaw;
		if (!params.currency) game.currency = params.social ? 'XSC' : 'USD';
		else game.currency = params.currency;
		game.phase = 'replayReady';
	} catch {
		game.error = { code: 'replay', fatal: true };
		game.phase = 'error';
	}
}

let replayEvents: BookEvent[] = [];
export async function playReplay() {
	if (!replayEvents.length) return;
	game.phase = 'playing';
	game.totalWin = 0;
	game.spinWin = 0;
	clock.skipping = false;
	await animate(replayEvents, replayEvents.find((e) => e.type === 'finalWin') as BookEventOfType<'finalWin'> | undefined);
	clock.skipping = false;
	game.phase = 'replayDone';
}
