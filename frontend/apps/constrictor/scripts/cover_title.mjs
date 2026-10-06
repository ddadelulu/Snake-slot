// Renders the cover-art title (D-055): CONSTRICTOR in the game's Limelight lettering (brass gradient, ink line, hard
// drop), on a transparent background. art/pipeline/cover_art.py assembles the previews with it.
// Usage (in frontend/apps/constrictor): node scripts/cover_title.mjs
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const cover = join(app, '..', '..', '..', 'art', 'cover');
const font = readFileSync(join(app, 'static', 'fonts', 'limelight-400.woff2')).toString('base64');
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
console.log('title written to', cover, '(art/pipeline/cover_art.py makes the previews)');
await browser.close();
