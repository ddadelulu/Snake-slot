// High-density screens (Retina, phones): the room must fill the whole screen at every device pixel ratio.
// A Pixi 8 unit mix-up once sized the stage by renderer.width / resolution, which halved the room at DPR 2 and left
// the right side black. Checks the right-hand strip (the vault door behind the logo) and the bottom-left corner are
// drawn room, not the flat backdrop, at DPR 1, 2 and 3.
// Usage: node tests/e2e/hidpi.mjs [baseUrl]
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:8080';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const problems = [];
const rows = [];
const probe = await browser.newPage();
for (const [name, W, H] of [['desktop', 1000, 600], ['phone', 390, 844]]) {
	for (const dpr of [1, 2, 3]) {
		const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: dpr });
		const page = await ctx.newPage();
		page.on('pageerror', (e) => problems.push(`${name}@${dpr}x: ${e.message}`));
		await fetch(`${base}/dev/state`, { method: 'POST', body: JSON.stringify({ activeRound: false, balance: 10_000_000_000, currency: 'USD' }) });
		await page.goto(`${base}/?sessionID=dev&rgs_url=${encodeURIComponent(base)}&currency=USD&lang=en`);
		await page.waitForSelector('button.tap', { timeout: 30000 });
		await page.click('button.tap');
		await page.waitForSelector('button.spin', { timeout: 10000 });
		await page.waitForTimeout(1200);
		const png = (await page.screenshot()).toString('base64');
		await ctx.close();
		// regions as fractions of the screen: [x0, y0, x1, y1]
		const regions = name === 'desktop' ? { right: [0.86, 0.12, 0.98, 0.42], bottomLeft: [0.02, 0.62, 0.14, 0.78] } : { right: [0.8, 0.02, 0.98, 0.1], bottomLeft: [0.02, 0.72, 0.2, 0.8] };
		const stats = await probe.evaluate(async ({ png, regions }) => {
			const img = new Image();
			img.src = `data:image/png;base64,${png}`;
			await img.decode();
			const c = document.createElement('canvas');
			c.width = img.width;
			c.height = img.height;
			const g = c.getContext('2d');
			g.drawImage(img, 0, 0);
			const out = {};
			for (const [k, [x0, y0, x1, y1]] of Object.entries(regions)) {
				const d = g.getImageData(Math.round(x0 * c.width), Math.round(y0 * c.height), Math.round((x1 - x0) * c.width), Math.round((y1 - y0) * c.height)).data;
				let s = 0, s2 = 0, n = 0;
				for (let i = 0; i < d.length; i += 4) {
					const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
					s += l; s2 += l * l; n++;
				}
				const mean = s / n;
				out[k] = { mean: Math.round(mean * 10) / 10, std: Math.round(Math.sqrt(Math.max(0, s2 / n - mean * mean)) * 10) / 10 };
			}
			return out;
		}, { png, regions });
		rows.push({ view: name, dpr, ...stats });
		for (const [k, v] of Object.entries(stats)) {
			// the flat backdrop is ~#07080a with no texture; drawn room has light and detail
			if (v.mean < 14 || v.std < 3) problems.push(`${name}@${dpr}x: ${k} looks empty (mean ${v.mean}, std ${v.std})`);
		}
	}
}
console.log(JSON.stringify({ rows, problems }, null, 1));
process.exitCode = problems.length ? 1 : 0;
await browser.close();
