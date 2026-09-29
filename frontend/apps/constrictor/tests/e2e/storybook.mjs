// Render every Storybook story (built storybook-static served on :6006) and report errors; screenshots.
// Usage: node tests/e2e/storybook.mjs [sbUrl] [outDir] [filter]
import { chromium } from '@playwright/test';

const sb = process.argv[2] ?? 'http://localhost:6006';
const out = process.argv[3] ?? '.';
const filter = process.argv[4] ?? '';
const index = await (await fetch(`${sb}/index.json`)).json();
const ids = Object.keys(index.entries).filter((id) => index.entries[id].type === 'story' && id.includes(filter));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const problems = [];
for (const id of ids) {
	const page = await browser.newPage({ viewport: { width: 1200, height: 675 } });
	page.on('pageerror', (e) => problems.push(`${id}: ${e.message}`));
	page.on('console', (m) => m.type() === 'error' && problems.push(`${id}: console.error ${m.text()}`));
	await page.goto(`${sb}/iframe.html?id=${id}&viewMode=story`);
	await page.waitForTimeout(id.startsWith('game-') ? 6000 : 1500);
	await page.screenshot({ path: `${out}/sb_${id}.png` });
	await page.close();
}
console.log(JSON.stringify({ stories: ids.length, problems }, null, 1));
await browser.close();
