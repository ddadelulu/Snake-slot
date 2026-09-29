// Diagnostic: which object types accumulate over N skipped rounds? (heap snapshots via CDP, diff by constructor)
import { chromium } from '@playwright/test';
const base = process.argv[2] ?? 'http://localhost:8080';
const N = Number(process.argv[3] ?? 300);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--expose-gc'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
await fetch(`${base}/dev/state`, { method: 'POST', body: JSON.stringify({ activeRound: false, balance: 1_000_000_000_000, currency: 'USD' }) });
await page.goto(`${base}/?sessionID=heap&rgs_url=${encodeURIComponent(base)}&currency=USD`);
await page.waitForSelector('button.tap'); await page.click('button.tap'); await page.waitForSelector('button.spin');
const cdp = await page.context().newCDPSession(page);
async function snapshot() {
	await page.evaluate(() => globalThis.gc?.());
	let chunks = [];
	const onChunk = (e) => chunks.push(e.chunk);
	cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
	await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
	cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk);
	const snap = JSON.parse(chunks.join(''));
	const f = snap.snapshot.meta.node_fields, nf = f.length, types = snap.snapshot.meta.node_types[0];
	const iType = f.indexOf('type'), iName = f.indexOf('name'), iSize = f.indexOf('self_size');
	const agg = new Map();
	for (let i = 0; i < snap.nodes.length; i += nf) {
		const t = types[snap.nodes[i + iType]];
		const name = t === 'object' || t === 'closure' || t === 'array' ? `${t}:${snap.strings[snap.nodes[i + iName]]}` : t;
		const a = agg.get(name) ?? [0, 0];
		a[0]++; a[1] += snap.nodes[i + iSize];
		agg.set(name, a);
	}
	return agg;
}
async function play(n) {
	for (let i = 0; i < n; i++) {
		await page.keyboard.press('Space');
		for (let k = 0; k < 400; k++) { await page.waitForTimeout(120); if (!(await page.$('button.spin.busy'))) break; await page.keyboard.press('Space'); }
	}
}
await play(50);
const a = await snapshot();
await play(N);
const b = await snapshot();
const rows = [...b.entries()].map(([k, [c, s]]) => [k, c - (a.get(k)?.[0] ?? 0), s - (a.get(k)?.[1] ?? 0)]).sort((x, y) => y[2] - x[2]).slice(0, 25);
for (const r of rows) console.log(r[2].toString().padStart(9), r[1].toString().padStart(7), r[0]);
await browser.close();
