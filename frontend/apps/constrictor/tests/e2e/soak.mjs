// Browser soak: N real rounds through the real book handlers (skip on), mixed modes. After every round the
// displayed WIN and BALANCE must match the mock RGS ledger, the console must stay clean and nothing may hang.
// Usage: node tests/e2e/soak.mjs [baseUrl] [rounds] [outDir]
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:8080';
const rounds = Number(process.argv[3] ?? 100);
const out = process.argv[4] ?? '.';
const post = (p, b) => fetch(`${base}${p}`, { method: 'POST', body: JSON.stringify(b) });
const usd = (raw) => '$' + (Math.floor(raw / 10_000) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const problems = [];
page.on('console', (m) => problems.push(`console.${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => problems.push(`requestfailed: ${r.url()}`));
await post('/dev/state', { activeRound: false, balance: 1_000_000_000_000, currency: 'USD' });
const showcase = await (await fetch(`${base}/dev/showcase`)).json();
const modes = Object.keys(showcase);
await page.goto(`${base}/?sessionID=soak&rgs_url=${encodeURIComponent(base)}&currency=USD`);
await page.waitForSelector('button.tap');
await page.click('button.tap');
await page.waitForSelector('button.spin');
const stats = { rounds: 0, byMode: {}, wins: 0, features: 0, mismatches: 0, heapMB: {} };
const heap = async () => page.evaluate(() => { globalThis.gc?.(); return Math.round(performance.memory.usedJSHeapSize / 1e5) / 10; });
const t0 = Date.now();
for (let i = 0; i < rounds; i++) {
	let mode = 'base';
	if (i % 50 === 37 && modes.includes('venom')) mode = 'venom';
	else if (i % 25 === 12 && modes.includes('hunt')) mode = 'hunt';
	else if (i % 10 === 5 && modes.includes('ante')) mode = 'ante';
	// every 7th round: a showcase book (big wins, triggers, max win) instead of a natural draw
	if (i % 7 === 3) {
		const cats = Object.keys(showcase[mode] ?? {});
		if (cats.length) await post('/dev/force', { mode, category: cats[i % cats.length] });
	}
	const anteOn = await page.$eval('.feat.ante', (e) => e.classList.contains('on')).catch(() => false);
	if ((mode === 'ante') !== anteOn && (mode === 'ante' || anteOn)) {
		await page.click('.feat.ante');
		if (mode === 'ante') await page.click('.panel footer .btn.primary');
	}
	if (mode === 'hunt' || mode === 'venom') {
		await page.click('.feat.buy');
		await page.click(`.card:nth-child(${mode === 'hunt' ? 1 : 2}) .btn.primary`);
		await page.click('.panel footer .btn.primary');
	} else {
		await page.keyboard.press('Space');
	}
	const r0 = Date.now();
	while (true) {
		await page.waitForTimeout(150);
		const busy = await page.$('button.spin.busy');
		if (!busy) break;
		await page.keyboard.press('Space'); // skip
		if (Date.now() - r0 > 120_000) {
			problems.push(`round ${i} (${mode}) hung`);
			await page.screenshot({ path: `${out}/soak_hang_${i}.png` });
			break;
		}
	}
	await page.waitForTimeout(100);
	const st = await (await fetch(`${base}/dev/last`)).json();
	const shownWin = await page.$eval('.readout.win .val', (e) => e.textContent.trim()).catch(() => null);
	const shownBal = await page.$eval('.readout:not(.win) .val', (e) => e.textContent.trim()).catch(() => null);
	const expWin = usd((st.last.amount * st.last.payoutMultiplier) / 100);
	if (shownWin !== null && shownWin !== expWin) { stats.mismatches++; problems.push(`round ${i} ${mode} book ${st.last.id}: WIN ${shownWin} != ${expWin}`); }
	if (shownBal !== usd(st.balance)) { stats.mismatches++; problems.push(`round ${i} ${mode}: BALANCE ${shownBal} != ${usd(st.balance)}`); }
	if (st.active) problems.push(`round ${i}: round left active (end-round missing)`);
	const err = await page.$('[role=dialog]');
	if (err) { problems.push(`round ${i}: dialog open: ${(await err.innerText()).slice(0, 80)}`); await page.keyboard.press('Escape'); }
	stats.rounds++;
	if (i === 49) stats.heapMB.afterWarmup = await heap();
	if (i > 49 && i % 100 === 99) stats.heapMB[`r${i + 1}`] = await heap();
	if (i === rounds - 1) stats.heapMB.end = await heap();
	stats.byMode[mode] = (stats.byMode[mode] ?? 0) + 1;
	if (st.last.payoutMultiplier > 0) stats.wins++;
}
stats.seconds = Math.round((Date.now() - t0) / 1000);
console.log(JSON.stringify({ stats, problems: problems.slice(0, 40), problemCount: problems.length }, null, 1));
await browser.close();
process.exit(problems.length ? 1 : 0);
