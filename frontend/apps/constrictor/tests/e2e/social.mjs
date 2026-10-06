// Social mode (Stake.us) scan: open every screen and popup with social=true and search the visible text
// for restricted words (REQUIREMENTS §7) and for "$". Usage: node tests/e2e/social.mjs [baseUrl] [outDir]
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:8080';
const out = process.argv[3] ?? '.';
// Engine's social-mode list plus a few extras (whole words / phrases, case-insensitive)
const RESTRICTED = ["be awarded to player's accounts", 'place your bets', 'at the cost of', 'bonus buy', 'buy bonus', 'cost of', 'win feature', 'total bet', 'paid out', 'pays out', 'pay out', 'bet/s', 'betting', 'bets', 'bet', 'bought', 'buy', 'purchase', 'cash', 'credit', 'money', 'currency', 'deposit', 'gamble', 'paid', 'payer', 'pays', 'pay', 'stake', 'wager', 'withdraw', 'rebet', 'payout', 'profit', 'paytable', 'pay table', 'loss limit', 'loss streak'];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const scan = (label, text) => {
	const hits = RESTRICTED.filter((w) => new RegExp(`\\b${esc(w)}\\b`, 'i').test(text));
	if (text.includes('$')) hits.push('$');
	return hits.length ? [`${label}: ${hits.join(', ')}`] : [];
};
const post = (path, body) => fetch(`${base}${path}`, { method: 'POST', body: JSON.stringify(body) });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 675 } });
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
await post('/dev/state', { currency: 'XSC', balance: 10_000_000_000, activeRound: false });
await page.goto(`${base}/?sessionID=dev&rgs_url=${encodeURIComponent(base)}&lang=en&social=true&currency=XSC`);
await page.waitForSelector('button.tap');
problems.push(...scan('loading', await page.innerText('body')));
await page.click('button.tap');
await page.waitForTimeout(800);
const text = async () => (await page.innerText('body')) + ' ' + (await page.evaluate(() => [...document.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label')).join(' ')));
problems.push(...scan('main', await text()));
await page.screenshot({ path: `${out}/social_main.png` });
// rules, every tab
await page.click('.menu-btn');
await page.click('[data-act="rules"]');
for (const tab of await page.$$('[role=tab]')) {
	await tab.click();
	problems.push(...scan(`rules/${await tab.innerText()}`, await text()));
}
await page.screenshot({ path: `${out}/social_rules.png` });
await page.keyboard.press('Escape');
// feature menu + confirm
await page.click('.buy-bonus');
await page.waitForTimeout(400);
problems.push(...scan('featureMenu', await text()));
await page.screenshot({ path: `${out}/social_buy.png` });
await page.click('[data-mode="hunt"]');
problems.push(...scan('featureConfirm', await text()));
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');
// ante confirm
await page.click('.buy-bonus');
await page.click('[data-act="ante"]');
problems.push(...scan('anteConfirm', await text()));
await page.keyboard.press('Escape');
// autoplay, settings, bet menu
await page.click('.menu-btn');
await page.click('[data-act="auto"]');
problems.push(...scan('autoplay', await text()));
await page.keyboard.press('Escape');
await page.click('.menu-btn');
await page.click('[data-act="settings"]');
problems.push(...scan('settings', await text()));
await page.keyboard.press('Escape');
await page.click('button.betval');
problems.push(...scan('betMenu', await text()));
await page.keyboard.press('Escape');
// insufficient funds error
await post('/dev/state', { balance: 0 });
await page.reload();
await page.waitForSelector('button.tap');
await page.click('button.tap');
await page.waitForTimeout(500);
await page.keyboard.press('Space');
await page.waitForTimeout(800);
problems.push(...scan('errorIPB', await text()));
await page.screenshot({ path: `${out}/social_error.png` });
await post('/dev/state', { balance: 10_000_000_000, currency: 'USD' });
// replay window
const showcase = await (await fetch(`${base}/dev/showcase`)).json();
const ev = showcase.base?.tier2?.[0] ?? showcase.base?.smallWin?.[0];
await page.goto(`${base}/?replay=true&game=constrictor&version=1&mode=base&event=${ev}&rgs_url=${encodeURIComponent(base)}&social=true`);
await page.waitForSelector('button.tap');
await page.click('button.tap');
await page.waitForTimeout(800);
problems.push(...scan('replay', await text()));
await page.screenshot({ path: `${out}/social_replay.png` });
console.log(JSON.stringify({ problems }, null, 1));
await browser.close();
