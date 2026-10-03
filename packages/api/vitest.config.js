import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./tests/globalSetup.js'],
    setupFiles: ['./tests/setup.js'],
    // API tests share one database, so files run one at a time.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
