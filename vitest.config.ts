import { defineConfig, mergeConfig } from 'vitest/config';

import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      include: [
        'tests/**/*.test.ts',
        'tests/**/*.test.tsx',
        'tests/smoke/**/*.test.ts',
        'tests/smoke/**/*.test.tsx',
      ],
      fileParallelism: false,
      setupFiles: ['./src/test/setup.ts'],
      testTimeout: 30_000,
    },
  }),
);
