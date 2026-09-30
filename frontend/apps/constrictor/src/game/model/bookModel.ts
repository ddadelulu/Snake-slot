// Pure presentation model: applies book events to a plain state object.
// It never decides outcomes. It only tracks what the book says so the UI (and the soak test) can read it.

import type { Book, BookEvent, Cell, SnakeStep, SymbolCode } from './bookTypes';
import { cellKey } from './bookTypes';

export type CellContent = SymbolCode | 'EMPTY' | null; // null = covered by the snake

export type SnakeState = {
	body: Cell[]; // head first
	mult: number;
};

export type ModelState = {
	gameType: 'basegame' | 'freegame';
	board: CellContent[]; // index = reel * 7 + row
	snake: SnakeState | null;
	keys: Cell[];
	fs: { current: number; total: number } | null;
	feature: 'hunt' | 'venom' | null;
	spinWin: number; // hundredths of the base bet
	totalWin: number;
	featureWin: number;
	capped: boolean;
	bites: number;
	finalWin: number | null;
	lastTier: number;
};

export const initialState = (): ModelState => ({
	gameType: 'basegame',
	board: new Array(49).fill(null),
	snake: null,
	keys: [],
	fs: null,
	feature: null,
	spinWin: 0,
	totalWin: 0,
	featureWin: 0,
	capped: false,
	bites: 0,
	finalWin: null,
	lastTier: 0,
});

/** Snake body after each step (for animation). Index i = body after steps[i]. */
export function bodiesAlongSteps(start: Cell[], steps: SnakeStep[]): Cell[][] {
	const out: Cell[][] = [];
	let body = start.map((c) => [c[0], c[1]] as Cell);
	for (const s of steps) {
		if (s.bite) {
			const tail = body[body.length - 1];
			body = [tail, ...body.slice(0, -1)];
		} else if (s.grow) {
			body = [[s.to[0], s.to[1]], ...body];
		} else {
			body = [[s.to[0], s.to[1]], ...body.slice(0, -1)];
		}
		out.push(body);
	}
	return out;
}

export function applyEvent(prev: ModelState, e: BookEvent): ModelState {
	const s: ModelState = { ...prev, board: prev.board.slice() };
	switch (e.type) {
		case 'reveal': {
			s.gameType = e.gameType;
			for (let r = 0; r < 7; r++) for (let w = 0; w < 7; w++) s.board[r * 7 + w] = e.board[r][w];
			s.keys = e.keys;
			s.spinWin = 0;
			break;
		}
		case 'hatch':
			s.board[cellKey(e.at)] = null;
			s.snake = { body: [e.at], mult: 1 };
			break;
		case 'enterBonus':
			s.feature = e.reason;
			break;
		case 'freeSpinTrigger':
			s.fs = { current: 0, total: e.totalFs };
			s.feature = s.feature ?? 'hunt';
			s.featureWin = 0;
			break;
		case 'snakeEnter':
			s.snake = { body: e.body, mult: e.mult };
			for (const c of e.body) s.board[cellKey(c)] = null;
			break;
		case 'updateFreeSpin':
			s.fs = { current: e.amount, total: e.total };
			break;
		case 'snakeMoves': {
			if (!s.snake) throw new Error('snakeMoves without snake');
			const bodies = bodiesAlongSteps(s.snake.body, e.steps);
			let body = s.snake.body;
			e.steps.forEach((st, i) => {
				const next = bodies[i];
				if (!st.bite && !st.grow) {
					const tail = body[body.length - 1];
					s.board[cellKey(tail)] = st.fill ?? 'EMPTY';
				}
				s.board[cellKey(st.to)] = null;
				body = next;
			});
			const last = e.steps[e.steps.length - 1];
			s.snake = { body, mult: last ? last.mult : s.snake.mult };
			break;
		}
		case 'ouroboros':
			for (const c of e.enclosed) s.board[cellKey(c)] = e.symbol;
			if (s.snake) s.snake = { ...s.snake, mult: e.mult };
			s.bites += 1;
			break;
		case 'snakeWild':
			if (s.snake) s.snake = { body: e.cells, mult: e.mult };
			break;
		case 'winInfo':
			break;
		case 'setWin':
			s.spinWin = e.amount;
			s.lastTier = e.winLevel;
			if (s.gameType === 'freegame') s.featureWin += e.amount;
			break;
		case 'setTotalWin':
			s.totalWin = e.amount;
			break;
		case 'wincap':
			s.capped = true;
			s.totalWin = e.amount;
			break;
		case 'freeSpinRetrigger':
			s.fs = { current: s.fs?.current ?? 0, total: e.totalFs };
			break;
		case 'snakeExit':
			s.snake = null;
			for (const f of e.fill ?? []) s.board[cellKey(f.at)] = f.sym;
			break;
		case 'freeSpinEnd':
			s.featureWin = e.amount;
			break;
		case 'finalWin':
			s.finalWin = e.amount;
			break;
	}
	return s;
}

export function playModel(book: Book): ModelState {
	return book.events.reduce(applyEvent, initialState());
}
