// Reactive game state (Svelte 5 runes), in the web-sdk "state module" style.

import mathConfig from '../generated/mathConfig.json';
import type { JurisdictionFlags } from '../rgs';

export type ModeId = 'base' | 'ante' | 'hunt' | 'venom';
export type Phase = 'boot' | 'loading' | 'intro' | 'idle' | 'playing' | 'ending' | 'error' | 'replayReady' | 'replayDone';

export const MODES = mathConfig.modes as { id: ModeId; cost: number; kind: string; rtp: number; maxWin: number }[];
export const modeCost = (id: ModeId) => MODES.find((m) => m.id === id)?.cost ?? 1;

class GameState {
	phase = $state<Phase>('boot');
	balance = $state(0); // raw RGS units
	currency = $state('USD');
	betLevels = $state<number[]>([]);
	bet = $state(1_000_000); // base bet (raw)
	anteOn = $state(false);
	jurisdiction = $state<JurisdictionFlags>({});
	// displays (hundredths of the base bet, from the book)
	spinWin = $state(0);
	totalWin = $state(0);
	featureWin = $state(0);
	// feature / snake HUD
	fs = $state<{ current: number; total: number } | null>(null);
	feature = $state<'hunt' | 'venom' | null>(null);
	moves = $state<{ left: number; total: number } | null>(null);
	snakeLen = $state(0);
	snakeMult = $state(1);
	// round bookkeeping
	roundMode = $state<ModeId>('base');
	roundBet = $state(0); // base bet of the round in play (raw)
	lastPayoutRaw = $state(0);
	lastFeatureTriggered = $state(false);
	// UI state
	turbo = $state(false);
	reducedMotion = $state(false);
	soundOn = $state(true);
	musicVolume = $state(0.6);
	sfxVolume = $state(0.8);
	modal = $state<null | 'rules' | 'buy' | 'autoplay' | 'settings' | 'bet' | 'confirmBuy' | 'confirmAnte' | 'error' | 'resume'>(null);
	pendingBuy = $state<ModeId | null>(null);
	error = $state<{ code: string; fatal: boolean } | null>(null);
	autoplay = $state<{
		remaining: number;
		stopOnFeature: boolean;
		stopOnWinX: number | null;
		stopBalanceUp: number | null;
		stopBalanceDown: number | null;
		startBalance: number;
	} | null>(null);
	skipRequested = $state(false);
	tierBanner = $state<{ level: number; amount: number } | null>(null);
	// replay
	replay = $state<{ mode: string; costMultiplier: number; payoutMultiplier: number; betRaw: number } | null>(null);

	get activeMode(): ModeId {
		return this.anteOn ? 'ante' : 'base';
	}
	get spinCost(): number {
		return Math.round(this.bet * modeCost(this.activeMode));
	}
	get busy(): boolean {
		return this.phase === 'playing' || this.phase === 'ending';
	}
}

export const game = new GameState();
