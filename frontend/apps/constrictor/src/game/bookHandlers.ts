// bookEventHandlerMap (web-sdk architecture): one async handler per book event type. Handlers update the
// reactive HUD state and await the stage animations. Nothing here decides an outcome: every value shown
// comes from the event.

import { createPlayBookUtils } from 'utils-book/src/createPlayBookUtils';
import type { BookEvent, BookEventOfType } from './model/bookTypes';
import { game } from './state/game.svelte';
import { eventEmitter } from './emitter';
import type { Stage } from './stage/Stage';
import { clock } from './stage/clock';
import { sound } from './sound';

type Ctx = { bookEvents: BookEvent[] };
type Handler<T extends BookEvent['type']> = (ev: BookEventOfType<T>, ctx: Ctx) => Promise<void>;
type HandlerMap = { [T in BookEvent['type']]: Handler<T> };

export function createBookPlayer(stage: Stage) {
	let featureBase = 0; // round total when the feature started (feature win = total - featureBase)
	const handlers: HandlerMap = {
		reveal: async (ev) => {
			game.moves = null;
			game.spinWin = 0;
			stage.board.clearWins();
			await stage.reveal(ev.board, ev.keys, ev.gameType);
		},
		hatch: async (ev) => {
			game.snakeLen = 1;
			game.snakeMult = 1;
			await stage.hatch(ev.at);
		},
		enterBonus: async (ev) => {
			game.feature = ev.reason;
		},
		freeSpinTrigger: async (ev) => {
			if (ev.positions.length) {
				sound.play('key_land');
				await stage.board.pulseKeys(ev.positions);
			}
			game.lastFeatureTriggered = true;
			const feature = game.feature ?? 'hunt';
			game.feature = feature;
			sound.play('vault_door');
			await eventEmitter.broadcastAsync({ type: 'featureIntro', feature, spins: ev.totalFs, keys: ev.keys });
			game.fs = { current: 0, total: ev.totalFs };
			game.featureWin = 0;
			featureBase = game.totalWin;
			sound.stop('music_base', 0.6);
			sound.loop('music_hunt', { music: true, volume: 0.9 });
			sound.loop('music_hunt_layer', { music: true, volume: 0 });
			stage.board.keyGlow([], false);
		},
		snakeEnter: async (ev) => {
			stage.clearSnake();
			game.snakeLen = ev.body.length;
			game.snakeMult = ev.mult;
			await stage.snakeEnter(ev.body, ev.edge);
		},
		updateFreeSpin: async (ev) => {
			game.fs = { current: ev.amount, total: ev.total };
			game.spinWin = 0;
		},
		snakeMoves: async (ev) => {
			game.moves = { left: ev.moves, total: ev.moves };
			await eventEmitter.broadcastAsync({ type: 'movesStart', n: ev.moves });
			await clock.wait(stage.speedMs(260, 80));
			await stage.moveSnake(ev.steps, (i, st) => {
				game.moves = { left: ev.moves - (i + 1), total: ev.moves };
				game.snakeLen = st.len;
				if (st.mult !== game.snakeMult) {
					game.snakeMult = st.mult;
					sound.play('mult_tick', { rate: 1 + Math.min(0.6, st.mult / 60) });
					eventEmitter.broadcast({ type: 'multSlam', value: st.mult, big: false });
				}
			});
			// the Hunt music layers up as the multiplier grows
			if (game.fs) sound.loopVolume('music_hunt_layer', Math.min(0.9, (game.snakeMult - 1) / 20));
		},
		ouroboros: async (ev) => {
			eventEmitter.broadcast({ type: 'ouroborosTitle' });
			await stage.ouroboros(ev, () => {
				game.snakeMult = ev.mult;
				eventEmitter.broadcast({ type: 'multSlam', value: ev.mult, big: true });
			});
		},
		snakeWild: async (ev) => {
			game.snakeLen = ev.cells.length;
			await stage.showWild(ev.cells);
		},
		winInfo: async (ev) => {
			await stage.showWins(ev.wins);
		},
		setWin: async (ev) => {
			game.spinWin = ev.amount;
			// Free spins: only DEVOUR and above stop the feature for a full banner; smaller wins get a quick pop.
			const minLevel = game.fs ? 3 : 1;
			if (ev.winLevel >= minLevel && ev.winLevel <= 4) {
				await eventEmitter.broadcastAsync({ type: 'tierWin', level: ev.winLevel, amount: ev.amount });
			} else {
				eventEmitter.broadcast({ type: 'spinWin', amount: ev.amount });
			}
		},
		setTotalWin: async (ev) => {
			game.totalWin = ev.amount;
			if (game.fs) game.featureWin = ev.amount - featureBase;
			await clock.wait(stage.speedMs(250, 60));
		},
		wincap: async (ev) => {
			game.totalWin = ev.amount;
			await eventEmitter.broadcastAsync({ type: 'maxWin', amount: ev.amount });
		},
		freeSpinRetrigger: async (ev) => {
			game.fs = { current: game.fs?.current ?? 0, total: ev.totalFs };
			sound.play('key_land');
			await stage.board.pulseKeys(ev.positions);
			await eventEmitter.broadcastAsync({ type: 'retrigger', added: ev.added, total: ev.totalFs });
		},
		snakeExit: async () => {
			await stage.snakeExit();
			game.moves = null;
			game.snakeLen = 0;
			game.snakeMult = 1;
		},
		freeSpinEnd: async (ev) => {
			await eventEmitter.broadcastAsync({ type: 'featureOutro', amount: ev.amount, level: ev.winLevel, capped: game.totalWin >= 2_500_000 });
			sound.stop('music_hunt', 0.8);
			sound.stop('music_hunt_layer', 0.8);
			sound.loop('music_base', { music: true, volume: 0.7, fade: 1.5 });
			game.fs = null;
			game.feature = null;
			game.moves = null;
			game.snakeLen = 0;
			game.snakeMult = 1;
			stage.clearSnake();
			stage.board.clearWins();
		},
		finalWin: async (ev) => {
			game.totalWin = ev.amount;
		},
	};
	const { playBookEvents } = createPlayBookUtils({ bookEventHandlerMap: handlers as never });
	return {
		play: (events: BookEvent[]) => playBookEvents(events as never, {} as never),
		handlers,
	};
}
