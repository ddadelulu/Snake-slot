// Renders the cover-art title (D-055): CONSTRICTOR in the game's Limelight lettering (brass gradient, ink line, hard
// drop), on a transparent background, plus previews that assemble art/cover's layers with a bottom gradient.
// Usage (in frontend/apps/constrictor, after art/pipeline/cover_art.py): node scripts/cover_title.mjs
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const cover = join(app, '..', '..', '..', 'art', 'cover');
const font = readFileSync(join(app, 'static', 'fonts', 'limelight-400.woff2')).toString('base64');
const b64 = (f) => readFileSync(join(cover, f)).toString('base64');
const css = `
@font-face { font-family: Limelight; src: url(data:font/woff2;base64,${font}) format('woff2'); }
html, body { margin: 0; background: transparent; }
.title { display: inline-block; padding: 30px 46px 52px; font: 400 240px/1 Limelight; letter-spacing: 0.05em;
  background: linear-gradient(180deg, #fbe7ab 0%, #e2b85a 45%, #9c7433 55%, #e9c870 100%); -webkit-background-clip: text;
  background-clip: text; color: transparent;
  filter: drop-shadow(9px 0 0 #140d05) drop-shadow(-9px 0 0 #140d05) drop-shadow(0 9px 0 #140d05) drop-shadow(0 -9px 0 #140d05)
    drop-shadow(0 20px 0 rgba(0, 0, 0, 0.7)); }`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 2600, height: 520 } });
await page.setContent(`<style>${css}</style><span class="title">CONSTRICTOR</span>`);
await page.evaluate(() => document.fonts.ready);
const el = await page.$('.title');
const title = await el.screenshot({ omitBackground: true });
writeFileSync(join(cover, 'title.png'), title);
// previews: background + foreground + a bottom gradient + the title, at each ratio
for (const [tag, w, h, titleW, titleY] of [['3x4', 1500, 2000, 0.86, 0.865], ['16x9', 1920, 1080, 0.5, 0.885]]) {
	const p = await browser.newPage({ viewport: { width: w, height: h } });
	await p.setContent(`<style>html,body{margin:0}.s{position:relative;width:${w}px;height:${h}px;overflow:hidden}
	.s img{position:absolute;left:0;top:0;width:100%;height:100%}
	.g{position:absolute;inset:0;background:linear-gradient(180deg,rgba(7,8,10,0) 58%,rgba(7,8,10,.82) 86%,rgba(7,8,10,.95) 100%)}
	.s img.t{position:absolute;left:50%;top:${titleY * 100}%;width:${titleW * 100}%;height:auto;transform:translate(-50%,-50%)}</style>
	<div class="s"><img src="data:image/png;base64,${b64(`background_${tag}.png`)}"><img src="data:image/png;base64,${b64(`foreground_${tag}.png`)}">
	<div class="g"></div><img class="t" style="height:auto" src="data:image/png;base64,${title.toString('base64')}"></div>`);
	await p.waitForTimeout(300);
	writeFileSync(join(cover, `preview_${tag}.png`), await p.screenshot());
	await p.close();
}
console.log('title and previews written to', cover);
await browser.close();
