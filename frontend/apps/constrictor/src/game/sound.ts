// Small WebAudio sound manager: mute, music/sfx volumes, pitch (playbackRate), loops, crossfades.
// Audio starts only after a user gesture (browser autoplay policy). Missing files are ignored silently.

import { clock } from './stage/clock';

type Loop = { src: AudioBufferSourceNode; gain: GainNode };

export class Sound {
	private ctx: AudioContext | null = null;
	private master!: GainNode;
	private musicBus!: GainNode;
	private sfxBus!: GainNode;
	private buffers = new Map<string, AudioBuffer>();
	private urls = new Map<string, string>();
	private loops = new Map<string, Loop>();
	private muted = false;
	private musicVol = 0.6;
	private sfxVol = 0.8;
	private hidden = false;

	register(name: string, url: string) {
		this.urls.set(name, url);
	}

	/** Call from a user gesture. */
	async unlock() {
		if (this.ctx) {
			if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {});
			return;
		}
		const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext) as typeof AudioContext | undefined;
		if (!AC) return;
		this.ctx = new AC();
		this.master = this.ctx.createGain();
		this.musicBus = this.ctx.createGain();
		this.sfxBus = this.ctx.createGain();
		this.musicBus.connect(this.master);
		this.sfxBus.connect(this.master);
		this.master.connect(this.ctx.destination);
		this.apply();
		document.addEventListener('visibilitychange', () => {
			this.hidden = document.hidden;
			this.apply();
		});
		await Promise.all([...this.urls.keys()].map((n) => this.load(n)));
	}

	private async load(name: string) {
		if (!this.ctx || this.buffers.has(name)) return;
		const url = this.urls.get(name);
		if (!url) return;
		try {
			const res = await fetch(url);
			if (!res.ok) return;
			const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
			this.buffers.set(name, buf);
		} catch {
			/* missing or undecodable: stay silent */
		}
	}

	private apply() {
		if (!this.ctx) return;
		const on = !this.muted && !this.hidden ? 1 : 0;
		const t = this.ctx.currentTime;
		this.master.gain.setTargetAtTime(on, t, 0.03);
		this.musicBus.gain.setTargetAtTime(this.musicVol, t, 0.05);
		this.sfxBus.gain.setTargetAtTime(this.sfxVol, t, 0.05);
	}

	setMuted(m: boolean) {
		this.muted = m;
		this.apply();
	}
	setVolumes(music: number, sfx: number) {
		this.musicVol = music;
		this.sfxVol = sfx;
		this.apply();
	}

	play(name: string, opts: { rate?: number; volume?: number; delay?: number } = {}) {
		if (!this.ctx) return;
		// while a skip fast-forwards, every step would fire its sound at once: keep only the win stingers and UI
		if (clock.skipping && !name.startsWith('stinger_') && !name.startsWith('ui_')) return;
		const buf = this.buffers.get(name);
		if (!buf) return;
		const src = this.ctx.createBufferSource();
		src.buffer = buf;
		src.playbackRate.value = opts.rate ?? 1;
		const g = this.ctx.createGain();
		g.gain.value = opts.volume ?? 1;
		src.connect(g).connect(this.sfxBus);
		src.start(this.ctx.currentTime + (opts.delay ?? 0));
	}

	loop(name: string, opts: { music?: boolean; volume?: number; fade?: number } = {}) {
		if (!this.ctx || this.loops.has(name)) return;
		if (clock.skipping && !opts.music) return; // an effect loop would only blip on and off during a skip
		const buf = this.buffers.get(name);
		if (!buf) return;
		const src = this.ctx.createBufferSource();
		src.buffer = buf;
		src.loop = true;
		const g = this.ctx.createGain();
		const target = opts.volume ?? 1;
		g.gain.value = 0;
		g.gain.setTargetAtTime(target, this.ctx.currentTime, (opts.fade ?? 0.3) / 3);
		src.connect(g).connect(opts.music ? this.musicBus : this.sfxBus);
		src.start();
		this.loops.set(name, { src, gain: g });
	}

	loopVolume(name: string, volume: number, fade = 0.4) {
		const l = this.loops.get(name);
		if (!l || !this.ctx) return;
		l.gain.gain.setTargetAtTime(volume, this.ctx.currentTime, fade / 3);
	}

	stop(name: string, fade = 0.25) {
		const l = this.loops.get(name);
		if (!l || !this.ctx) return;
		this.loops.delete(name);
		l.gain.gain.setTargetAtTime(0, this.ctx.currentTime, fade / 3);
		l.src.stop(this.ctx.currentTime + fade + 0.05);
	}

	isLooping(name: string) {
		return this.loops.has(name);
	}
}

export const sound = new Sound();
