// Copies the self-hosted OFL fonts into static/fonts and checks the asset manifest exists.
// Assets themselves are built by art/pipeline/build_assets.py (python) and committed.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, '..');
const fonts = join(app, 'static', 'fonts');
mkdirSync(fonts, { recursive: true });
const pick = [
	['@fontsource/archivo/files/archivo-latin-400-normal.woff2', 'archivo-400.woff2'],
	['@fontsource/archivo/files/archivo-latin-600-normal.woff2', 'archivo-600.woff2'],
	['@fontsource/archivo/files/archivo-latin-800-normal.woff2', 'archivo-800.woff2'],
	['@fontsource/josefin-sans/files/josefin-sans-latin-400-normal.woff2', 'josefin-sans-400.woff2'],
	['@fontsource/josefin-sans/files/josefin-sans-latin-600-normal.woff2', 'josefin-sans-600.woff2'],
	['@fontsource/josefin-sans/files/josefin-sans-latin-700-normal.woff2', 'josefin-sans-700.woff2'],
	['@fontsource/limelight/files/limelight-latin-400-normal.woff2', 'limelight-400.woff2'],
];
for (const [src, dst] of pick) cpSync(join(app, 'node_modules', src), join(fonts, dst));
cpSync(join(app, 'node_modules', '@fontsource/archivo/LICENSE'), join(fonts, 'OFL-Archivo.txt'));
cpSync(join(app, 'node_modules', '@fontsource/josefin-sans/LICENSE'), join(fonts, 'OFL-JosefinSans.txt'));
cpSync(join(app, 'node_modules', '@fontsource/limelight/LICENSE'), join(fonts, 'OFL-Limelight.txt'));
if (!existsSync(join(app, 'static', 'assets', 'manifest.json'))) {
	console.error('static/assets/manifest.json missing: run `math/env/bin/python art/pipeline/build_assets.py` from the repo root.');
	process.exit(1);
}
