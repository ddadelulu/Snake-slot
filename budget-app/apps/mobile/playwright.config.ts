import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests of the web build against a running Supabase stack (docs/TESTING.md).
 * Build first with the stack's URL and key: `npm run build:web`, then `npm run test:e2e`.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:8081',
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
  },
  projects: [{ name: 'phone', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: 'node e2e/serve.mjs',
    url: 'http://localhost:8081',
    reuseExistingServer: !process.env.CI,
  },
});
