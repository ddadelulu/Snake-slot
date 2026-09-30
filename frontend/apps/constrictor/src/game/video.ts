// Hero videos from the asset manifest (`vid_*`, brief §7). They are optional: with no file in `art/final/` the
// game plays its in-engine sequences only. Rules: silent, lazy-loaded after the first spin (the intro only plays
// if it is ready when the player enters), always skippable, skipped in turbo and under reduced motion, and
// never a replacement for the board animation (the OUROBOROS clip is an overlay).

import { getManifest, videoUrl } from './stage/assets';
import { clock } from './stage/clock';

export type VideoId = 'intro' | 'hunt' | 'ouroboros_loop' | 'maxwin';

const FILES: Record<VideoId, [string, string]> = {
	intro: ['vid_intro_16x9', 'vid_intro_9x16'],
	hunt: ['vid_hunt_16x9', 'vid_hunt_9x16'],
	ouroboros_loop: ['vid_ouroboros_loop', 'vid_ouroboros_loop'],
	maxwin: ['vid_maxwin_16x9', 'vid_maxwin_9x16'],
};

const els = new Map<string, HTMLVideoElement>();
let layer: HTMLDivElement | null = null;

const portrait = () => typeof window !== 'undefined' && window.innerHeight > window.innerWidth * 1.1;
const manifestId = (id: VideoId) => {
	const [land, port] = FILES[id];
	const want = portrait() ? port : land;
	return videoUrl(want) ? want : videoUrl(land) ? land : videoUrl(port) ? port : null;
};

export const hasVideos = () => Object.keys(getManifest()?.video ?? {}).length > 0;

function element(mid: string): HTMLVideoElement {
	let v = els.get(mid);
	if (!v) {
		v = document.createElement('video');
		v.src = videoUrl(mid)!;
		v.muted = true;
		v.playsInline = true;
		v.preload = 'auto';
		v.setAttribute('aria-hidden', 'true');
		els.set(mid, v);
	}
	return v;
}

function ensureLayer(): HTMLDivElement {
	if (layer) return layer;
	layer = document.createElement('div');
	layer.className = 'video-layer';
	Object.assign(layer.style, { position: 'fixed', inset: '0', zIndex: '25', pointerEvents: 'none', display: 'grid', placeItems: 'center', background: 'transparent' });
	document.body.appendChild(layer);
	return layer;
}

/** Start loading the hero clips (call after the first spin). */
export function preloadHeroVideos() {
	for (const id of ['hunt', 'ouroboros_loop', 'maxwin'] as VideoId[]) {
		const mid = manifestId(id);
		if (mid) element(mid).load();
	}
}

/** Start loading the intro right away; it only plays if ready when the player enters. */
export function preloadIntro() {
	const mid = manifestId('intro');
	if (mid) element(mid).load();
}

const blocked = () => clock.speed > 1 || clock.reducedMotion || clock.skipping;

/**
 * Play a full-screen clip and resolve when it ends or the player skips (tap / spacebar -> clock.flush).
 * Resolves immediately when there is no clip, it is not loaded yet, or turbo / reduced motion is on.
 */
export function playVideo(id: VideoId, opts: { requireReady?: boolean } = {}): Promise<void> {
	const mid = manifestId(id);
	if (!mid || blocked()) return Promise.resolve();
	const v = element(mid);
	if (opts.requireReady && v.readyState < 3) return Promise.resolve();
	const host = ensureLayer();
	Object.assign(v.style, { width: '100%', height: '100%', objectFit: 'cover', background: '#07080a', mixBlendMode: 'normal', opacity: '1' });
	host.style.pointerEvents = 'auto';
	host.appendChild(v);
	v.loop = false;
	v.currentTime = 0;
	return new Promise((resolve) => {
		const done = () => {
			v.pause();
			v.remove();
			host.style.pointerEvents = 'none';
			v.onended = null;
			v.onerror = null;
			off();
			resolve();
		};
		const off = clock.onFlush(done);
		host.onclick = () => clock.flush();
		v.onended = done;
		v.onerror = done;
		v.play().catch(done);
	});
}

/** Overlay a looping accent (screen blend) while `during` runs; the board animation stays underneath. */
export async function withOverlay<T>(id: VideoId, during: () => Promise<T>): Promise<T> {
	const mid = manifestId(id);
	if (!mid || blocked()) return during();
	const v = element(mid);
	if (v.readyState < 3) return during();
	const host = ensureLayer();
	Object.assign(v.style, { width: '100%', height: '100%', objectFit: 'cover', background: 'transparent', mixBlendMode: 'screen', opacity: '0.75' });
	v.loop = true;
	v.currentTime = 0;
	host.appendChild(v);
	void v.play().catch(() => {});
	try {
		return await during();
	} finally {
		v.pause();
		v.remove();
	}
}
