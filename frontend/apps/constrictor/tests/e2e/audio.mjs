// Audio QA (art/AUDIO_SPEC.md): decode every shipped audio file with the browser's WebAudio decoder (the one the
// game uses) and check peak level, silence, loop seams and duration against the spec.
// Usage: node tests/e2e/audio.mjs [baseUrl]   (any static server of the build, e.g. the mock RGS)
import { chromium } from '@playwright/test';
const base = process.argv[2] ?? 'http://localhost:8080';
const SPEC = {
	land_1: [0.15], land_2: [0.15], land_3: [0.15], gem_tick: [0.1], key_land: [0.6], heartbeat_loop: [1.6, true], egg_wobble: [0.5],
	egg_crack: [0.4], hatch_hiss: [0.8], tongue_flick: [0.2], gulp: [0.35], mult_tick: [0.2], mult_slam: [0.9],
	ouro_bite: [0.5], constrict_crunch: [1.0], deep_boom: [1.5], cluster_win: [0.7], countup_loop: [1, true], vault_door: [2.5],
	ui_click: [0.05], ui_toggle: [0.05], stinger_strike: [1.5], stinger_constrict: [2], stinger_devour: [2.5], stinger_apex: [3],
	stinger_vault_empty: [4], hunt_intro_sting: [2.5], ouroboros_sting: [2], music_base: [60, true], music_hunt: [60, true],
	music_hunt_layer: [60, true],
};
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
await page.goto(`${base}/favicon.svg`);
const manifest = await (await fetch(`${base}/assets/manifest.json`)).json();
const rows = await page.evaluate(async ({ manifest, base }) => {
	const out = [];
	for (const [id, e] of Object.entries(manifest.audio)) {
		const buf = await (await fetch(`${base}/assets/${e.file}`)).arrayBuffer();
		const ctx = new OfflineAudioContext(2, 44100, 44100);
		const ab = await ctx.decodeAudioData(buf);
		let peak = 0, sum = 0, n = 0;
		for (let c = 0; c < ab.numberOfChannels; c++) {
			const d = ab.getChannelData(c);
			for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; sum += d[i] * d[i]; n++; }
		}
		const d0 = ab.getChannelData(0);
		// loop seam: jump between the last and first samples relative to the typical sample-to-sample step
		let step = 0;
		for (let i = 1; i < d0.length; i += 7) step += Math.abs(d0[i] - d0[i - 1]);
		step /= Math.max(1, Math.floor(d0.length / 7));
		const seam = Math.abs(d0[0] - d0[d0.length - 1]);
		out.push({ id, dur: ab.duration, peakDb: 20 * Math.log10(peak || 1e-9), rmsDb: 10 * Math.log10(sum / n || 1e-12), seamRatio: seam / (step || 1e-9) });
	}
	return out;
}, { manifest, base });
const problems = [];
const notes = [];
for (const r of rows) {
	const [len, loop] = SPEC[r.id] ?? [null, false];
	if (r.peakDb > -0.9) problems.push(`${r.id}: peak ${r.peakDb.toFixed(2)} dBFS > -1`);
	if (r.rmsDb < -60) problems.push(`${r.id}: near-silent (RMS ${r.rmsDb.toFixed(1)} dB)`);
	// spec lengths describe the finals; placeholder tails (reverb) run longer: informational only
	if (len !== null && (r.dur < len * 0.5 || r.dur > Math.max(len * 2.2, len + 0.5))) notes.push(`${r.id}: ${r.dur.toFixed(2)} s vs spec ${len} s`);
	if (loop && r.seamRatio > 12) problems.push(`${r.id}: loop seam jump ${r.seamRatio.toFixed(1)}× the typical step`);
	if (!(r.id in SPEC)) problems.push(`${r.id}: not in AUDIO_SPEC`);
}
for (const id of Object.keys(SPEC)) if (!rows.find((r) => r.id === id)) problems.push(`${id}: missing from the build`);
console.log(rows.map((r) => `${r.id.padEnd(20)} ${r.dur.toFixed(2).padStart(6)} s  peak ${r.peakDb.toFixed(1).padStart(5)} dB  rms ${r.rmsDb.toFixed(1).padStart(6)} dB  seam ${r.seamRatio.toFixed(1)}`).join('\n'));
console.log(JSON.stringify({ files: rows.length, problems, notes }, null, 1));
process.exitCode = problems.length ? 1 : 0;
await browser.close();
