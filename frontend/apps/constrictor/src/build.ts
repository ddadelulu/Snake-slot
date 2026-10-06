// The build label stamped by vite.config.js (`define`); "dev" where it is not defined (e.g. Storybook).
declare const __BUILD_ID__: string;
export const BUILD_ID: string = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';
