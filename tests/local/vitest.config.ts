import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/local/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 60_000,
    // Run test files sequentially — they share a database
    fileParallelism: false,
  },
});
