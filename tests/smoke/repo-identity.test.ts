import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('repository identity scaffold', () => {
  it('will expose the expected top-level files', () => {
    expect(existsSync('package.json')).toBe(true);
    expect(existsSync('tsconfig.json')).toBe(true);
    expect(existsSync('vitest.config.ts')).toBe(true);
  });
});
