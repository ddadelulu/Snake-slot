import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      // Enabled by `npm test` (vitest run --coverage); CI fails below 100 %.
      provider: 'v8',
      include: ['src/engine/**/*.ts', 'src/money.ts', 'src/budgetStatus.ts', 'src/sources.ts'],
      exclude: ['src/**/*.test.ts'],
      reporter: ['text', 'html'],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
