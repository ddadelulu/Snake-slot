// Animation clock: every presentation delay goes through here so turbo, skip and reduced motion apply
// everywhere. Purely cosmetic timing; it never influences outcomes.

import type { Ticker } from 'pixi.js';

export type Ease = (t: number) => number;
export const ease = {
	linear: (t: number) => t,
	inOut: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
	out: (t: number) => 1 - Math.pow(1 - t, 3),
	in: (t: number) => t * t * t,
	outBack: (t: number) => {
		const c1 = 1.70158;
		const c3 = c1 + 1;
		return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
	},
	outElastic: (t: number) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};

type Job = { elapsed: number; duration: number; update: (t: number) => void; resolve: () => void; ease: Ease };

class Clock {
	speed = 1; // 1 normal, >1 turbo
	skipping = false; // fast-forward the current round
	reducedMotion = false;
	time = 0; // seconds, free-running (for idle loops)
	private jobs = new Set<Job>();
	private flushListeners = new Set<() => void>();

	/** Called whenever a skip flushes the clock (e.g. to stop a video). Returns an unsubscribe function. */
	onFlush(cb: () => void): () => void {
		this.flushListeners.add(cb);
		return () => this.flushListeners.delete(cb);
	}

	attach(ticker: Ticker) {
		// Real elapsed time (Pixi caps deltaMS at minFPS), so slow devices keep the intended pacing.
		ticker.add((tk) => this.tick(Math.min(250, tk.elapsedMS)));
	}

	tick(dtMs: number) {
		this.time += dtMs / 1000;
		const scaled = this.skipping ? 1e9 : dtMs * this.speed;
		for (const j of [...this.jobs]) {
			j.elapsed += scaled;
			const p = j.duration <= 0 ? 1 : Math.min(1, j.elapsed / j.duration);
			j.update(j.ease(p));
			if (p >= 1) {
				this.jobs.delete(j);
				j.resolve();
			}
		}
	}

	/** Animate over `ms` (scaled by turbo; instant while skipping). */
	tween(ms: number, update: (t: number) => void, e: Ease = ease.inOut): Promise<void> {
		return new Promise((resolve) => {
			if (this.skipping || ms <= 0) {
				update(1);
				resolve();
				return;
			}
			const job: Job = { elapsed: 0, duration: ms, update, resolve, ease: e };
			update(e(0));
			this.jobs.add(job);
		});
	}

	wait(ms: number): Promise<void> {
		return this.tween(ms, () => {});
	}

	/** Finish every running tween now. */
	flush() {
		for (const j of [...this.jobs]) {
			j.update(1);
			this.jobs.delete(j);
			j.resolve();
		}
		for (const cb of [...this.flushListeners]) cb();
	}
}

export const clock = new Clock();
