// Frontend soak over real books (math/extract_books.py sample): every book must replay through the
// presentation model with consistent state. Complements the browser soak (tests/e2e/soak.mjs).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { Book, BookEvent } from '../../src/game/model/bookTypes';
import { applyEvent, initialState, bodiesAlongSteps } from '../../src/game/model/bookModel';

const DIR = path.join(__dirname, '..', '..', 'dev', 'books');
const HANDLED = new Set(['reveal', 'hatch', 'enterBonus', 'freeSpinTrigger', 'snakeEnter', 'updateFreeSpin', 'snakeMoves', 'ouroboros', 'snakeWild', 'winInfo', 'setWin', 'setTotalWin', 'wincap', 'freeSpinRetrigger', 'snakeExit', 'freeSpinEnd', 'finalWin']);
const adj = (a: number[], b: number[]) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;

const modes = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith('.jsonl')) : [];

describe.skipIf(!modes.length)('book soak', () => {
	for (const file of modes) {
		it(`plays every ${file} book consistently`, () => {
			const books: Book[] = fs.readFileSync(path.join(DIR, file), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
			expect(books.length).toBeGreaterThan(100);
			for (const b of books) {
				let s = initialState();
				let lastTotal = 0;
				b.events.forEach((e: BookEvent, i) => {
					expect(HANDLED.has(e.type), `unhandled ${e.type}`).toBe(true);
					expect(e.index).toBe(i);
					if (e.type === 'snakeMoves' && s.snake) {
						const bodies = bodiesAlongSteps(s.snake.body, e.steps);
						e.steps.forEach((st, k) => {
							expect(adj(st.from, st.to), `book ${b.id}: non-adjacent step`).toBe(true);
							const body = bodies[k];
							const keys = new Set(body.map((c) => c[0] * 7 + c[1]));
							expect(keys.size, `book ${b.id}: self-intersecting body`).toBe(body.length);
							for (let j = 1; j < body.length; j++) expect(adj(body[j - 1], body[j])).toBe(true);
							expect(body.length).toBeLessThanOrEqual(20);
						});
						expect(e.steps.length).toBeLessThanOrEqual(e.moves);
					}
					if (e.type === 'setTotalWin') {
						expect(e.amount).toBeGreaterThanOrEqual(lastTotal);
						lastTotal = e.amount;
					}
					s = applyEvent(s, e);
				});
				expect(b.events[b.events.length - 1].type).toBe('finalWin');
				expect(s.finalWin).toBe(b.payoutMultiplier);
				expect(b.payoutMultiplier % 10).toBe(0);
				expect(b.payoutMultiplier).toBeLessThanOrEqual(2_500_000);
				if (s.fs) expect(s.fs.total).toBeLessThanOrEqual(30);
			}
		});
	}
});
