// Compliance flows against the mock RGS (REQUIREMENTS §4, §6):
//  1. refresh mid-round -> the unfinished round is shown and settled (end-round), bet level kept;
//  2. bet replay -> mode / bet / cost multiplier / real cost shown, no wallet calls, no way into normal play;
//  3. insufficient balance -> error dialog, no play request accepted.
// Usage: node tests/e2e/compliance.mjs [baseUrl] [outDir]
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:8080';
const out = process.argv[3] ?? '.';
const post = (p, b) => fetch(`${base}${p}`, { method: 'POST', body: JSON.stringify(b) });
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1024, height: 576 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => errors.push(`console.${m.type()}: ${m.text()}`));
const url = `${base}/?sessionID=comp&rgs_url=${encodeURIComponent(base)}&currency=USD`;

// 1. resume ---------------------------------------------------------------------------------------
await post('/dev/state', { activeRound: false, balance: 100_000_000_000, currency: 'USD' });
await page.goto(url);
await page.waitForSelector('button.tap');
await page.click('button.tap');
await page.waitForSelector('button.spin');
await page.click('button[aria-label="Increase bet"]');
const betBefore = await page.$eval('.betval .val', (e) => e.textContent.trim());
await post('/dev/force', { mode: 'base', category: 'tier2' });
await page.keyboard.press('Space');
await page.waitForTimeout(1500);
let st = await (await fetch(`${base}/dev/last`)).json();
check('winning round is open on the server mid-animation', st.active, JSON.stringify(st.last));
await page.reload();
await page.waitForSelector('button.tap');
await page.click('button.tap');
const resumeShown = await page.waitForSelector('[role=dialog]', { timeout: 8000 }).then(() => true).catch(() => false);
check('resume notice shown after refresh', resumeShown);
const t0 = Date.now();
while (Date.now() - t0 < 180_000) {
	st = await (await fetch(`${base}/dev/last`)).json();
	if (!st.active) break;
	await page.keyboard.press('Space');
	await page.waitForTimeout(500);
}
check('resumed round settled with end-round', !st.active);
await page.waitForFunction(() => !document.querySelector('button.spin.busy'), null, { timeout: 60000 }).catch(() => {});
const betAfter = await page.$eval('.betval .val', (e) => e.textContent.trim());
check('bet level kept across refresh', betAfter === betBefore, `${betBefore} -> ${betAfter}`);
const bal = await page.$eval('.readout:not(.win) .val', (e) => e.textContent.trim());
const expBal = '$' + (Math.floor(st.balance / 10_000) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
check('balance matches the server after resume', bal === expBal, `${bal} vs ${expBal}`);

// 2. replay ---------------------------------------------------------------------------------------
const showcase = await (await fetch(`${base}/dev/showcase`)).json();
const ev = showcase.hunt.tier3?.[0] ?? showcase.hunt.tier2[0];
const wallet = [];
page.on('request', (r) => r.url().includes('/wallet/') && wallet.push(r.url()));
await page.goto(`${base}/?replay=true&game=constrictor&version=1&mode=hunt&event=${ev}&rgs_url=${encodeURIComponent(base)}&amount=2000000&currency=USD`);
await page.waitForSelector('button.tap');
await page.click('button.tap');
await page.waitForSelector('.panel h2');
const panel = await page.innerText('.panel');
await page.screenshot({ path: `${out}/compliance_replay.png` });
check('replay shows mode', /THE HUNT/.test(panel), panel.replace(/\n/g, ' | '));
check('replay shows bet amount', panel.includes('$2.00'));
check('replay shows cost multiplier', panel.includes('100×'));
check('replay shows real cost', panel.includes('$200.00'));
check('replay has no spin / bet controls', !(await page.$('button.spin')) && !(await page.$('.betval')));
await page.click('.panel .btn.primary');
const r0 = Date.now();
while (Date.now() - r0 < 300_000) {
	if (await page.$('.panel h2')) break;
	await page.keyboard.press('Space');
	await page.waitForTimeout(400);
}
const done = await page.innerText('.panel').catch(() => '');
check('replay completes and offers play again', /PLAY AGAIN/.test(done), done.replace(/\n/g, ' | '));
check('replay made no wallet calls', wallet.length === 0, wallet.join(','));

// 3. insufficient balance ------------------------------------------------------------------------
await post('/dev/state', { activeRound: false, balance: 50_000, currency: 'USD' });
await page.goto(url);
await page.waitForSelector('button.tap');
await page.click('button.tap');
await page.waitForSelector('button.spin');
await page.keyboard.press('Space');
const dlg = await page.waitForSelector('[role=dialog]', { timeout: 5000 }).then((d) => d.innerText()).catch(() => '');
check('insufficient balance shows an error', /Insufficient balance/i.test(dlg), dlg.replace(/\n/g, ' | '));
await post('/dev/state', { balance: 100_000_000_000 });

check('console clean', errors.length === 0, errors.slice(0, 5).join(' || '));
console.log(JSON.stringify(results, null, 1));
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
