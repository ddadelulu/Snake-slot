import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	logLevel: 'info',
	// NO_MINIFY=1 keeps readable names for CPU profiles (never for the upload build)
	build: { assetsInlineLimit: 0, sourcemap: false, chunkSizeWarningLimit: 4000, minify: process.env.NO_MINIFY ? false : 'esbuild' },
	server: { fs: { allow: ['..', '../..', '../../..'] } },
	test: { include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'], environment: 'node' },
});
