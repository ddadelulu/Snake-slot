import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	logLevel: 'info',
	build: { assetsInlineLimit: 0, sourcemap: false, chunkSizeWarningLimit: 4000 },
	server: { fs: { allow: ['..', '../..', '../../..'] } },
	test: { include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'], environment: 'node' },
});
