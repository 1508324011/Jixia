import { defineConfig, mergeConfig } from 'vitest/config';

import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'tests/**/*.test.ts', 'tests/**/*.test.tsx', 'tests/smoke/**/*.test.ts', 'tests/smoke/**/*.test.tsx']
    }
  })
);
