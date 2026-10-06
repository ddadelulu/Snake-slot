import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// a build label (UTC time of the build), shown faintly on the loading screen and in Game Info > Legal, so anyone can
// tell at a glance which upload a server is serving
const d = new Date();
const p = (n) => String(n).padStart(2, '0');
const BUILD_ID = `${d.getUTCFullYear()}.${p(d.getUTCMonth() + 1)}.${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;

export default defineConfig({
	plugins: [sveltekit()],
	define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
	logLevel: 'info',
	// NO_MINIFY=1 keeps readable names for CPU profiles (never for the upload build)
	build: { assetsInlineLimit: 0, sourcemap: false, chunkSizeWarningLimit: 4000, minify: process.env.NO_MINIFY ? false : 'esbuild' },
	server: { fs: { allow: ['..', '../..', '../../..'] } },
	test: { include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'], environment: 'node' },
});
