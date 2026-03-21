import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { sharedEntrypoint } from '@shared';
import { spacesContract } from '@shared/contracts/spaces';

describe('repo bootstrap', () => {
  it('has server and web entrypoints', () => {
    expect(existsSync('src/server/index.ts')).toBe(true);
    expect(existsSync('src/web/main.tsx')).toBe(true);
  });

  it('resolves shared path aliases under vitest', () => {
    expect(sharedEntrypoint).toBe('jixia-shared-entry');
  });

  it('resolves nested shared contract aliases under vitest', () => {
    expect(spacesContract).toBe('jixia-spaces-contract');
  });

  it('declares runtime web dependencies for the React entrypoint', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      dependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies?.react).toBeTruthy();
    expect(packageJson.dependencies?.['react-dom']).toBeTruthy();
  });
});
