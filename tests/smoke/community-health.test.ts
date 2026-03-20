import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('community health files', () => {
  it('includes contribution, conduct, and security docs', () => {
    expect(existsSync('CONTRIBUTING.md')).toBe(true);
    expect(existsSync('CODE_OF_CONDUCT.md')).toBe(true);
    expect(existsSync('SECURITY.md')).toBe(true);
    expect(readFileSync('SECURITY.md', 'utf8')).toContain('vulnerability');
  });
});
