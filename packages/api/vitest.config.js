import { BaseSequencer } from 'vitest/node';
import { defineConfig } from 'vitest/config';

// Schema/seed assertions describe the freshly seeded database, so they run before mutating suites.
class SeedFirstSequencer extends BaseSequencer {
  async sort(files) {
    const sorted = await super.sort(files);
    const rank = (file) => (/[\\/](schema|seed\.[^\\/]+)\.test\.js$/.test(file.moduleId) ? 0 : 1);
    return [...sorted].sort((a, b) => rank(a) - rank(b));
  }
}

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./tests/globalSetup.js'],
    setupFiles: ['./tests/setup.js'],
    // API tests share one database, so files run one at a time.
    fileParallelism: false,
    sequence: { sequencer: SeedFirstSequencer },
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
