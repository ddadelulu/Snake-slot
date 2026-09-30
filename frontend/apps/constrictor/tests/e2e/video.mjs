// Hero-video layer check (brief §7): with clips in the manifest, the Hunt trigger plays its clip full screen,
// spacebar skips it, turbo skips it entirely, and the round completes either way.
// Usage: node tests/e2e/video.mjs [baseUrl]   (a build whose manifest has vid_* entries)
import { chromium } from '@playwright/test';
const base = process.argv[2] ?? 'http://localhost:8082';
const post = (p, b) => fetch(`${base}${p}`, { method: 'POST', body: JSON.stringify(b) });
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 675 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await post('/dev/state', { activeRound: false, balance: 10_000_000_000, currency: 'USD' });
await page.goto(`${base}/?sessionID=vid&rgs_url=${encodeURIComponent(base)}&currency=USD`);
await page.waitForSelector('button.tap');
await page.click('button.tap');
await page.waitForSelector('button.spin');
// the intro clip plays after the tap when it is already loaded; let it finish (it is 3 s here)
const introSeen = await page.waitForSelector('.video-layer video', { timeout: 3000 }).then(() => true).catch(() => false);
check('intro clip plays after entering (when loaded)', introSeen);
for (let k = 0; k < 100 && (await page.$('.video-layer video')); k++) await page.waitForTimeout(200);
async function finish() {
	for (let k = 0; k < 3000 && (await page.$('button.spin.busy')); k++) { await page.keyboard.press('Space'); await page.waitForTimeout(120); }
}
// normal speed: the clip appears at the trigger, and Space skips it
await post('/dev/force', { mode: 'base', category: 'trigger3' });
await page.keyboard.press('Space');
const vid = await page.waitForSelector('.video-layer video', { timeout: 120000 }).then(() => true).catch(() => false);
check('Hunt trigger plays the clip', vid);
const playing = vid && (await page.$eval('.video-layer video', (v) => !v.paused || v.currentTime > 0).catch(() => false));
check('clip is playing', playing);
await page.keyboard.press('Space');
await page.waitForTimeout(600);
check('spacebar skips the clip', !(await page.$('.video-layer video')));
await finish();
check('round completes after the clip', !(await page.$('button.spin.busy')));
// turbo: no clip
await page.click('.menu-btn');
await page.click('[data-act="speed"]');
await page.click('.menu-btn');
await post('/dev/force', { mode: 'base', category: 'trigger3' });
await page.keyboard.press('Space');
let seen = false;
for (let k = 0; k < 400 && (await page.$('button.spin.busy')); k++) {
	if (await page.$('.video-layer video')) seen = true;
	await page.waitForTimeout(100);
	if (k % 5 === 4) await page.keyboard.press('Space');
}
check('turbo never shows the clip', !seen);
check('no page errors', errors.length === 0, errors.join(' | '));
console.log(JSON.stringify(results, null, 1));
await browser.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
