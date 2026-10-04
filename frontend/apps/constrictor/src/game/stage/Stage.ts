// PixiJS 8 stage: background, guardian, board, snake and effects. Exposes an async presentation API that
// the book event handlers await. It animates book data only.

import { Application, Container, Graphics, Sprite, Texture, TilingSprite, Text } from 'pixi.js';
import type { Cell, SnakeStep, SymbolCode, ClusterWin, BookEventOuroboros } from '../model/bookTypes';
import { isPearl, sameCell } from '../model/bookTypes';
import { BoardView, BOARD, CELL, center, ORIGIN, INNER, softDot } from './BoardView';
import { SnakeView, type Pt } from './SnakeView';
import { clock, ease } from './clock';
import { texture } from './assets';
import { sound } from '../sound';

export type SlotRect = { x: number; y: number; size: number };

function blindsTexture(): Texture {
	const c = document.createElement('canvas');
	c.width = 256;
	c.height = 64;
	const g = c.getContext('2d')!;
	const grd = g.createLinearGradient(0, 0, 0, 64);
	// moonlight through the blinds (D-043: the room is cool; brass and gems stay warm)
	grd.addColorStop(0, 'rgba(170,200,255,0)');
	grd.addColorStop(0.35, 'rgba(170,200,255,0.9)');
	grd.addColorStop(0.62, 'rgba(170,200,255,0.9)');
	grd.addColorStop(0.8, 'rgba(170,200,255,0)');
	g.fillStyle = grd;
	g.fillRect(0, 0, 256, 64);
	return Texture.from(c);
}

export class Stage {
	app = new Application();
	root = new Container();
	private bg = new Sprite();
	private bgPortrait = false;
	private blinds!: TilingSprite;
	private dim = new Graphics();
	private dust = new Container();
	private pointer: { x: number; y: number } | null = null; // desktop mouse only (guardian look)
	private sparks = new Container(); // particle bursts (world space, above the board)
	private sparkList: { s: Sprite; vx: number; vy: number; life: number; age: number; spin: number }[] = [];
	world = new Container(); // board + guardian (camera push target)
	board!: BoardView;
	snake!: SnakeView;
	private guardian = new Container();
	private eyeOpen = 0;
	private slot: SlotRect = { x: 0, y: 0, size: 100 };
	private camZoom = 1;
	private camFocus = { x: BOARD / 2, y: BOARD / 2 };
	private shakeT = 0;
	private wildLabel!: Text;
	wildLabelShows = 0;

	async init(host: HTMLElement) {
		await this.app.init({
			resizeTo: host,
			preference: 'webgl',
			antialias: true,
			backgroundColor: 0x07080a,
			resolution: Math.min(2, window.devicePixelRatio || 1),
			autoDensity: true,
		});
		host.appendChild(this.app.canvas);
		this.app.canvas.style.display = 'block';
		clock.attach(this.app.ticker);
		this.app.stage.addChild(this.root);

		this.bg.texture = texture('bg_landscape');
		this.blinds = new TilingSprite({ texture: blindsTexture(), width: 10, height: 10 });
		this.blinds.blendMode = 'add';
		this.blinds.alpha = 0.07;
		this.dim.rect(0, 0, 10, 10).fill({ color: 0x000000 });
		this.dim.alpha = 0;
		this.root.addChild(this.bg, this.blinds, this.dust, this.world, this.dim);

		this.board = new BoardView();
		this.snake = new SnakeView(CELL);
		this.board.snakeLayer.addChild(this.snake);
		this.buildGuardian();
		this.world.addChild(this.board, this.guardian, this.sparks); // the guardian coils over the frame
		this.wildLabel = new Text({ text: 'WILD', style: { fontFamily: 'Big Shoulders Display', fontWeight: '900', fontSize: 64, fill: 0xd9b26f, letterSpacing: 6 } });
		this.wildLabel.anchor.set(0.5);
		this.wildLabel.alpha = 0;
		this.board.fxOver.addChild(this.wildLabel);
		this.buildDust();

		this.app.ticker.add((tk) => this.tick(tk.deltaMS));
		this.app.stage.eventMode = 'static';
		this.app.stage.hitArea = this.app.screen;
		this.app.stage.on('globalpointermove', (e) => {
			this.pointer = e.pointerType === 'mouse' ? { x: e.global.x, y: e.global.y } : null;
		});
		this.app.renderer.on('resize', () => this.layout());
		this.layout();
	}

	private buildGuardian() {
		// The same serpent draped over the vault frame (static rope): along the left rail and the bottom, head raised
		// at the top-left corner, tail trailing off round the bottom-right corner. Not a closed loop: a perfect ring
		// of even tube read as machine-made.
		const coil = new SnakeView(CELL * 1.25);
		const m = 22, L = BOARD - 22, R = 70;
		// rounded corners are arcs so the mesh never folds
		const path: Pt[] = [];
		const line = (x0: number, y0: number, x1: number, y1: number, n: number) => {
			for (let i = 0; i < n; i++) path.push({ x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * i) / n });
		};
		const arc = (cx: number, cy: number, a0: number, n = 6) => {
			for (let i = 0; i < n; i++) {
				const a = a0 + (Math.PI / 2) * (i / n);
				path.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) });
			}
		};
		// clockwise from the tail (curling just round the bottom-right corner) to the head; reversed below so the
		// head is first
		line(L, L - R - 40, L, L - R, 2);
		arc(L - R, L - R, 0);
		line(L - R, L, m + R, L, 9);
		arc(m + R, L - R, Math.PI / 2);
		line(m, L - R, m, m + 150, 7);
		path.push({ x: m, y: m + 150 });
		coil.setPath(path.reverse());
		coil.alpha = 0.95;
		coil.headScale = 0.82;
		coil.shade = 0.84;
		this.guardian.addChild(coil);
		this.guardianCoil = coil;
	}
	private guardianCoil!: SnakeView;

	private buildDust() {
		for (let i = 0; i < 40; i++) {
			const d = new Graphics().circle(0, 0, 1 + (i % 3)).fill({ color: 0xd2e2ff, alpha: 0.25 });
			d.position.set((i * 97) % 1000, (i * 61) % 1000);
			(d as Graphics & { v?: number }).v = 4 + (i % 7);
			this.dust.addChild(d);
		}
	}

	/** Decorative board shown before the first round (fixed layout, no clusters, not an outcome). */
	showIdleBoard() {
		const S: SymbolCode[] = ['H1', 'L2', 'H3', 'L4', 'H2', 'L1', 'H4', 'L3'];
		const b: SymbolCode[] = [];
		for (let r = 0; r < 7; r++) for (let w = 0; w < 7; w++) b.push(S[(r * 3 + w * 5) % 8]);
		b[3 * 7 + 3] = 'EGG';
		b[1 * 7 + 5] = 'P2';
		b[5 * 7 + 1] = 'KEY';
		this.board.setAll(b);
	}

	/** DOM tells us where the board slot is (CSS px, relative to the canvas). */
	setSlot(rect: SlotRect) {
		this.slot = rect;
		this.layout();
	}

	private layout() {
		const w = this.app.renderer.width / this.app.renderer.resolution;
		const h = this.app.renderer.height / this.app.renderer.resolution;
		const portrait = h > w * 1.05;
		if (portrait !== this.bgPortrait) {
			this.bgPortrait = portrait;
			this.bg.texture = texture(portrait ? 'bg_portrait' : 'bg_landscape');
		}
		const tw = this.bg.texture.width || 1, th = this.bg.texture.height || 1;
		const s = Math.max(w / tw, h / th);
		this.bg.scale.set(s);
		this.bg.position.set((w - tw * s) / 2, (h - th * s) / 2);
		// centred square that covers the viewport at any rotation; bands fall left-high to right-low (~30 deg)
		const side = Math.hypot(w, h) * 1.1;
		this.blinds.width = this.blinds.height = side;
		this.blinds.pivot.set(side / 2, side / 2);
		this.blinds.position.set(w / 2, h / 2);
		this.blinds.rotation = 0.52;
		this.dim.clear().rect(0, 0, w, h).fill({ color: 0x000000 });
		this.applyCamera();
		this.snake.setPixelRatio(this.app.renderer.resolution);
		this.guardianCoil?.setPixelRatio(this.app.renderer.resolution);
	}

	private applyCamera() {
		const k = this.slot.size / BOARD;
		const z = this.camZoom;
		const cx = this.slot.x + this.slot.size / 2, cy = this.slot.y + this.slot.size / 2;
		this.world.scale.set(k * z);
		const sx = this.shakeT > 0 ? Math.sin(clock.time * 90) * this.shakeT * 6 : 0;
		const sy = this.shakeT > 0 ? Math.cos(clock.time * 77) * this.shakeT * 6 : 0;
		this.world.position.set(cx - this.camFocus.x * k * z + sx, cy - this.camFocus.y * k * z + sy);
	}

	private tick(dt: number) {
		this.snake.update(dt);
		this.tickSparks(dt);
		this.guardianCoil.update(dt);
		this.blinds.tilePosition.x += dt * 0.004;
		this.blinds.tilePosition.y += dt * 0.002;
		const w = this.app.renderer.width / this.app.renderer.resolution;
		for (const d of this.dust.children as (Graphics & { v?: number })[]) {
			d.y -= ((d.v ?? 5) * dt) / 1000;
			d.x += Math.sin(clock.time * 0.3 + d.y * 0.01) * 0.05;
			if (d.y < -10) d.y = (this.app.renderer.height / this.app.renderer.resolution) + 10;
			if (d.x > w) d.x = 0;
		}
		this.guardianCoil.eyeGlow = this.eyeOpen;
		this.guardianCoil.lookAt(clock.reducedMotion ? null : this.pointer);
		if (this.shakeT > 0) this.shakeT = Math.max(0, this.shakeT - dt / 400);
		this.applyCamera();
	}

	// ---------------------------------------------------------------- presentation API (async)

	speedMs(normal: number, turbo = normal * 0.4) {
		return clock.speed > 1 ? turbo : normal;
	}

	async anticipation(on: boolean) {
		if (on) sound.loop('heartbeat_loop', { volume: 0.9 });
		else sound.stop('heartbeat_loop');
		await clock.tween(on ? 600 : 300, (t) => {
			this.eyeOpen = on ? t : 1 - t;
			this.dim.alpha = on ? 0.35 * t : 0.35 * (1 - t);
		}, ease.inOut);
	}

	async reveal(board: (SymbolCode | null)[][], keys: Cell[], gameType: string) {
		this.board.clearWins();
		// the post-OUROBOROS venom sheen and the wild glow settle as the next board drops
		const ring0 = this.snake.ring, wild0 = this.snake.wild;
		if (ring0 > 0 || wild0 > 0) void clock.tween(400, (t) => ((this.snake.ring = ring0 * (1 - t)), (this.snake.wild = wild0 * (1 - t))));
		this.board.keyGlow([], false);
		let anticipating = false;
		await this.board.drop(board, async (reel, keysSoFar) => {
			sound.play(`land_${(reel % 3) + 1}`, { volume: 0.5 });
			const colHasKey = board[reel].some((s) => s === 'KEY');
			if (colHasKey) sound.play('key_land', { volume: 0.8 });
			if (keysSoFar === 2 && reel < 6 && !anticipating && gameType === 'basegame') {
				anticipating = true;
				await this.anticipation(true);
			}
			if (anticipating) await clock.wait(this.speedMs(220, 60));
		}, this.speedMs(70, 25));
		if (anticipating) await this.anticipation(false);
		if (keys.length) this.board.keyGlow(keys, true);
	}

	async hatch(at: Cell) {
		sound.play('egg_wobble');
		await this.board.eggWobble(at);
		sound.play('egg_crack');
		await this.board.eggCrack(at);
		sound.play('hatch_hiss', { volume: 0.8 });
		const p = center(at);
		this.snake.setPath([p]);
		this.snake.visible = true;
		await this.snake.enter(this.speedMs(360, 120));
		this.snake.flick();
	}

	async snakeEnter(body: Cell[], edge: string) {
		const pts = body.map((c) => center(c));
		// start off-board beyond the tail edge and slide in along the body path
		this.snake.setPath(pts);
		sound.loop('slither_loop', { volume: 0.5 });
		await this.snake.enter(this.speedMs(900, 300));
		sound.stop('slither_loop');
		void edge;
	}

	async moveSnake(steps: SnakeStep[], onStep: (i: number, st: SnakeStep) => void) {
		const ms = this.speedMs(235, 90);
		sound.loop('slither_loop', { volume: 0.35 });
		let pearlStreak = 0;
		for (let i = 0; i < steps.length; i++) {
			const st = steps[i];
			const to = center(st.to);
			const eatP = st.eat && !st.bite ? this.board.eat(st.to, ms * 0.8, center(st.from)) : Promise.resolve();
			if (st.eat && isPearl(st.eat)) {
				pearlStreak++;
				void this.snake.gulp(ms * 1.2);
				sound.play('gulp', { rate: 1 + 0.12 * (pearlStreak - 1) });
			}
			const tail = this.snake.path[this.snake.path.length - 1];
			await Promise.all([this.snake.step(to, !!st.grow, ms, !!st.bite), eatP]);
			// the cell the tail left gets a fresh gem at once (falls in while the snake keeps moving)
			if (!st.grow && !st.bite && tail) {
				if (st.fill) {
					void this.board.dropIn(this.cellAt(tail), st.fill, ms * 1.1);
					sound.play('gem_tick', { volume: 0.3, rate: 0.92 + 0.04 * (i % 4) });
				}
				else this.board.emptyCell(this.cellAt(tail));
			}
			if (st.eat && isPearl(st.eat)) this.snake.addBulge();
			onStep(i, st);
		}
		sound.stop('slither_loop');
	}

	private cellAt(p: Pt): Cell {
		return [Math.round((p.x - ORIGIN) / CELL - 0.5), Math.round((p.y - ORIGIN) / CELL - 0.5)];
	}

	async ouroboros(ev: BookEventOuroboros, onDouble: () => void) {
		const reduced = clock.reducedMotion;
		sound.play('ouro_bite');
		sound.play('ouroboros_sting', { volume: 0.9 });
		const ringPts = ev.ring.map((c) => center(c));
		const cx = ringPts.reduce((a, p) => a + p.x, 0) / ringPts.length;
		const cy = ringPts.reduce((a, p) => a + p.y, 0) / ringPts.length;
		const prevSpeed = clock.speed;
		if (!reduced && !clock.skipping) clock.speed = Math.min(clock.speed, 1) * 0.55; // slow motion
		await Promise.all([
			reduced ? Promise.resolve() : clock.tween(700, (t) => {
				this.camZoom = 1 + 0.18 * t;
				this.camFocus = { x: BOARD / 2 + (cx - BOARD / 2) * t, y: BOARD / 2 + (cy - BOARD / 2) * t };
			}),
			clock.tween(700, (t) => (this.snake.ring = t), ease.out),
		]);
		clock.speed = prevSpeed;
		sound.play('constrict_crunch');
		const enc = ev.enclosed.map((c) => center(c));
		const ex = enc.reduce((a, p) => a + p.x, 0) / Math.max(1, enc.length);
		const ey = enc.reduce((a, p) => a + p.y, 0) / Math.max(1, enc.length);
		this.burst(ex, ey, 60, [0x3dff8a, 0x9dffc4, 0x1fbf62], 700, 1200, false);
		await this.board.constrict(ev.enclosed, ev.symbol, this.speedMs(1000, 380));
		sound.play('deep_boom');
		sound.play('mult_slam');
		if (!reduced) this.shakeT = 1;
		onDouble();
		await clock.wait(this.speedMs(500, 150));
		await Promise.all([
			reduced ? Promise.resolve() : clock.tween(500, (t) => {
				this.camZoom = 1.18 - 0.18 * t;
				this.camFocus = { x: cx + (BOARD / 2 - cx) * t, y: cy + (BOARD / 2 - cy) * t };
			}),
			clock.tween(900, (t) => (this.snake.ring = 1 - t * 0.7)),
		]);
		void sameCell;
	}

	async showWild(cells: Cell[]) {
		this.snake.wild = 1;
		const first = this.wildLabelShows < 2;
		if (first) {
			const mid = center(cells[Math.floor(cells.length / 2)]);
			// above the body, or below it when the body is on the top row (never under the frame or the plaque)
			const above = mid.y - CELL * 0.6;
			this.wildLabel.position.set(
				Math.min(ORIGIN + INNER - CELL * 0.7, Math.max(ORIGIN + CELL * 0.7, mid.x)),
				above < ORIGIN + CELL * 0.45 ? mid.y + CELL * 0.6 : above,
			);
			this.wildLabelShows++;
		}
		await Promise.all([
			this.snake.glintRun(this.speedMs(520, 220)),
			first ? clock.tween(this.speedMs(900, 400), (t) => (this.wildLabel.alpha = Math.sin(t * Math.PI)), ease.linear) : Promise.resolve(),
		]);
	}

	async showWins(wins: ClusterWin[]) {
		sound.play('cluster_win', { volume: 0.8 });
		await this.board.showWins(wins, this.speedMs(900, 380));
	}

	async snakeExit(fill: { at: Cell; sym: SymbolCode }[] = []) {
		this.snake.wild = 0;
		this.snake.ring = 0;
		const head = this.snake.path[0];
		if (!head) return;
		// slither off the nearest edge, one cell at a time
		const c = this.cellAt(head);
		const dists = [c[0], 6 - c[0], c[1], 6 - c[1]];
		const k = dists.indexOf(Math.min(...dists));
		const dir = [[-1, 0], [1, 0], [0, -1], [0, 1]][k];
		const out: Pt[] = [];
		let cur: [number, number] = [c[0], c[1]];
		const n = this.snake.path.length + dists[k] + 2;
		for (let i = 0; i < n; i++) {
			cur = [cur[0] + dir[0], cur[1] + dir[1]];
			out.push(center(cur));
		}
		sound.loop('slither_loop', { volume: 0.3 });
		// the tail leaves the body cells first to last; each gets its fresh gem as it is uncovered. The win
		// outlines (which counted the wild body) fade as the refill starts, so they never frame fresh gems.
		const ms = this.speedMs(120, 45);
		const drops: Promise<void>[] = fill.length ? [this.board.fadeWins(this.speedMs(300, 120))] : [];
		await this.snake.exitAlong(out, ms, (k) => {
			const f = fill[k];
			if (f) {
				drops.push(this.board.dropIn(f.at, f.sym, this.speedMs(260, 110)));
				sound.play('gem_tick', { volume: 0.22, rate: 0.9 + 0.05 * (k % 3) });
			}
		});
		sound.stop('slither_loop');
		this.snake.setPath([]);
		await Promise.all(drops);
	}

	setSnakeImmediate(cells: Cell[]) {
		this.snake.setPath(cells.map((c) => center(c)));
	}

	clearSnake() {
		this.snake.setPath([]);
		this.snake.wild = 0;
		this.snake.ring = 0;
	}

	/**
	 * Cosmetic particle burst in board units (Math.random is fine here: presentation only, never outcomes).
	 * Skipped entirely under reduced motion.
	 */
	burst(x: number, y: number, n: number, colors: number[], speed = 900, life = 1400, gravity = true) {
		if (clock.reducedMotion || clock.skipping) return;
		for (let i = 0; i < n; i++) {
			const s = new Sprite(softDot());
			s.anchor.set(0.5);
			const size = 10 + Math.random() * 26;
			s.width = s.height = size;
			s.tint = colors[i % colors.length];
			s.blendMode = 'add';
			s.position.set(x, y);
			const a = Math.random() * Math.PI * 2;
			const v = speed * (0.25 + Math.random() * 0.75);
			this.sparks.addChild(s);
			this.sparkList.push({ s, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (gravity ? speed * 0.35 : 0), life: life * (0.6 + Math.random() * 0.4), age: 0, spin: gravity ? 1 : 0 });
		}
	}

	private tickSparks(dt: number) {
		const k = (dt / 1000) * clock.speed;
		for (let i = this.sparkList.length - 1; i >= 0; i--) {
			const p = this.sparkList[i];
			p.age += dt * clock.speed;
			p.vx *= 1 - 1.6 * k;
			p.vy = p.vy * (1 - 1.6 * k) + (p.spin ? 1400 * k : 0);
			p.s.x += p.vx * k;
			p.s.y += p.vy * k;
			const t = p.age / p.life;
			p.s.alpha = t < 0.1 ? t * 10 : Math.max(0, 1 - (t - 0.1) / 0.9);
			if (t >= 1) {
				p.s.destroy();
				this.sparkList.splice(i, 1);
			}
		}
	}

	/**
	 * Max win, "THE VAULT IS EMPTY": every jewel left on the board is drawn into the serpent's mouth (the board
	 * centre when no snake is on the board), nearest first, and the velvet is left empty. Presentation only.
	 */
	async emptyVault() {
		this.board.clearWins();
		const head = this.snake.visible && this.snake.path.length ? this.snake.path[0] : { x: BOARD / 2, y: BOARD / 2 };
		const cells = this.board.cells.filter((cv) => cv.sym.visible);
		if (!cells.length) return;
		const dur = this.speedMs(1500, 520);
		if (clock.reducedMotion) {
			await clock.tween(400, (t) => cells.forEach((cv) => ((cv.sym.alpha = 1 - t), cv.tag && (cv.tag.alpha = 1 - t))));
			cells.forEach((cv) => cv.set(null));
			return;
		}
		sound.play('hatch_hiss', { volume: 0.7 });
		const maxD = Math.max(...cells.map((cv) => Math.hypot(cv.x - head.x, cv.y - head.y)), 1);
		let gulps = 0;
		const gulpTimer = async () => {
			while (gulps < 6 && !clock.skipping) {
				void this.snake.gulp(dur * 0.12);
				sound.play('gulp', { rate: 1 + 0.1 * gulps, volume: 0.8 });
				gulps++;
				await clock.wait(dur * 0.14);
			}
		};
		const pulls = cells.map(async (cv) => {
			const d = Math.hypot(cv.x - head.x, cv.y - head.y);
			await clock.wait((d / maxD) * dur * 0.55);
			const dx = head.x - cv.x, dy = head.y - cv.y;
			const s0 = cv.sym.scale.x;
			await clock.tween(dur * 0.45, (t) => {
				cv.sym.position.set(dx * t, dy * t);
				cv.sym.scale.set(s0 * (1 - 0.85 * t));
				cv.sym.alpha = 1 - t * t;
				if (cv.tag) cv.tag.alpha = 1 - t;
			}, ease.in);
			cv.set(null);
		});
		await Promise.all([Promise.all(pulls), this.snake.visible ? gulpTimer() : Promise.resolve()]);
		sound.play('deep_boom');
		this.shake();
	}

	/** Gold shower for big wins; level 5 = max win. */
	celebrate(level: number) {
		const gold = [0xd9b26f, 0xf3dca6, 0xffe9b8, 0x9c7a45];
		const n = level >= 5 ? 140 : level >= 4 ? 90 : 50;
		this.burst(BOARD / 2, BOARD / 2, n, gold, level >= 5 ? 1500 : 1100, level >= 5 ? 2400 : 1600);
		if (level >= 4) this.shake();
	}

	shake() {
		if (!clock.reducedMotion) this.shakeT = 1;
	}
}

export const INNER_SIZE = INNER;
