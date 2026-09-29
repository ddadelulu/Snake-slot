// Own config (not config-svelte): imports the preprocessor and adapter from this app's dependencies so a
// single Vite copy is used (fixes the web-sdk build that never exits; DECISIONS D-011/D-022).
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
	preprocess: vitePreprocess({ style: false }),
	kit: {
		adapter: adapter({ fallback: undefined, strict: true }),
		output: { bundleStrategy: 'inline' },
		paths: { relative: true },
		alias: { $game: 'src/game', $components: 'src/components' },
	},
};
