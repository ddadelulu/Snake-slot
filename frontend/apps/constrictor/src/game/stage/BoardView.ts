// The 7x7 board in "board units" (the board is 1000 x 1000 units, scaled to the DOM slot).
// Presentation only: every symbol shown comes from a book event.

import { Container, Graphics, GraphicsContext, Sprite, Text, Texture } from 'pixi.js';

const shardCtx = new Map<number, GraphicsContext>();
/** Shared (never destroyed) shard shape per colour: shards reuse it instead of owning a context each. */
function shardContext(col: number): GraphicsContext {
	let c = shardCtx.get(col);
	if (!c) {
		c = new GraphicsContext().poly([0, -8, 7, 6, -7, 5]).fill({ color: col });
		shardCtx.set(col, c);
	}
	return c;
}

let dotTex: Texture | null = null;
/** Shared radial soft dot (white, tinted per use). */
export function softDot(): Texture {
	if (dotTex) return dotTex;
	const c = document.createElement('canvas');
	c.width = c.height = 128;
	const g = c.getContext('2d')!;
	const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
	grd.addColorStop(0, 'rgba(255,255,255,1)');
	grd.addColorStop(0.35, 'rgba(255,255,255,0.55)');
	grd.addColorStop(1, 'rgba(255,255,255,0)');
	g.fillStyle = grd;
	g.fillRect(0, 0, 128, 128);
	dotTex = Texture.from(c);
	return dotTex;
}
import type { Cell, SymbolCode } from '../model/bookTypes';
import { PEARL_VALUE, isPearl } from '../model/bookTypes';
import { clock, ease } from './clock';
import { texture } from './assets';

export const BOARD = 1000;
export const INNER = 860;
export const ORIGIN = (BOARD - INNER) / 2;
export const CELL = INNER / 7;

export const center = (c: Cell | [number, number]) => ({ x: ORIGIN + (c[0] + 0.5) * CELL, y: ORIGIN + (c[1] + 0.5) * CELL });
export const idx = (c: Cell | [number, number]) => c[0] * 7 + c[1];

const TEX: Record<string, string> = {
	H1: 'sym_H1', H2: 'sym_H2', H3: 'sym_H3', H4: 'sym_H4', L1: 'sym_L1', L2: 'sym_L2', L3: 'sym_L3', L4: 'sym_L4',
	KEY: 'sym_KEY', EGG: 'sym_EGG', P1: 'pearl_white', P2: 'pearl_gold', P3: 'pearl_rose', P5: 'pearl_black',
	P10: 'pearl_venom', P25: 'pearl_venom_grand',
};
const SYMBOL_SCALE: Record<string, number> = { P1: 0.6, P2: 0.62, P3: 0.64, P5: 0.66, P10: 0.72, P25: 0.8, KEY: 0.92, EGG: 0.84 };
const GEM_COLOR: Record<string, number> = {
	H1: 0x3a2f44, H2: 0xd6a64a, H3: 0x3dff8a, H4: 0xd6a64a, L1: 0xb0122e, L2: 0x3060d0, L3: 0xe0a526, L4: 0x9050c8,
};

class CellView extends Container {
	sym: Sprite;
	tag: Container | null = null;
	code: SymbolCode | 'EMPTY' | null = null;
	empty: Graphics;
	/** Bumped whenever something new takes over the symbol, so a running drop-in stops touching it. */
	anim = 0;
	constructor() {
		super();
		this.empty = new Graphics().circle(0, 0, CELL * 0.3).fill({ color: 0x000000, alpha: 0.28 });
		this.empty.visible = false;
		this.sym = new Sprite();
		this.sym.anchor.set(0.5);
		this.addChild(this.empty, this.sym);
	}
	set(code: SymbolCode | 'EMPTY' | null) {
		this.anim++;
		this.code = code;
		this.empty.visible = code === 'EMPTY';
		if (this.tag) this.tag.visible = false;
		if (!code || code === 'EMPTY') {
			this.sym.visible = false;
			return;
		}
		this.sym.visible = true;
		this.sym.alpha = 1;
		this.sym.texture = texture(TEX[code]);
		const k = ((SYMBOL_SCALE[code] ?? 0.86) * CELL) / Math.max(1, this.sym.texture.width);
		this.sym.scale.set(k);
		this.sym.position.set(0, 0);
		this.sym.rotation = 0;
		if (isPearl(code)) this.showTag(PEARL_VALUE[code], code === 'P10' || code === 'P25');
	}
	// One tag per cell, created once and updated in place (no per-spin Text/Graphics allocations).
	private tagLabel: Text | null = null;
	private tagBg: Graphics | null = null;
	private tagKey = '';
	private showTag(v: number, venom: boolean) {
		if (!this.tag) {
			this.tag = new Container();
			this.tagBg = new Graphics();
			this.tagLabel = new Text({ text: '', style: { fontFamily: 'Archivo', fontWeight: '800', fontSize: CELL * 0.2, fill: 0x1a1208 } });
			this.tagLabel.anchor.set(0.5);
			this.tag.addChild(this.tagBg, this.tagLabel);
			this.tag.position.set(CELL * 0.24, CELL * 0.28);
			this.addChild(this.tag);
		}
		const key = `${v}:${venom}`;
		if (key !== this.tagKey) {
			this.tagKey = key;
			this.tagLabel!.text = `+${v}`;
			this.tagLabel!.style.fill = venom ? 0x07130c : 0x1a1208;
			const w = this.tagLabel!.width + CELL * 0.12, h = CELL * 0.24;
			this.tagBg!
				.clear()
				.roundRect(-w / 2, -h / 2, w, h, h * 0.35)
				.fill({ color: venom ? 0x3dff8a : 0xd9b26f })
				.stroke({ color: venom ? 0x0c4a24 : 0x6b4e22, width: 2 });
		}
		this.tag.visible = true;
		this.tag.alpha = 1;
	}
}

export class BoardView extends Container {
	cells: CellView[] = [];
	private velvet: Sprite;
	private frame: Sprite;
	private cellsLayer = new Container();
	fxUnder = new Container();
	fxOver = new Container();
	snakeLayer = new Container();
	private winLayer = new Container();
	private keyGlows = new Container();

	constructor() {
		super();
		this.velvet = new Sprite(texture('board_velvet'));
		this.velvet.position.set(ORIGIN - 6, ORIGIN - 6);
		this.velvet.width = this.velvet.height = INNER + 12;
		this.frame = new Sprite(texture('board_frame'));
		this.frame.width = this.frame.height = BOARD;
		const grid = new Graphics();
		for (let i = 1; i < 7; i++) {
			grid.moveTo(ORIGIN + i * CELL, ORIGIN).lineTo(ORIGIN + i * CELL, ORIGIN + INNER);
			grid.moveTo(ORIGIN, ORIGIN + i * CELL).lineTo(ORIGIN + INNER, ORIGIN + i * CELL);
		}
		grid.stroke({ color: 0x9c7a45, alpha: 0.08, width: 1 });
		for (let r = 0; r < 7; r++)
			for (let w = 0; w < 7; w++) {
				const cv = new CellView();
				const p = center([r, w]);
				cv.position.set(p.x, p.y);
				this.cells.push(cv);
				this.cellsLayer.addChild(cv);
			}
		// warm pool of light on the velvet (the lamp above the table): gives the velvet depth under the snake
		const pool = new Sprite(softDot());
		pool.anchor.set(0.5);
		pool.position.set(BOARD / 2, BOARD / 2 - CELL * 0.4);
		pool.width = INNER * 1.5;
		pool.height = INNER * 1.25;
		pool.tint = 0xa8b6c8; // a cool pool of moonlight on the velvet (the gems bring the warmth)
		pool.alpha = 0.14;
		const poolMask = new Graphics().rect(ORIGIN, ORIGIN, INNER, INNER).fill(0xffffff);
		pool.mask = poolMask;
		this.addChild(this.velvet, pool, poolMask, grid, this.keyGlows, this.fxUnder, this.cellsLayer, this.winLayer, this.snakeLayer, this.frame, this.fxOver);
	}

	get(c: Cell | [number, number]) {
		return this.cells[idx(c)];
	}

	setAll(board: (SymbolCode | 'EMPTY' | null)[]) {
		board.forEach((code, i) => this.cells[i].set(code));
	}

	/**
	 * Drop a board in, column by column (left to right). Snake cells (null) keep whatever they show.
	 * onColumn(reel, keysSoFar) fires as each column lands (anticipation, sounds).
	 */
	async drop(columns: (SymbolCode | null)[][], onColumn?: (reel: number, keysSoFar: number) => Promise<void> | void, colMs = 90) {
		let keys = 0;
		const fall = CELL * 1.4;
		const tasks: Promise<void>[] = [];
		for (let r = 0; r < 7; r++) {
			const col = columns[r];
			for (let w = 0; w < 7; w++) {
				const cv = this.cells[r * 7 + w];
				const code = col[w];
				if (code === null) continue;
				cv.set(code);
				cv.sym.alpha = 0;
				if (code === 'KEY') keys++;
			}
			const colCells = col.map((code, w) => (code === null ? null : this.cells[r * 7 + w]));
			tasks.push(
				clock.tween(260, (t) => {
					for (const cv of colCells) {
						if (!cv) continue;
						cv.sym.alpha = Math.min(1, t * 2.2);
						cv.sym.position.y = -fall * (1 - t);
						if (cv.tag) cv.tag.alpha = t;
					}
				}, ease.outBack),
			);
			if (onColumn) await onColumn(r, keys);
			await clock.wait(colMs);
		}
		await Promise.all(tasks);
	}

	async eat(c: Cell, ms: number, toward: { x: number; y: number }) {
		const cv = this.get(c);
		cv.anim++;
		if (!cv.sym.visible) {
			cv.set(null);
			return;
		}
		const from = { x: cv.sym.x, y: cv.sym.y };
		const dx = toward.x - cv.x, dy = toward.y - cv.y;
		const s0 = cv.sym.scale.x;
		await clock.tween(ms, (t) => {
			cv.sym.position.set(from.x + dx * t * 0.3, from.y + dy * t * 0.3);
			cv.sym.scale.set(s0 * (1 - 0.8 * t));
			cv.sym.alpha = 1 - t;
			if (cv.tag) cv.tag.alpha = 1 - t;
		}, ease.in);
		cv.set(null);
	}

	emptyCell(c: Cell) {
		this.get(c).set('EMPTY');
	}

	/** A fresh gem falls into a cell the snake just left (the trail never stays empty). */
	async dropIn(c: Cell, code: SymbolCode, ms: number) {
		const cv = this.get(c);
		cv.set(code);
		const my = cv.anim;
		const fall = CELL * 0.8;
		cv.sym.alpha = 0;
		cv.sym.position.y = -fall;
		await clock.tween(ms, (t) => {
			if (cv.anim !== my) return; // eaten again or replaced mid-fall
			cv.sym.alpha = Math.min(1, t * 2.5);
			cv.sym.position.y = -fall * (1 - t);
		}, ease.outBack);
	}

	hideUnderSnake(c: Cell) {
		const cv = this.get(c);
		cv.set(null);
	}

	keyGlow(cells: Cell[], on: boolean) {
		this.keyGlows.removeChildren().forEach((c) => c.destroy());
		if (!on) return;
		for (const c of cells) {
			const p = center(c);
			const g = new Sprite(softDot());
			g.anchor.set(0.5);
			g.position.set(p.x, p.y);
			g.width = g.height = CELL * 1.25;
			g.tint = 0xd9b26f;
			g.alpha = 0.55;
			this.keyGlows.addChild(g);
		}
	}

	async pulseKeys(cells: Cell[]) {
		const views = cells.map((c) => this.get(c));
		await clock.tween(700, (t) => {
			const k = 1 + 0.22 * Math.sin(t * Math.PI);
			for (const v of views) v.scale.set(k);
		}, ease.linear);
	}

	async eggWobble(c: Cell) {
		const cv = this.get(c);
		await clock.tween(520, (t) => (cv.sym.rotation = Math.sin(t * Math.PI * 6) * 0.14 * (1 - t)), ease.linear);
	}

	async eggCrack(c: Cell) {
		const p = center(c);
		const g = new Graphics();
		this.fxOver.addChild(g);
		const lines: [number, number, number, number][] = [
			[0, -0.32, 0.06, -0.12], [0.06, -0.12, -0.05, 0.02], [-0.05, 0.02, 0.08, 0.18], [0.06, -0.12, 0.2, -0.05], [-0.05, 0.02, -0.2, 0.08],
		];
		await clock.tween(420, (t) => {
			g.clear();
			const n = Math.ceil(t * lines.length);
			for (let i = 0; i < n; i++) {
				const [a, b, cc, d] = lines[i];
				g.moveTo(p.x + a * CELL, p.y + b * CELL).lineTo(p.x + cc * CELL, p.y + d * CELL);
			}
			g.stroke({ color: 0x2a2018, width: 3 });
		}, ease.linear);
		await clock.wait(120);
		const cv = this.get(c);
		await clock.tween(200, (t) => {
			cv.sym.alpha = 1 - t;
			cv.sym.scale.set(cv.sym.scale.x * (1 + 0.02));
			g.alpha = 1 - t;
		});
		g.destroy();
		cv.set(null);
	}

	clearWins() {
		// destroy() without options also frees each Graphics' own GraphicsContext (Pixi 8)
		this.winLayer.removeChildren().forEach((c) => c.destroy());
		this.winLayer.alpha = 1;
		for (const cv of this.cells) cv.scale.set(1);
	}

	/** Fade the win outlines out (the snake is leaving: its cells refill, so the outlines no longer fit). */
	async fadeWins(ms: number) {
		if (!this.winLayer.children.length) return;
		await clock.tween(ms, (t) => (this.winLayer.alpha = 1 - t));
		this.clearWins();
	}

	/** Brass outline around the union of each winning cluster. */
	async showWins(clusters: { positions: Cell[]; symbol: string }[], ms: number) {
		this.clearWins();
		const layers: Graphics[] = [];
		for (const cl of clusters) {
			const set = new Set(cl.positions.map((c) => idx(c)));
			const g = new Graphics();
			const glow = new Graphics();
			for (const c of cl.positions) {
				const x0 = ORIGIN + c[0] * CELL, y0 = ORIGIN + c[1] * CELL;
				const edges: [boolean, number, number, number, number][] = [
					[!set.has(idx([c[0], c[1] - 1])) || c[1] === 0, x0, y0, x0 + CELL, y0],
					[!set.has(idx([c[0], c[1] + 1])) || c[1] === 6, x0, y0 + CELL, x0 + CELL, y0 + CELL],
					[!set.has(idx([c[0] - 1, c[1]])) || c[0] === 0, x0, y0, x0, y0 + CELL],
					[!set.has(idx([c[0] + 1, c[1]])) || c[0] === 6, x0 + CELL, y0, x0 + CELL, y0 + CELL],
				];
				for (const [on, a, b, cc, d] of edges) if (on) {
					g.moveTo(a, b).lineTo(cc, d);
					glow.moveTo(a, b).lineTo(cc, d);
				}
			}
			// glow from layered wide strokes of the same outline (no blur filter; each Graphics owns its context)
			for (const [w, a] of [[18, 0.04], [12, 0.06], [8, 0.1]] as const) glow.stroke({ color: 0xffffff, width: w, alpha: a, cap: 'round' });
			glow.tint = GEM_COLOR[cl.symbol] ?? 0xd9b26f;
			g.stroke({ color: 0xd9b26f, width: 5, alpha: 0.95, cap: 'round' });
			this.winLayer.addChild(glow, g);
			layers.push(g, glow);
		}
		const cellsInWins = new Set(clusters.flatMap((cl) => cl.positions.map((c) => idx(c))));
		await clock.tween(ms, (t) => {
			const a = Math.min(1, t * 3);
			for (const l of layers) l.alpha = a;
			const k = 1 + 0.06 * Math.sin(t * Math.PI);
			for (const i of cellsInWins) this.cells[i].scale.set(k);
		}, ease.linear);
	}

	/** OUROBOROS constrict: enclosed symbols shatter into shards, then re-form as one symbol. */
	async constrict(enclosed: Cell[], symbol: SymbolCode, ms: number) {
		const shards = new Container();
		this.fxOver.addChild(shards);
		const parts: { g: Graphics; x: number; y: number; vx: number; vy: number; r: number }[] = [];
		let seed = 7;
		const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647); // cosmetic only
		for (const c of enclosed) {
			const cv = this.get(c);
			const col = cv.code && GEM_COLOR[cv.code as string] ? GEM_COLOR[cv.code as string] : 0x9c7a45;
			cv.sym.visible = false;
			if (cv.tag) cv.tag.visible = false;
			const p = center(c);
			for (let k = 0; k < 9; k++) {
				const g = new Graphics(shardContext(col));
				g.position.set(p.x, p.y);
				shards.addChild(g);
				const a = rnd() * Math.PI * 2;
				parts.push({ g, x: p.x, y: p.y, vx: Math.cos(a) * (40 + rnd() * 90), vy: Math.sin(a) * (40 + rnd() * 90) - 30, r: rnd() * 6 });
			}
		}
		await clock.tween(ms * 0.55, (t) => {
			for (const q of parts) {
				q.g.position.set(q.x + q.vx * t, q.y + q.vy * t + 60 * t * t);
				q.g.rotation = q.r * t;
				q.g.alpha = 1 - t;
			}
		}, ease.out);
		shards.destroy({ children: true });
		for (const c of enclosed) this.get(c).set(symbol);
		const views = enclosed.map((c) => this.get(c));
		await clock.tween(ms * 0.45, (t) => {
			for (const v of views) {
				v.sym.alpha = t;
				v.scale.set(0.4 + 0.6 * t);
			}
		}, ease.outBack);
	}
}
