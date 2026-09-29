// docs/screenshots: 7 viewports (idle + snake in play), feature shots, social mode, currencies, rules, replay.
// Needs a mock RGS of its own (it switches currencies). Usage: node tests/e2e/screenshots.mjs [baseUrl] [outDir]
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:8081';
const out = process.argv[3] ?? '../../../docs/screenshots';
const post = (p, b) => fetch(`${base}${p}`, { method: 'POST', body: JSON.stringify(b) });
const VIEWPORTS = [['desktop', 1200, 675], ['laptop', 1024, 576], ['popoutL', 800, 450], ['popoutS', 400, 225], ['mobileL', 425, 812], ['mobileM', 375, 667], ['mobileS', 320, 568]];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const problems = [];
const shots = [];

async function open(w, h, query = '', currency = 'USD') {
	await post('/dev/state', { activeRound: false, balance: 10_000_000_000, currency });
	const page = await browser.newPage({ viewport: { width: w, height: h }, isMobile: h > w, hasTouch: h > w });
	page.on('pageerror', (e) => problems.push(`${w}x${h} ${query}: ${e.message}`));
	page.on('console', (m) => problems.push(`${w}x${h} ${query}: console.${m.type()} ${m.text()}`));
	await page.goto(`${base}/?sessionID=shots&rgs_url=${encodeURIComponent(base)}&lang=en&currency=${currency}${query}`);
	await page.waitForSelector('button.tap', { timeout: 30000 });
	await page.click('button.tap');
	await page.waitForTimeout(1200);
	return page;
}
async function shot(page, name) {
	await page.screenshot({ path: `${out}/${name}.png` });
	shots.push(name);
}
async function buy(page, mode) {
	await page.click('.feat.buy');
	await page.click(`.card:nth-child(${mode === 'hunt' ? 1 : 2}) .btn.primary`);
	await page.click('.panel footer .btn.primary');
}

for (const [name, w, h] of VIEWPORTS) {
	const page = await open(w, h);
	await shot(page, `${name}_idle`);
	await post('/dev/force', { mode: 'base', category: 'hatch' });
	await page.keyboard.press('Space');
	await page.waitForTimeout(5500);
	await shot(page, `${name}_hatchling`);
	await page.close();
}
for (const [name, w, h] of [['desktop', 1200, 675], ['mobileM', 375, 667]]) {
	const page = await open(w, h);
	await post('/dev/force', { mode: 'hunt', category: 'ouroboros' });
	await buy(page, 'hunt');
	for (const [t, tag] of [[4500, 'intro'], [16000, 'spin'], [40000, 'later']]) {
		await page.waitForTimeout(t - (tag === 'intro' ? 0 : tag === 'spin' ? 4500 : 16000));
		await shot(page, `${name}_hunt_${tag}`);
	}
	await page.close();
}
{
	const page = await open(1200, 675);
	await post('/dev/force', { mode: 'venom', category: 'tier4' });
	await buy(page, 'venom');
	await page.waitForTimeout(4500);
	await shot(page, 'desktop_venom_intro');
	await page.waitForTimeout(30000);
	await shot(page, 'desktop_venom_play');
	await page.close();
}
for (const [name, w, h] of [['desktop', 1200, 675], ['mobileM', 375, 667]]) {
	const page = await open(w, h, '&social=true', 'XSC');
	await shot(page, `${name}_social_XSC`);
	await page.click('.feat.buy');
	await page.waitForTimeout(400);
	await shot(page, `${name}_social_buy`);
	await page.close();
}
for (const cur of ['JPY', 'XGC', 'EUR', 'BRL']) {
	const page = await open(1200, 675, '', cur);
	await shot(page, `desktop_currency_${cur}`);
	await page.close();
}
{
	const page = await open(1200, 675);
	await page.click('button[aria-label="Game info"]');
	await page.waitForTimeout(400);
	await shot(page, 'desktop_rules');
	for (const tab of ['paytable', 'modes', 'legal']) {
		await page.click(`[role=tab]:nth-child(${['rules', 'paytable', 'modes', 'ui', 'legal'].indexOf(tab) + 1})`);
		await page.waitForTimeout(300);
		await shot(page, `desktop_rules_${tab}`);
	}
	await page.keyboard.press('Escape');
	await page.click('button[aria-label="AUTO"]');
	await page.waitForTimeout(300);
	await shot(page, 'desktop_autoplay');
	await page.close();
}
{
	const showcase = await (await fetch(`${base}/dev/showcase`)).json();
	const ev = showcase.base.tier2[0];
	const page = await browser.newPage({ viewport: { width: 1200, height: 675 } });
	await page.goto(`${base}/?replay=true&game=constrictor&version=1&mode=base&event=${ev}&rgs_url=${encodeURIComponent(base)}`);
	await page.waitForSelector('button.tap');
	await page.click('button.tap');
	await page.waitForTimeout(1000);
	await shot(page, 'desktop_replay');
	await page.close();
}
console.log(JSON.stringify({ shots: shots.length, problems }, null, 1));
await browser.close();
