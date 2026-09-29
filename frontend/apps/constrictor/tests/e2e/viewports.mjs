// Screenshot every required viewport (brief Appendix B) in idle state; optional query extras.
// Usage: node tests/e2e/viewports.mjs [baseUrl] [outDir] [extraQuery] [prefix]
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:8080';
const out = process.argv[3] ?? '.';
const extra = process.argv[4] ?? '';
const prefix = process.argv[5] ?? 'vp';
export const VIEWPORTS = [
	['desktop', 1200, 675],
	['laptop', 1024, 576],
	['popoutL', 800, 450],
	['popoutS', 400, 225],
	['mobileL', 425, 812],
	['mobileM', 375, 667],
	['mobileS', 320, 568],
];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const problems = [];
for (const [name, w, h] of VIEWPORTS) {
	const page = await browser.newPage({ viewport: { width: w, height: h }, isMobile: h > w, hasTouch: h > w });
	page.on('console', (m) => problems.push(`${name} console.${m.type()}: ${m.text()}`));
	page.on('pageerror', (e) => problems.push(`${name} pageerror: ${e.message}`));
	await page.goto(`${base}/?sessionID=dev&rgs_url=${encodeURIComponent(base)}&lang=en${extra}`);
	await page.waitForSelector('button.tap', { timeout: 30000 });
	await page.click('button.tap');
	await page.waitForTimeout(1200);
	await page.screenshot({ path: `${out}/${prefix}_${name}.png` });
	// horizontal overflow check (no element may stick out of the viewport)
	const overflow = await page.evaluate(() => {
		const bad = [];
		for (const el of document.querySelectorAll('.ui button, .ui .readout, .bar *')) {
			const r = el.getBoundingClientRect();
			if (r.width && (r.right > innerWidth + 1 || r.left < -1 || r.bottom > innerHeight + 1)) bad.push(`${el.className || el.tagName} ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`);
		}
		return bad;
	});
	if (overflow.length) problems.push(`${name} overflow: ${overflow.slice(0, 6).join(' | ')}`);
	await page.close();
}
console.log(JSON.stringify({ problems }, null, 1));
await browser.close();
