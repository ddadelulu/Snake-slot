// RGS layer on top of the web-sdk's rgs-fetcher (REQUIREMENTS §4, §6). Amounts are integer RGS units.

import { rgsFetcher } from 'rgs-fetcher';
import type { Book, BookEvent } from './model/bookTypes';

export type RgsError = { error: string; message?: string };
export type Balance = { amount: number; currency: string };
export type JurisdictionFlags = Partial<{
	socialCasino: boolean;
	disabledFullscreen: boolean;
	disabledTurbo: boolean;
	disabledSuperTurbo: boolean;
	disabledAutoplay: boolean;
	disabledSlamstop: boolean;
	disabledSpacebar: boolean;
	disabledBuyFeature: boolean;
	displayNetPosition: boolean;
	displayRTP: boolean;
	displaySessionTimer: boolean;
	minimumRoundDuration: number;
}>;
export type RgsRound = {
	active?: boolean;
	mode?: string;
	event?: string | number;
	amount?: number;
	payoutMultiplier?: number;
	costMultiplier?: number;
	state?: BookEvent[] | Book | { events: BookEvent[] };
	[k: string]: unknown;
};
export type AuthResponse = {
	balance: Balance;
	round: RgsRound | null;
	config: {
		gameID?: string;
		minBet: number;
		maxBet: number;
		stepBet: number;
		defaultBetLevel: number;
		betLevels: number[];
		betModes?: Record<string, unknown>;
		jurisdiction?: JurisdictionFlags;
	};
};
export type PlayResponse = { balance: Balance; round: RgsRound };
export type ReplayResponse = { payoutMultiplier: number; costMultiplier: number; state: RgsRound['state'] };

export const isRgsError = (x: unknown): x is RgsError =>
	!!x && typeof x === 'object' && typeof (x as RgsError).error === 'string' && !(x as { balance?: unknown }).balance;

class RgsFailure extends Error {
	code: string;
	constructor(code: string, message?: string) {
		super(message ?? code);
		this.code = code;
	}
}
export { RgsFailure };

async function guard<T>(p: Promise<unknown>): Promise<T> {
	let data: unknown;
	try {
		data = await p;
	} catch {
		throw new RgsFailure('network');
	}
	if (isRgsError(data)) throw new RgsFailure(data.error, data.message);
	return data as T;
}

export const rgs = {
	authenticate: (rgsUrl: string, sessionID: string, language: string) =>
		guard<AuthResponse>(
			rgsFetcher.post({ url: '/wallet/authenticate', rgsUrl, variables: { sessionID, language } as never }),
		),
	play: (rgsUrl: string, sessionID: string, amount: number, mode: string, currency: string) =>
		guard<PlayResponse>(
			rgsFetcher.post({
				url: '/wallet/play',
				rgsUrl,
				variables: { sessionID, amount: Math.round(amount), mode, currency } as never,
			}),
		),
	endRound: (rgsUrl: string, sessionID: string) =>
		guard<{ balance: Balance }>(rgsFetcher.post({ url: '/wallet/end-round', rgsUrl, variables: { sessionID } as never })),
	balance: (rgsUrl: string, sessionID: string) =>
		guard<{ balance: Balance }>(rgsFetcher.post({ url: '/wallet/balance', rgsUrl, variables: { sessionID } as never })),
	event: (rgsUrl: string, sessionID: string, event: string) =>
		guard<{ event: string }>(rgsFetcher.post({ url: '/bet/event', rgsUrl, variables: { sessionID, event } as never })),
	replay: (rgsUrl: string, game: string, version: string, mode: string, event: string) =>
		guard<ReplayResponse>(
			rgsFetcher.get({
				url: `/bet/replay/${encodeURIComponent(game)}/${encodeURIComponent(version)}/${encodeURIComponent(mode)}/${encodeURIComponent(event)}`,
				rgsUrl,
			}),
		),
};

/** The RGS returns the book in round.state (either the events array or the whole book). */
export function eventsFromState(state: RgsRound['state']): BookEvent[] {
	if (!state) return [];
	if (Array.isArray(state)) return state as BookEvent[];
	if (Array.isArray((state as { events?: unknown }).events)) return (state as { events: BookEvent[] }).events;
	return [];
}
