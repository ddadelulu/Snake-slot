// Player-facing rules (SPEC §14). Every number comes from generated/mathConfig.json (exported by the
// math), never re-typed. Text goes through tx() so social mode gets its wording.

import mathConfig from '../generated/mathConfig.json';
import { tx } from './index';

export type RulesSection = { id: string; title: string; paragraphs: string[] };

const pct = (x: number) => `${(x * 100).toFixed(2)}%`;
const oneIn = (p: number) => Math.round(1 / p).toLocaleString('en-US');
const list = (xs: (number | string)[]) => xs.map((v) => `+${v}`).join(', ');

export function modeRtp(id: string): number {
	return mathConfig.modes.find((m) => m.id === id)?.rtp ?? 0.96;
}

export function anteFactor(): number {
	const b = mathConfig.modes.find((m) => m.id === 'base')?.huntTrigger ?? 1;
	const a = mathConfig.modes.find((m) => m.id === 'ante')?.huntTrigger ?? 1;
	return Math.round((a / b) * 10) / 10;
}

export function rulesSections(): RulesSection[] {
	const fs = mathConfig.freeSpins;
	const sn = mathConfig.snake;
	const pe = mathConfig.pearls;
	const base = mathConfig.modes.find((m) => m.id === 'base')!;
	const ante = mathConfig.modes.find((m) => m.id === 'ante')!;
	const maxWin = mathConfig.maxWin.toLocaleString('en-US');
	const S: RulesSection[] = [
		{
			id: 'overview',
			title: 'HOW TO PLAY',
			paragraphs: [
				`CONSTRICTOR is played on a 7×7 grid. Symbols pay in clusters: 5 or more of the same symbol connected horizontally or vertically (not diagonally). All wins are multiplied by the bet.`,
				`Each winning cluster pays according to the paytable for its symbol and size. Clusters of different symbols are evaluated separately, and all cluster wins of a spin are added together.`,
				`The outcome of every round is decided by the game server when the round starts. Animations only show that result.`,
			],
		},
		{
			id: 'egg',
			title: 'THE EGG AND THE SNAKE',
			paragraphs: [
				`At most one EGG can land on a base game board. When it lands, a snake hatches on the EGG's cell. It starts with length 1 and unfurls to length ${sn.hatchLength} over its first two moves.`,
				`The MOVES counter shows how many moves the snake makes this spin (${sn.movesBase[0]} to ${sn.movesBase[1]} in the base game, ${sn.movesFree[0]} to ${sn.movesFree[1]} in free spins). Each move takes the head one cell up, down, left or right. The snake never leaves the grid and never crosses its own body.`,
				`When the snake leaves a cell at its tail, that cell is left EMPTY. The snake eats whatever its head moves onto. Eaten symbols and KEYs are covered by the body. KEYs are counted when they land, before the snake moves.`,
				`The snake's whole body is WILD. Wild cells substitute for every paying symbol and can be part of clusters of several different symbols in the same spin. A cluster must contain at least one real symbol; a group made only of wild cells does not pay. EMPTY cells, KEYs and uneaten PEARLs block clusters.`,
				`At the end of a base game spin the snake slithers off the board. Nothing carries over to the next spin.`,
			],
		},
		{
			id: 'pearls',
			title: 'PEARLS AND THE MULTIPLIER',
			paragraphs: [
				`PEARLs only land together with an EGG in the base game, and on any free spin. Each PEARL shows its value: White +1, Gold +2, Rose +3, Black +5, Venom +10 (free spins only) and Venom +25 (VENOM HUNT only).`,
				`When the snake eats a PEARL, the pearl's value is added to the multiplier and the snake grows by one segment. The multiplier starts at ×1. The whole spin win (the sum of all cluster wins) is multiplied by it.`,
				`The snake can grow to a length of ${sn.lengthCap}. After that, eaten PEARLs still add to the multiplier but the snake no longer grows. PEARLs the snake does not eat have no effect and do not pay.`,
				`Base game values: ${list(pe.base)}. THE HUNT: ${list(pe.hunt)}. VENOM HUNT: ${list(pe.venom)}.`,
			],
		},
		{
			id: 'ouroboros',
			title: 'OUROBOROS',
			paragraphs: [
				`When the snake is at least ${sn.minBiteLength} long and is not still growing, its head can bite its own tail. If the closed ring encloses at least one cell, OUROBOROS happens.`,
				`Every enclosed cell is constricted into the highest-paying symbol found inside the ring (H1 if there is none). Enclosed KEYs, PEARLs and EMPTY cells are changed too. Crushed PEARLs add nothing.`,
				`The multiplier is doubled. The ring is the snake's body, so it stays WILD for the win evaluation.`,
				`The bite is always the snake's last move of the spin. Any moves left on the counter are forfeited. OUROBOROS can happen at most once per spin, and several times in one bonus round. It needs a long snake, so it is seen mostly during free spins.`,
			],
		},
		{
			id: 'hunt',
			title: 'THE HUNT (FREE SPINS)',
			paragraphs: [
				`3, 4 or 5 KEYs anywhere on a base game board award ${fs.awards['3']}, ${fs.awards['4']} or ${fs.awards['5']} free spins of THE HUNT. The base spin is completed first.`,
				`A snake of length ${fs.huntLength} with a ×${fs.huntMult} multiplier enters the board from an edge. It stays on the board for the whole feature: its position, length and multiplier carry over from spin to spin. The multiplier never resets during the feature.`,
				`Each free spin, new symbols land in every cell the snake does not occupy, then the snake makes its moves.`,
				`3 or more KEYs on a free spin award +${fs.retrigger} free spins, up to ${fs.max} free spins in total.`,
				`In the base game THE HUNT triggers on average once every ${oneIn(base.huntTrigger)} spins, and once every ${oneIn(ante.huntTrigger)} spins with SERPENT CALL on.`,
			],
		},
		{
			id: 'venom',
			title: 'VENOM HUNT',
			paragraphs: [
				`VENOM HUNT can only be bought. It plays like THE HUNT with ${fs.venomSpins} free spins, but the snake enters at length ${fs.venomLength} with a ×${fs.venomMult} multiplier, and Venom PEARLs +10 and +25 can land. Retriggers work as in THE HUNT (+${fs.retrigger}, up to ${fs.max} in total).`,
			],
		},
		{
			id: 'maxwin',
			title: 'MAXIMUM WIN',
			paragraphs: [
				`The maximum win is ${maxWin}× the base bet in every mode, including bought features. When a round's total win reaches ${maxWin}×, the win is capped at ${maxWin}×, the round ends immediately and any remaining free spins or moves are forfeited.`,
			],
		},
		{
			id: 'rtp',
			title: 'RETURN TO PLAYER',
			paragraphs: [
				`Theoretical return to player: BASE GAME ${pct(modeRtp('base'))}, SERPENT CALL ${pct(modeRtp('ante'))}, THE HUNT ${pct(modeRtp('hunt'))}, VENOM HUNT ${pct(modeRtp('venom'))}.`,
				`The expected return is calculated over many plays. It is a long-term statistical average and says nothing about the result of any single round.`,
			],
		},
	];
	return S.map((s) => ({ ...s, title: tx(s.title), paragraphs: s.paragraphs.map(tx) }));
}

export function uiGuide(): { label: string; text: string }[] {
	return [
		{ label: 'SPIN', text: 'Starts a round at the current bet. Press the spacebar to spin. During a round, the spacebar or a tap on the board skips animations.' },
		{ label: '− / +', text: 'Lowers or raises the bet. Tap the bet amount to choose any bet level.' },
		{ label: 'SERPENT CALL', text: `Turns the ante on or off. While it is on, each spin costs ${modeCostText('ante')}× the bet and THE HUNT triggers more often.` },
		{ label: 'BUY', text: 'Opens the feature menu to buy THE HUNT or VENOM HUNT. A purchase must be confirmed.' },
		{ label: 'AUTO', text: 'Opens the autoplay settings. Autoplay starts only after you confirm, and stops when you press STOP or a stop condition is met.' },
		{ label: 'TURBO', text: 'Plays animations faster. It never changes the outcome.' },
		{ label: 'SOUND', text: 'Mutes or unmutes the game.' },
		{ label: 'i', text: 'Opens these game rules.' },
		{ label: 'MENU', text: 'Opens the settings: sound and music volume, turbo and reduced motion.' },
	].map((r) => ({ label: tx(r.label), text: tx(r.text) }));
}

function modeCostText(id: string) {
	return String(mathConfig.modes.find((m) => m.id === id)?.cost ?? 1);
}

export const DISCLAIMER =
	'Malfunction voids all wins and plays. A consistent internet connection is required. In the event of a disconnection, reload the game to finish any uncompleted rounds. The expected return is calculated over many plays. The game display is not representative of any physical device and is for illustrative purposes only. Winnings are settled according to the amount received from the Remote Game Server and not from events within the web browser. CONSTRICTOR™ and © 2026 Studio 12.';

export const disclaimer = () => tx(DISCLAIMER);
