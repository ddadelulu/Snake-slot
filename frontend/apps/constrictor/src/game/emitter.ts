// UI overlay events (web-sdk event-emitter pattern): handlers broadcast, Svelte components subscribe.
import { createEventEmitter } from 'utils-event-emitter/src/createEventEmitter';

export type EmitterEvent =
	| { type: 'tierWin'; level: number; amount: number }
	| { type: 'featureIntro'; feature: 'hunt' | 'venom'; spins: number; keys: number }
	| { type: 'featureOutro'; amount: number; level: number; capped: boolean }
	| { type: 'retrigger'; added: number; total: number }
	| { type: 'ouroborosTitle' }
	| { type: 'multSlam'; value: number; big: boolean }
	| { type: 'maxWin'; amount: number }
	| { type: 'movesStart'; n: number };

export const { eventEmitter } = createEventEmitter<EmitterEvent>();
