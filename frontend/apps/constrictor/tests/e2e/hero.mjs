// Capture the hero moments frame by frame: the Hunt intro (key, wheel, door, blackness, title) and the max win
// (vault emptied into the serpent, then "THE VAULT IS EMPTY"). Usage: node tests/e2e/hero.mjs [baseUrl] [outDir]
import { chromium } from '@playwright/test';
const base = process.argv[2] ?? 'http://localhost:8080';
const out = process.argv[3] ?? '.';
const post = (p, b) => fetch(`${base}${p}`, { method: 'POST', body: JSON.stringify(b) });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 675 } });
const problems = [];
page.on('pageerror', (e) => problems.push(e.message));
await post('/dev/state', { activeRound: false, balance: 10_000_000_000, currency: 'USD' });
await page.goto(`${base}/?sessionID=hero&rgs_url=${encodeURIComponent(base)}&currency=USD`);
await page.waitForSelector('button.tap');
await page.click('button.tap');
await page.waitForSelector('button.spin');
// 1. Hunt intro
await post('/dev/force', { mode: 'base', category: 'trigger3' });
await page.keyboard.press('Space');
await page.waitForSelector('.door-wrap', { timeout: 120000 });
for (let i = 0; i < 9; i++) {
	await page.screenshot({ path: `${out}/hero_intro_${i}.png` });
	await page.waitForTimeout(380);
}
// let the Hunt finish with skips
for (let k = 0; k < 2000 && (await page.$('button.spin.busy')); k++) { await page.keyboard.press('Space'); await page.waitForTimeout(150); }
// 2. Max win in turbo: rolling buffer of frames until the title shows
await page.click('button[aria-label="TURBO"]');
await post('/dev/force', { mode: 'hunt', category: 'maxWin' });
await page.click('.feat.buy');
await page.click('.card:nth-child(1) .btn.primary');
await page.click('.panel footer .btn.primary');
const buf = [];
const t0 = Date.now();
while (Date.now() - t0 < 900000) {
	buf.push(await page.screenshot());
	if (buf.length > 10) buf.shift();
	if (await page.$('.tier.lvl5')) break;
	await page.waitForTimeout(700);
}
const fs = await import('node:fs');
buf.forEach((b, i) => fs.writeFileSync(`${out}/hero_max_${i}.png`, b));
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/hero_max_title.png` });
console.log(JSON.stringify({ problems, maxFrames: buf.length }));
await browser.close();
