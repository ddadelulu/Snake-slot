// Smoke run against the mock RGS: load, enter, spin N times, screenshot, report console/network problems.
// Usage: node tests/e2e/smoke.mjs [baseUrl] [outDir] [spins] [width] [height]
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:8080';
const out = process.argv[3] ?? '.';
const spins = Number(process.argv[4] ?? 3);
const W = Number(process.argv[5] ?? 1200), H = Number(process.argv[6] ?? 675);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const problems = [];
const T0 = Date.now();
page.on('console', (m) => problems.push(`console.${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
page.on('response', (r) => r.status() >= 400 && problems.push(`http ${r.status()}: ${r.url()}`));

await fetch(`${base}/dev/state`, { method: 'POST', body: JSON.stringify({ activeRound: false, balance: 10_000_000_000, currency: 'USD' }) });
await page.goto(`${base}/?sessionID=dev&rgs_url=${encodeURIComponent(base)}&currency=USD&lang=en`);
await page.waitForSelector('button.tap', { timeout: 30000 });
await page.screenshot({ path: `${out}/smoke_loading.png` });
await page.click('button.tap');
await page.waitForSelector('button.spin', { timeout: 10000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/smoke_idle.png` });
// FORCE="base:hatch,base:trigger3" forces showcase books (mock RGS /dev/force) for the first spins.
const forced = (process.env.FORCE ?? '').split(',').filter(Boolean);
const shotEvery = Number(process.env.SHOT_MS ?? 0);
for (let i = 0; i < Math.max(spins, forced.length); i++) {
	if (forced[i]) {
		const [mode, category] = forced[i].split(':');
		await fetch(`${base}/dev/force`, { method: 'POST', body: JSON.stringify({ mode, category }) });
	}
	const mode = forced[i]?.split(':')[0] ?? 'base';
	if (mode === 'hunt' || mode === 'venom') {
		await page.click('.buy-bonus');
		await page.click(`[data-mode="${mode}"]`);
		await page.click('.panel footer .btn.primary');
	} else {
		await page.keyboard.press('Space');
	}
	await page.waitForTimeout(900);
	if (i === 0) await page.screenshot({ path: `${out}/smoke_spinning.png` });
	let n = 0;
	const t0 = Date.now();
	while (await page.$('button.spin.busy')) {
		if (Date.now() - t0 > 400000) throw new Error('round did not finish');
		if (shotEvery) await page.screenshot({ path: `${out}/seq_${i}_${String(n++).padStart(3, '0')}.png` });
		await page.waitForTimeout(shotEvery || 250);
	}
	await page.waitForTimeout(300);
}
await page.screenshot({ path: `${out}/smoke_after.png` });
console.log(JSON.stringify({ problems, ms: Date.now() - T0 }, null, 1));
await browser.close();
