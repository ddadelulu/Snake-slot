// Runs the SvelteKit build and exits explicitly (the web-sdk build left a child process alive).
import { build } from 'vite';
process.env.TURBO_TELEMETRY_DISABLED = '1';
try {
	await build();
	process.exit(0);
} catch (e) {
	console.error(e);
	process.exit(1);
}
