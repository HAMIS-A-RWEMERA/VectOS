import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
    pool: 'forks',
    // @ts-expect-error — Vitest 4 moved poolOptions to top-level; keep here for singleFork with deprecation warning
    poolOptions: process.env.VECTOS_USE_PG ? { forks: { singleFork: true } } : undefined,
    include: ['tests/**/*.test.ts']
  }
});
