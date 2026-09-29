import type { StorybookConfig } from '@storybook/sveltekit';

const config: StorybookConfig = {
	stories: ['../src/**/*.stories.svelte'],
	addons: ['@storybook/addon-svelte-csf'],
	framework: { name: '@storybook/sveltekit', options: {} },
	// game assets + real books extracted from the math (math/extract_books.py)
	staticDirs: ['../static', { from: '../dev/books', to: '/dev/books' }],
	core: { disableTelemetry: true },
};

export default config;
